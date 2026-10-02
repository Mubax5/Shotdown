from __future__ import annotations
import shutil
from typing import Callable
from reportlab.lib.pagesizes import A4, LETTER
from .browser import CaptureArtifacts
from .models import ExportConfig
from .paginate import build_page_images
from .pdf_export import ExportResult, export_pdfs

def _page_ratio(cfg: ExportConfig) -> float:
    page_w,page_h=LETTER if cfg.page_size.upper()=="LETTER" else A4
    return (page_h-2*cfg.margin_pt)/(page_w-2*cfg.margin_pt)

def build_evidence_pdfs(artifacts: CaptureArtifacts,cfg: ExportConfig,progress: Callable[[float,str],None]|None=None)->ExportResult:
    progress=progress or (lambda p,m:None)
    pages_dir=artifacts.session_dir/"pages"
    if pages_dir.exists(): shutil.rmtree(pages_dir)
    progress(.76,"Building PDF pages...")
    pages=build_page_images(artifacts.strip_paths,pages_dir,_page_ratio(cfg),artifacts.header_path)
    progress(.83,f"Optimizing {len(pages)} pages for the file-size cap...")
    result=export_pdfs(pages,artifacts.session_dir/"export_work",cfg)
    result.warnings[:0]=artifacts.warning_messages
    progress(1.0,"Done")
    if not cfg.keep_work_files: shutil.rmtree(artifacts.session_dir,ignore_errors=True)
    return result
