"""Shared data layout for packaged MCP and video commands."""
import os
from pathlib import Path


def data_home():
    explicit = os.environ.get("DSH_CUSTOM_CENTER_DOUYIN_HOME", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    base = Path(os.environ.get("DSH_HOME", "").strip() or Path.home() / ".dsh")
    return (base / "dsh-custom-center" / "douyin").resolve()


HOME = data_home()
CACHE = HOME / "cache"
CONFIG = HOME / "config" / "config.json"
STATE = HOME / "state"
LOGS = HOME / "logs"
MODELS = CACHE / "models"
VENV = HOME / "python" / ".venv"


def state_file(name):
    # Imported unknown files retain their legacy namespace until their owner is known.
    known = {"dm-sticker-attachments.json", ".need-captcha", ".login-browser"}
    return (STATE if name in known else STATE / "legacy") / name
