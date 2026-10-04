# Deployment — Cloudflare Named Tunnel + Custom Domain

Live URLs:

- Web HUD: https://scamguard.parallel-dungeons.site
- API: https://api.parallel-dungeons.site/api/health
- Telegram bot: @S_cam_Guard_AI_bot (polling)

## Arsitektur

Azure VM (no public IP, behind NAT) → Cloudflare Named Tunnel → domain.

```
Browser ──HTTPS──> Cloudflare edge ──tunnel──> cloudflared (systemd) ──> localhost:3000 (frontend)
                                                                     └─> localhost:8000 (backend)
```

## DNS

Domain `parallel-dungeons.site` uses Cloudflare nameservers. Two CNAMEs point to the
tunnel (auto-created with `cloudflared tunnel route dns`, do NOT add A records):

| Name | Type | Content |
|------|------|---------|
| api | CNAME | <tunnel-id>.cfargotunnel.com |
| scamguard | CNAME | <tunnel-id>.cfargotunnel.com |

Existing records preserved (DNS-only for GitHub Pages):

| Name | Type | Content | Proxy |
|------|------|---------|-------|
| @ | A | 2.57.91.91 | Proxied |
| game | A | 185.199.108.153 | DNS only |
| web | A | 185.199.108.153 | DNS only |

## Tunnel setup (reproducible)

```bash
# 1. Authenticate (browser)
cloudflared tunnel login

# 2. Create named tunnel
cloudflared tunnel create scamguard

# 3. Config at ~/.cloudflared/config.yml
#    ingress: api.parallel-dungeons.site -> localhost:8000
#             scamguard.parallel-dungeons.site -> localhost:3000

# 4. Route DNS (creates CNAMEs)
cloudflared tunnel route dns scamguard api.parallel-dungeons.site
cloudflared tunnel route dns scamguard scamguard.parallel-dungeons.site

# 5. Install as service (survives reboot)
sudo cloudflared --config ~/.cloudflared/config.yml service install
```

## Containers (manual docker run — compose has a port-bind race on this VM)

```bash
sudo docker run -d --name scamguard-backend --restart unless-stopped \
  -p 8000:8000 --env-file .env \
  -v hf-cache:/root/.cache/huggingface scamguard-ai-backend:latest

sudo docker run -d --name scamguard-frontend --restart unless-stopped \
  -p 3000:3000 scamguard-ai-frontend:latest

sudo docker run -d --name scamguard-bot --restart unless-stopped \
  --env-file .env scamguard-ai-bot:latest
```

## Frontend rebuild (API URL is baked at build time)

`NEXT_PUBLIC_API_URL` is a build arg, so any API URL change requires a rebuild:

```bash
sudo docker build --build-arg NEXT_PUBLIC_API_URL=https://api.parallel-dungeons.site \
  -t scamguard-ai-frontend:latest ./frontend
sudo docker stop scamguard-frontend && sudo docker rm scamguard-frontend
sudo docker run -d --name scamguard-frontend --restart unless-stopped \
  -p 3000:3000 scamguard-ai-frontend:latest
```
