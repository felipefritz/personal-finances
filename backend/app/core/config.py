from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import field_validator


class Settings(BaseSettings):
    APP_NAME: str = "Finanzas Personales"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    SECRET_KEY: str = "dev-change-me"
    ACCESS_TOKEN_EXPIRE_SECONDS: int = 60 * 60 * 24 * 30
    DEFAULT_LOCAL_USER_EMAIL: str = "local@finanzas.app"
    DEFAULT_LOCAL_USER_PASSWORD: str = "local-dev-password"

    DATABASE_URL: str = "sqlite:///./finanzas.db"
    SEED_ON_STARTUP: bool = False

    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
    ]

    # Scraping bancario
    SCRAPER_ENCRYPTION_KEY: Optional[str] = None
    SCRAPER_HEADLESS: bool = True
    # Canal del navegador: "chrome" usa Google Chrome instalado (menos detectable
    # por Cloudflare que el Chromium empaquetado). Vacío = Chromium de Playwright.
    SCRAPER_BROWSER_CHANNEL: Optional[str] = "chrome"
    SCRAPER_DEBUG_DIR: str = "data/scraper_debug"
    SCRAPER_PROFILES_DIR: str = "data/browser_profiles"
    # Segundos a esperar a que un desafío anti-bot (Cloudflare) se resuelva
    # (automáticamente con Chrome real, o a mano en modo visible).
    SCRAPER_CHALLENGE_WAIT_SECONDS: int = 90
    SCRAPER_FAKE: bool = False  # habilita el banco de prueba para validar el flujo e2e
    BANK_AUTO_SYNC_ENABLED: bool = False
    # 6 h: el scraping hace login real; intervalos cortos son detectables y
    # arriesgan bloqueos. Sync manual disponible desde la UI.
    BANK_AUTO_SYNC_INTERVAL_SECONDS: int = 21600
    BANK_SYNC_STAGGER_SECONDS: int = 45  # pausa entre conexiones en el ciclo background

    model_config = {"env_file": ".env", "extra": "ignore"}

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, v):
        if isinstance(v, str):
            normalized = v.strip().lower()
            if normalized in {"release", "prod", "production"}:
                return False
            if normalized in {"debug", "dev", "development"}:
                return True
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("[") and s.endswith("]"):
                return v
            return [origin.strip() for origin in s.split(",") if origin.strip()]
        return v


settings = Settings()
