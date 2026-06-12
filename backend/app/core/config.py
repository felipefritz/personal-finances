from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import field_validator


class Settings(BaseSettings):
    APP_NAME: str = "Finanzas Personales"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = "sqlite:///./finanzas.db"
    SEED_ON_STARTUP: bool = False

    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Fintoc (se elimina en la fase de scraping; mantenido para arranque transitorio)
    FINTOC_SECRET_KEY: Optional[str] = None
    FINTOC_BASE_URL: str = "https://api.fintoc.com/v1"
    FINTOC_AUTO_SYNC_ENABLED: bool = True
    FINTOC_AUTO_SYNC_INTERVAL_SECONDS: int = 300
    FINTOC_REFRESH_INTENT_ENABLED: bool = True
    FINTOC_REFRESH_INTENT_INTERVAL_SECONDS: int = 300

    model_config = {"env_file": ".env", "extra": "ignore"}

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
