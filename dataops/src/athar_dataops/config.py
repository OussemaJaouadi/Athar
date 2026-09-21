"""Read configuration once at startup, never as an import side effect."""

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    db_path: Path = Field(
        default_factory=lambda: Path.home() / ".local/share/athar/athar.db"
    )
    registry_url: str = "https://startups.smartcapital.tn/?lang=en"
    registry_user_agent: str = "AtharBot/0.1"
    pipeline_timeout_seconds: int = Field(default=300, gt=0)

    @field_validator("db_path")
    @classmethod
    def absolute_database_path(cls, path: Path) -> Path:
        path = path.expanduser()
        if not path.is_absolute():
            raise ValueError(
                "DB_PATH must be absolute so every launch uses the same database"
            )
        return path
