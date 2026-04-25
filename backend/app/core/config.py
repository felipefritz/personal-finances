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

    # LLM
    LLM_PROVIDER: str = "mock"  # mock | openai | ollama
    OPENAI_API_KEY: Optional[str] = None
    MODEL_NAME: str = "gpt-4.1"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"

    # Fintoc
    FINTOC_SECRET_KEY: Optional[str] = None
    FINTOC_BASE_URL: str = "https://api.fintoc.com/v1"

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
