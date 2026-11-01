"""The settings, read from MYAPP_* environment variables or `.env` (docs/conventions.md →
Configuration): every setting is here, with its default, and in `.env.example` as a commented
line at that default (tests/test_config.py holds the two together, #564). MYAPP_ENV_FILE
picks another file; "" reads none, which the tests set, so a test never depends on a
developer's `.env`."""

import os

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PREFIX = "MYAPP_"
ENV_FILE = os.environ.get(f"{ENV_PREFIX}ENV_FILE", ".env") or None


class Settings(BaseSettings):
    """What the app runs with. Secrets are `SecretStr`, so they never appear in a repr or a
    log: `.get_secret_value()` only at the point of use."""

    model_config = SettingsConfigDict(
        env_prefix=ENV_PREFIX, env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore"
    )

    log_level: str = "INFO"
    log_format: str = "text"  # or "json", one object per line (production)
    # A SQLAlchemy-style URL; unset for a project without a database.
    database_url: SecretStr | None = None
