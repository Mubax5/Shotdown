from __future__ import annotations
import json
from dataclasses import fields
from .models import AppSettings,CaptureConfig,ExportConfig,UiConfig
from .paths import SETTINGS_FILE,ensure_dirs

def _filtered(cls, values):
    allowed={f.name for f in fields(cls)}
    return {k:v for k,v in values.items() if k in allowed}

def default_settings():
    return AppSettings(CaptureConfig(),ExportConfig(),UiConfig())

def load_settings():
    ensure_dirs()
    if not SETTINGS_FILE.exists():
        return default_settings()
    try:
        raw=json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        return AppSettings(
            CaptureConfig(**_filtered(CaptureConfig,raw.get("capture",{}))),
            ExportConfig(**_filtered(ExportConfig,raw.get("export",{}))),
            UiConfig(**_filtered(UiConfig,raw.get("ui",{}))),
        )
    except Exception:
        return default_settings()

def save_settings(settings):
    ensure_dirs()
    SETTINGS_FILE.write_text(json.dumps(settings.to_dict(),indent=2,ensure_ascii=False),encoding="utf-8")
