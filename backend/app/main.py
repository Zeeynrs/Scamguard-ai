from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routes import router
from app.config import settings
from app.core.security import SecurityMiddleware

_is_dev = settings.environment.lower() == "development"

app = FastAPI(
    title="ScamGuard Multimodal",
    description="Real-time defense against AI-powered voice & video call scams.",
    version="0.1.0",
    # Hide interactive API docs in production (demo hardening).
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
    openapi_url="/openapi.json" if _is_dev else None,
)

# --- CORS: allow only the configured frontend origins (or * in dev) ---
_origins = ["*"] if _is_dev else [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Rate limiting + optional access-code gate ---
app.add_middleware(
    SecurityMiddleware,
    rate_limit=settings.rate_limit_requests,
    rate_limit_expensive=settings.rate_limit_expensive,
    window=settings.rate_limit_window_seconds,
    access_code=settings.access_code,
)

app.include_router(router, prefix="/api")


# --- Bot webhook setup on startup ---
import logging as _logging
_webhook_logger = _logging.getLogger("scamguard.webhook")


@app.on_event("startup")
async def setup_bot_webhook():
    """Set Telegram webhook URL if BOT_WEBHOOK_URL is configured.

    When set, this replaces the bot container's long-polling role — Telegram
    delivers updates to POST /api/bot/webhook instead.
    """
    if not settings.bot_webhook_url:
        _webhook_logger.info("BOT_WEBHOOK_URL not set; bot webhook mode disabled.")
        return

    try:
        from app.bot import get_webhook_app
        bot_app = await get_webhook_app()
        if not settings.bot_webhook_secret:
            _webhook_logger.warning(
                "BOT_WEBHOOK_SECRET not set — Telegram will not authenticate webhook calls. "
                "Set a strong random secret for production."
            )
        await bot_app.bot.set_webhook(
            url=settings.bot_webhook_url,
            secret_token=settings.bot_webhook_secret or None,
        )
        _webhook_logger.info("Bot webhook set to %s", settings.bot_webhook_url)
    except Exception as e:
        _webhook_logger.error("Failed to set bot webhook: %s", e)


# --- Global exception handler: never leak stack traces, always return clean JSON ---
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    print(f"[error] unhandled on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal analysis error. Please retry."},
    )


@app.get("/")
async def root():
    return {
        "name": "ScamGuard Multimodal",
        "docs": "/docs" if _is_dev else "disabled",
        "health": "/api/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.api_host, port=settings.api_port, reload=True)
