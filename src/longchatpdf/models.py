from __future__ import annotations
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

CaptureMode = Literal["full","current_to_bottom"]
PartPreference = Literal["auto","2","3"]
PageSizeName = Literal["A4","LETTER"]
ThemeMode = Literal["light","dark"]

@dataclass
class CaptureConfig:
    mode: CaptureMode="full"
    selector_override: str=""
    overlap_px: int=180
    scroll_delay_ms: int=650
    media_wait_ms: int=900
    history_timeout_s: int=300
    stable_rounds: int=5
    include_chat_header: bool=True
    viewport_width: int=1280
    viewport_height: int=900
    def to_dict(self): return asdict(self)

@dataclass
class ExportConfig:
    output_dir: str=str(Path.home()/"Desktop")
    output_prefix: str="chat_evidence"
    part_preference: PartPreference="auto"
    max_files: int=3
    max_mb_per_file: float=3.0
    page_size: PageSizeName="A4"
    margin_pt: int=16
    min_scale: float=.48
    min_quality: int=38
    max_quality: int=90
    grayscale: bool=False
    footer_page_numbers: bool=True
    keep_work_files: bool=False
    def to_dict(self): return asdict(self)

@dataclass
class UiConfig:
    theme: ThemeMode="light"
    def to_dict(self): return asdict(self)

@dataclass
class AppSettings:
    capture: CaptureConfig
    export: ExportConfig
    ui: UiConfig
    def to_dict(self):
        return {"capture":self.capture.to_dict(),"export":self.export.to_dict(),"ui":self.ui.to_dict()}
