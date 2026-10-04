#!/usr/bin/env bash
# Safely add a Groq API key to .env WITHOUT it ever appearing in chat/logs.
# Usage:  bash scripts/set-groq-key.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found." >&2
  exit 1
fi

# Read the key silently (no echo, no history)
printf "Tempel Groq API key (gsk_...), lalu Enter: "
read -rs GROQ_KEY
echo

if [[ -z "${GROQ_KEY:-}" ]]; then
  echo "ERROR: key kosong." >&2
  exit 1
fi

if [[ "$GROQ_KEY" != gsk_* ]]; then
  echo "PERINGATAN: key biasanya diawali 'gsk_'. Lanjut tetap? (y/N)"
  read -r ans
  [[ "$ans" =~ ^[Yy]$ ]] || exit 1
fi

# Upsert GROQ_API_KEY
if grep -q '^GROQ_API_KEY=' "$ENV_FILE"; then
  # Use python to avoid sed escaping issues with special chars
  python3 - "$ENV_FILE" "$GROQ_KEY" <<'PY'
import sys
path, key = sys.argv[1], sys.argv[2]
lines = open(path).read().splitlines()
out = []
for ln in lines:
    if ln.startswith("GROQ_API_KEY="):
        out.append(f"GROQ_API_KEY={key}")
    else:
        out.append(ln)
open(path, "w").write("\n".join(out) + "\n")
PY
else
  printf '\nGROQ_API_KEY=%s\n' "$GROQ_KEY" >> "$ENV_FILE"
fi

# Optionally set provider preference (leave OPENAI first so it falls back automatically)
echo "✅ GROQ_API_KEY tersimpan di .env (len=${#GROQ_KEY})."
echo "   Sekarang restart backend:  bash scripts/restart-backend.sh"
