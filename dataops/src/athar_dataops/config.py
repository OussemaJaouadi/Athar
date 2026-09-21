"""Read configuration once at startup, never as an import side effect."""

from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The package lives at <dataops>/src/athar_dataops/config.py, so the .env file
# sits two directories up. Loading it keeps settings available regardless of CWD.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8"
    )
    db_path: Path = Field(
        default_factory=lambda: Path.home() / ".local/share/athar/athar.db"
    )
    registry_url: str = "https://startups.smartcapital.tn/?lang=en"
    registry_user_agent: str = "AtharBot/0.1 (+https://github.com/OussemaJaouadi/Athar)"
    pipeline_timeout_seconds: int = Field(default=300, gt=0)
    theme: Literal["dark", "light"] = "dark"

    @field_validator("db_path")
    @classmethod
    def absolute_database_path(cls, path: Path) -> Path:
        path = path.expanduser()
        if not path.is_absolute():
            raise ValueError(
                "DB_PATH must be absolute so every launch uses the same database"
            )
        return path
