"""Read configuration once at startup, never as an import side effect."""

import stat
import tomllib
from collections.abc import Iterable
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The package lives at <dataops>/src/athar_dataops/config.py, so the .env file
# sits two directories up. Loading it keeps settings available regardless of CWD.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
_PROFILES_FILE = Path(__file__).resolve().parents[2] / ".env.profiles.toml"


@dataclass(frozen=True)
class GroqProfile:
    """A stored Groq credential. Secrets live only in the profiles file; the
    database registry and UI never see the key itself."""

    name: str
    api_key: SecretStr
    model: str | None = None


def load_groq_profiles(path: Path) -> tuple[GroqProfile, ...]:
    """Parse the optional profiles TOML; a missing or malformed file yields no
    profiles so the caller can fall back to the legacy single .env key."""
    if not path.exists():
        return ()
    try:
        with path.open("rb") as handle:
            data = tomllib.load(handle)
    except tomllib.TOMLDecodeError:
        return ()
    profiles = []
    for entry in data.get("profile", []):
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        key = entry.get("api_key")
        model = entry.get("model")
        if not (isinstance(name, str) and name.strip() and isinstance(key, str) and key.strip()):
            continue
        profiles.append(
            GroqProfile(
                name=name.strip(),
                api_key=SecretStr(key),
                model=model if isinstance(model, str) and model.strip() else None,
            )
        )
    return tuple(profiles)


def credential_file_warnings(paths: Iterable[Path]) -> list[str]:
    """Report credential files that accounts other than the owner can read."""
    warnings = []
    for path in paths:
        try:
            mode = stat.S_IMODE(path.stat().st_mode)
        except OSError:
            continue
        if mode & 0o077:
            warnings.append(
                f"warning: {path} is accessible to other accounts "
                f"(mode {mode:03o}); run: chmod 600 {path}"
            )
    return warnings


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8"
    )
    db_path: Path = Field(
        default_factory=lambda: Path.home() / ".local/share/athar/athar.db"
    )
    registry_url: str = "https://startups.smartcapital.tn/?lang=en"
    registry_user_agent: str = "AtharBot/0.1 (+https://github.com/OussemaJaouadi/Athar)"
    registry_max_bytes: int = Field(default=64 * 1024 * 1024, gt=0)
    pipeline_timeout_seconds: int = Field(default=300, gt=0)
    theme: Literal["dark", "light"] = "dark"
    groq_api_key: SecretStr = SecretStr("")
    groq_profile: str = Field(default="default", min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    groq_model: str = "qwen/qwen3.8-27b"
    groq_profiles_path: Path = Field(default_factory=lambda: _PROFILES_FILE)

    @property
    def groq_fingerprint(self) -> str:
        key = self.groq_api_key.get_secret_value()
        return sha256(key.encode()).hexdigest()[:12] if key else "not configured"

    @property
    def groq_marker(self) -> str:
        return f"{self.groq_profile} / {self.groq_fingerprint}"

    @property
    def groq_profiles(self) -> tuple[GroqProfile, ...]:
        """Profiles from the TOML store, or the legacy single .env key."""
        stored = load_groq_profiles(self.groq_profiles_path)
        if stored:
            return stored
        if self.groq_api_key.get_secret_value():
            return (
                GroqProfile(
                    name=self.groq_profile,
                    api_key=self.groq_api_key,
                    model=self.groq_model,
                ),
            )
        return ()

    @field_validator("db_path")
    @classmethod
    def absolute_database_path(cls, path: Path) -> Path:
        path = path.expanduser()
        if not path.is_absolute():
            raise ValueError(
                "DB_PATH must be absolute so every launch uses the same database"
            )
        return path
