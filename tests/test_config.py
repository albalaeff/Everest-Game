"""myapp/config.py, and `.env.example` held to it (#564)."""

import re
from pathlib import Path

import pytest

from myapp.config import ENV_PREFIX, Settings

pytestmark = pytest.mark.unit

ROOT = Path(__file__).resolve().parents[1]
SETTING = re.compile(rf"^(?:# )?({ENV_PREFIX}[A-Z0-9_]+)=", re.M)


def test_settings_come_from_prefixed_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(f"{ENV_PREFIX}LOG_LEVEL", "DEBUG")
    monkeypatch.setenv(f"{ENV_PREFIX}DATABASE_URL", "postgresql://u:secret@localhost/db")

    settings = Settings(_env_file=None)

    assert settings.log_level == "DEBUG"
    assert settings.database_url is not None
    assert "secret" not in repr(settings)  # a SecretStr
    assert settings.database_url.get_secret_value().endswith("@localhost/db")


def test_the_defaults_need_no_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(f"{ENV_PREFIX}LOG_LEVEL", raising=False)

    settings = Settings(_env_file=None)

    assert settings.log_level == "INFO"
    assert settings.database_url is None


def test_env_example_names_every_setting_once() -> None:
    """A setting unset by default is a blank line to fill in; the rest are commented at the
    default, so a copy pins nothing (#564). Every setting is there, and nothing else."""
    text = (ROOT / ".env.example").read_text(encoding="utf-8")
    named = SETTING.findall(text)

    expected = sorted(f"{ENV_PREFIX}{name.upper()}" for name in Settings.model_fields)
    assert sorted(named) == expected
    assert len(named) == len(set(named))
