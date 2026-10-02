from __future__ import annotations

import os
import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from .browser import BrowserWorker, CaptureArtifacts
from .config import load_settings, save_settings
from .models import AppSettings, CaptureConfig, ExportConfig, UiConfig
from .pipeline import build_evidence_pdfs


PALETTES = {
    "light": {
        "bg": "#F6F6F4",
        "card": "#FFFFFF",
        "soft": "#FAFAF8",
        "text": "#171717",
        "muted": "#73736F",
        "border": "#E3E3DF",
        "primary": "#171717",
        "on_primary": "#FFFFFF",
        "primary_hover": "#2B2B2B",
        "progress_track": "#E9E9E5",
        "progress": "#222222",
    },
    "dark": {
        "bg": "#17191B",
        "card": "#202326",
        "soft": "#26292D",
        "text": "#F4F4F3",
        "muted": "#A7AAAE",
        "border": "#34383D",
        "primary": "#F1F2F2",
        "on_primary": "#17191B",
        "primary_hover": "#FFFFFF",
        "progress_track": "#30343A",
        "progress": "#ECEDED",
    },
}


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.settings = load_settings()
        self.worker = BrowserWorker()
        self.app_events = queue.Queue()
        self.export_thread = None

        self.title("Shotdown")
        self.geometry("1080x780")
        self.minsize(940, 700)
        self.protocol("WM_DELETE_WINDOW", self._close)

        self._apply_style()
        self._build()
        self.after(120, self._poll)

    @property
    def p(self):
        return PALETTES.get(self.settings.ui.theme, PALETTES["light"])

    def _apply_style(self):
        p = self.p
        self.configure(bg=p["bg"])

        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure("BG.TFrame", background=p["bg"])
        style.configure("Card.TFrame", background=p["card"])
        style.configure("TLabel", background=p["bg"], foreground=p["text"], font=("Segoe UI", 10))
        style.configure("Card.TLabel", background=p["card"], foreground=p["text"], font=("Segoe UI", 10))
        style.configure("Muted.TLabel", background=p["bg"], foreground=p["muted"], font=("Segoe UI", 9))
        style.configure("MutedCard.TLabel", background=p["card"], foreground=p["muted"], font=("Segoe UI", 9))
        style.configure("Hero.TLabel", background=p["bg"], foreground=p["text"], font=("Segoe UI Semibold", 26))

        style.configure(
            "Shot.TEntry",
            fieldbackground=p["soft"],
            foreground=p["text"],
            insertcolor=p["text"],
            padding=(10, 8),
            bordercolor=p["border"],
        )

        style.configure(
            "Shot.TCombobox",
            fieldbackground=p["soft"],
            background=p["soft"],
            foreground=p["text"],
            arrowcolor=p["muted"],
            padding=(8, 7),
            bordercolor=p["border"],
        )
        style.map(
            "Shot.TCombobox",
            fieldbackground=[("readonly", p["soft"])],
            foreground=[("readonly", p["text"])],
        )

        style.configure(
            "Shot.TCheckbutton",
            background=p["card"],
            foreground=p["text"],
            font=("Segoe UI", 9),
        )
        style.map("Shot.TCheckbutton", background=[("active", p["card"])])

        style.configure(
            "Shot.Horizontal.TProgressbar",
            troughcolor=p["progress_track"],
            background=p["progress"],
            thickness=6,
        )

    def _button(self, parent, text, command, primary=False):
        p = self.p
        bg = p["primary"] if primary else p["card"]
        fg = p["on_primary"] if primary else p["text"]
        hover = p["primary_hover"] if primary else p["soft"]

        button = tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            activebackground=hover,
            activeforeground=fg,
            relief="flat",
            bd=0,
            highlightthickness=1,
            highlightbackground=p["border"],
            font=("Segoe UI Semibold", 9),
            padx=14,
            pady=7,
            cursor="hand2",
        )
        button.bind(
            "<Enter>",
            lambda _e: button.config(bg=hover) if str(button["state"]) != "disabled" else None,
        )
        button.bind(
            "<Leave>",
            lambda _e: button.config(bg=bg) if str(button["state"]) != "disabled" else None,
        )
        return button

    def _build(self):
        p = self.p

        root = ttk.Frame(self, style="BG.TFrame")
        root.pack(fill="both", expand=True, padx=28, pady=24)

        header = ttk.Frame(root, style="BG.TFrame")
        header.pack(fill="x", pady=(0, 18))

        ttk.Label(header, text="Shotdown", style="Hero.TLabel").pack(side="left")

        self._button(
            header,
            "Dark mode" if self.settings.ui.theme == "light" else "Light mode",
            self._toggle_theme,
        ).pack(side="right")

        ttk.Label(
            root,
            text="Capture long WhatsApp conversations and package them into compact, submission-ready PDFs.",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(-14, 18))

        workflow = tk.Frame(
            root,
            bg=p["card"],
            highlightthickness=1,
            highlightbackground=p["border"],
        )
        workflow.pack(fill="x", pady=(0, 16))

        for i in range(3):
            workflow.columnconfigure(i, weight=1)

        self._step(
            workflow,
            0,
            "01",
            "Open WhatsApp",
            "Sign in once and open the conversation you need.",
            "Open WhatsApp",
            self._open,
        )
        self._step(
            workflow,
            1,
            "02",
            "Check conversation",
            "Verify that the real chat scroller can be detected.",
            "Check",
            self._check,
        )
        self._step(
            workflow,
            2,
            "03",
            "Capture and export",
            "Scroll, stitch, compress, split, and verify the PDFs.",
            "Start capture",
            self._capture,
            primary=True,
        )

        nav = tk.Frame(root, bg=p["bg"])
        nav.pack(fill="x", pady=(0, 8))

        tk.Label(
            nav,
            text="Settings",
            bg=p["bg"],
            fg=p["text"],
            font=("Segoe UI Semibold", 11),
        ).pack(side="left")

        self._button(nav, "Capture", lambda: self._show("capture")).pack(side="right")
        self._button(nav, "Export", lambda: self._show("export")).pack(side="right", padx=(0, 6))

        shell = tk.Frame(
            root,
            bg=p["card"],
            highlightthickness=1,
            highlightbackground=p["border"],
        )
        shell.pack(fill="both", expand=True)

        self.export_frame = ttk.Frame(shell, style="Card.TFrame", padding=20)
        self.capture_frame = ttk.Frame(shell, style="Card.TFrame", padding=20)
        self.export_frame.place(relwidth=1, relheight=1)
        self.capture_frame.place(relwidth=1, relheight=1)

        self._build_export()
        self._build_capture()
        self._show("export")

        bottom = ttk.Frame(root, style="BG.TFrame")
        bottom.pack(fill="x", pady=(14, 0))

        self.progress = ttk.Progressbar(
            bottom,
            maximum=100,
            style="Shot.Horizontal.TProgressbar",
        )
        self.progress.pack(fill="x")

        row = ttk.Frame(bottom, style="BG.TFrame")
        row.pack(fill="x", pady=(7, 0))

        self.status = ttk.Label(row, text="Ready", style="Muted.TLabel")
        self.status.pack(side="left")

        self.cancel = self._button(row, "Cancel", self._cancel)
        self.cancel.pack(side="right")
        self.cancel.config(state="disabled")

    def _step(self, parent, column, number, title, description, button_text, command, primary=False):
        p = self.p

        frame = tk.Frame(parent, bg=p["card"])
        frame.grid(row=0, column=column, sticky="nsew", padx=18, pady=18)

        tk.Label(
            frame,
            text=number,
            bg=p["card"],
            fg=p["muted"],
            font=("Segoe UI Semibold", 8),
        ).pack(anchor="w")

        tk.Label(
            frame,
            text=title,
            bg=p["card"],
            fg=p["text"],
            font=("Segoe UI Semibold", 10),
        ).pack(anchor="w", pady=(4, 3))

        tk.Label(
            frame,
            text=description,
            bg=p["card"],
            fg=p["muted"],
            font=("Segoe UI", 8),
            justify="left",
            wraplength=220,
        ).pack(anchor="w")

        self._button(frame, button_text, command, primary=primary).pack(
            anchor="w",
            pady=(12, 0),
        )

    def _field_label(self, parent, text, row):
        ttk.Label(
            parent,
            text=text,
            style="Card.TLabel",
            font=("Segoe UI Semibold", 9),
        ).grid(row=row, column=0, sticky="w", pady=(0, 6))

    def _build_export(self):
        frame = self.export_frame
        frame.columnconfigure(0, weight=1)
        frame.columnconfigure(1, weight=1)

        cfg = self.settings.export

        self.output_dir = tk.StringVar(value=cfg.output_dir)
        self.output_prefix = tk.StringVar(value=cfg.output_prefix)
        self.part_preference = tk.StringVar(value=cfg.part_preference)
        self.max_mb = tk.DoubleVar(value=cfg.max_mb_per_file)
        self.page_size = tk.StringVar(value=cfg.page_size)
        self.grayscale = tk.BooleanVar(value=cfg.grayscale)
        self.keep_work = tk.BooleanVar(value=cfg.keep_work_files)

        left = ttk.Frame(frame, style="Card.TFrame")
        right = ttk.Frame(frame, style="Card.TFrame")
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 18))
        right.grid(row=0, column=1, sticky="nsew", padx=(18, 0))
        left.columnconfigure(0, weight=1)
        right.columnconfigure(0, weight=1)

        self._field_label(left, "Output folder", 0)
        folder_row = ttk.Frame(left, style="Card.TFrame")
        folder_row.grid(row=1, column=0, sticky="ew")
        folder_row.columnconfigure(0, weight=1)

        ttk.Entry(
            folder_row,
            textvariable=self.output_dir,
            style="Shot.TEntry",
        ).grid(row=0, column=0, sticky="ew")

        self._button(folder_row, "Browse", self._browse).grid(
            row=0,
            column=1,
            padx=(8, 0),
        )

        self._field_label(left, "Filename prefix", 2)
        ttk.Entry(
            left,
            textvariable=self.output_prefix,
            style="Shot.TEntry",
        ).grid(row=3, column=0, sticky="ew")

        self._field_label(left, "PDF files", 4)
        ttk.Combobox(
            left,
            textvariable=self.part_preference,
            values=["auto", "2", "3"],
            state="readonly",
            style="Shot.TCombobox",
        ).grid(row=5, column=0, sticky="ew")

        ttk.Label(
            left,
            text="Auto tries 2 files first and uses 3 only when needed.",
            style="MutedCard.TLabel",
        ).grid(row=6, column=0, sticky="w", pady=(6, 0))

        self._field_label(right, "Max MB per PDF", 0)
        ttk.Entry(
            right,
            textvariable=self.max_mb,
            style="Shot.TEntry",
        ).grid(row=1, column=0, sticky="ew")

        self._field_label(right, "Page size", 2)
        ttk.Combobox(
            right,
            textvariable=self.page_size,
            values=["A4", "LETTER"],
            state="readonly",
            style="Shot.TCombobox",
        ).grid(row=3, column=0, sticky="ew")

        ttk.Checkbutton(
            right,
            text="Use grayscale for smaller files",
            variable=self.grayscale,
            style="Shot.TCheckbutton",
        ).grid(row=4, column=0, sticky="w", pady=(18, 6))

        ttk.Checkbutton(
            right,
            text="Keep raw capture files after export",
            variable=self.keep_work,
            style="Shot.TCheckbutton",
        ).grid(row=5, column=0, sticky="w")

    def _build_capture(self):
        frame = self.capture_frame
        frame.columnconfigure(0, weight=1)
        frame.columnconfigure(1, weight=1)

        cfg = self.settings.capture

        self.capture_mode = tk.StringVar(value=cfg.mode)
        self.selector = tk.StringVar(value=cfg.selector_override)
        self.overlap = tk.IntVar(value=cfg.overlap_px)
        self.scroll_delay = tk.IntVar(value=cfg.scroll_delay_ms)
        self.history_timeout = tk.IntVar(value=cfg.history_timeout_s)
        self.include_header = tk.BooleanVar(value=cfg.include_chat_header)

        left = ttk.Frame(frame, style="Card.TFrame")
        right = ttk.Frame(frame, style="Card.TFrame")
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 18))
        right.grid(row=0, column=1, sticky="nsew", padx=(18, 0))
        left.columnconfigure(0, weight=1)
        right.columnconfigure(0, weight=1)

        self._field_label(left, "Capture range", 0)
        ttk.Combobox(
            left,
            textvariable=self.capture_mode,
            values=["full", "current_to_bottom"],
            state="readonly",
            style="Shot.TCombobox",
        ).grid(row=1, column=0, sticky="ew")

        ttk.Label(
            left,
            text="Full loads older messages until history becomes stable.",
            style="MutedCard.TLabel",
        ).grid(row=2, column=0, sticky="w", pady=(6, 14))

        self._field_label(left, "Custom CSS selector", 3)
        ttk.Entry(
            left,
            textvariable=self.selector,
            style="Shot.TEntry",
        ).grid(row=4, column=0, sticky="ew")

        ttk.Checkbutton(
            left,
            text="Include the chat header once",
            variable=self.include_header,
            style="Shot.TCheckbutton",
        ).grid(row=5, column=0, sticky="w", pady=(18, 0))

        self._field_label(right, "Overlap (px)", 0)
        ttk.Entry(
            right,
            textvariable=self.overlap,
            style="Shot.TEntry",
        ).grid(row=1, column=0, sticky="ew")

        self._field_label(right, "Scroll delay (ms)", 2)
        ttk.Entry(
            right,
            textvariable=self.scroll_delay,
            style="Shot.TEntry",
        ).grid(row=3, column=0, sticky="ew")

        self._field_label(right, "History timeout (s)", 4)
        ttk.Entry(
            right,
            textvariable=self.history_timeout,
            style="Shot.TEntry",
        ).grid(row=5, column=0, sticky="ew")

    def _show(self, name):
        if name == "capture":
            self.capture_frame.tkraise()
        else:
            self.export_frame.tkraise()

    def _toggle_theme(self):
        try:
            self._save()
        except Exception:
            pass

        self.settings.ui.theme = (
            "dark" if self.settings.ui.theme == "light" else "light"
        )
        save_settings(self.settings)

        for child in self.winfo_children():
            child.destroy()

        self._apply_style()
        self._build()

    def _capture_settings(self):
        return CaptureConfig(
            mode=self.capture_mode.get(),
            selector_override=self.selector.get().strip(),
            overlap_px=max(50, int(self.overlap.get())),
            scroll_delay_ms=max(150, int(self.scroll_delay.get())),
            history_timeout_s=max(20, int(self.history_timeout.get())),
            include_chat_header=bool(self.include_header.get()),
        )

    def _export_settings(self):
        max_mb = float(self.max_mb.get())

        if max_mb <= 0.2:
            raise ValueError("Max MB must be greater than 0.2")

        return ExportConfig(
            output_dir=self.output_dir.get().strip() or str(Path.home() / "Desktop"),
            output_prefix=self.output_prefix.get().strip() or "chat_evidence",
            part_preference=self.part_preference.get(),
            max_files=3,
            max_mb_per_file=max_mb,
            page_size=self.page_size.get(),
            grayscale=bool(self.grayscale.get()),
            keep_work_files=bool(self.keep_work.get()),
        )

    def _save(self):
        self.settings = AppSettings(
            self._capture_settings(),
            self._export_settings(),
            UiConfig(self.settings.ui.theme),
        )
        save_settings(self.settings)

    def _browse(self):
        path = filedialog.askdirectory(
            initialdir=self.output_dir.get() or str(Path.home())
        )
        if path:
            self.output_dir.set(path)

    def _set_busy(self, busy, value, text):
        self.progress["value"] = value
        self.status.config(text=text)
        self.cancel.config(state="normal" if busy else "disabled")

    def _open(self):
        try:
            self._save()
            self._set_busy(True, 2, "Opening WhatsApp Web...")
            self.worker.send("open", self.settings.capture)
        except Exception as exc:
            messagebox.showerror("Shotdown", str(exc))

    def _check(self):
        try:
            self._save()
            self._set_busy(True, 5, "Checking conversation area...")
            self.worker.send("analyze", self.settings.capture)
        except Exception as exc:
            messagebox.showerror("Shotdown", str(exc))

    def _capture(self):
        try:
            self._save()
            self._set_busy(True, 1, "Starting capture...")
            self.worker.send("capture", self.settings.capture)
        except Exception as exc:
            messagebox.showerror("Shotdown", str(exc))

    def _start_export(self, artifacts: CaptureArtifacts):
        self.cancel.config(state="disabled")
        cfg = self.settings.export

        def run():
            try:
                result = build_evidence_pdfs(
                    artifacts,
                    cfg,
                    progress=lambda p, m: self.app_events.put(("progress", (p, m))),
                )
                self.app_events.put(("done", result))
            except Exception as exc:
                self.app_events.put(("error", exc))

        self.export_thread = threading.Thread(target=run, daemon=True)
        self.export_thread.start()

    def _cancel(self):
        self.worker.cancel()
        self.status.config(text="Cancelling after the current step...")

    def _poll(self):
        try:
            while True:
                kind, payload = self.worker.events.get_nowait()

                if kind == "progress":
                    p, msg = payload
                    self.progress["value"] = p * 100
                    self.status.config(text=msg)

                elif kind == "opened":
                    self._set_busy(
                        False,
                        0,
                        "WhatsApp Web is open. Open the target conversation.",
                    )

                elif kind == "analyzed":
                    self._set_busy(
                        False,
                        0,
                        "Conversation detected. Ready to capture.",
                    )
                    messagebox.showinfo(
                        "Shotdown",
                        "Conversation detected successfully.",
                    )

                elif kind == "captured":
                    self.progress["value"] = 74
                    self.status.config(text="Capture complete. Building PDFs...")
                    self._start_export(payload)

                elif kind == "cancelled":
                    self._set_busy(False, 0, "Cancelled")

                elif kind == "error":
                    self._set_busy(False, 0, "Error")
                    messagebox.showerror("Shotdown", payload)

        except queue.Empty:
            pass

        try:
            while True:
                kind, payload = self.app_events.get_nowait()

                if kind == "progress":
                    p, msg = payload
                    self.progress["value"] = p * 100
                    self.status.config(text=msg)

                elif kind == "done":
                    self._set_busy(False, 100, "Export complete")

                    lines = [
                        f"{path.name} · {path.stat().st_size / 1_000_000:.2f} MB"
                        for path in payload.pdf_paths
                    ]

                    messagebox.showinfo(
                        "Shotdown",
                        "Created "
                        + str(len(lines))
                        + " PDF file(s).\n\n"
                        + "\n".join(lines),
                    )

                    try:
                        os.startfile(Path(self.settings.export.output_dir))
                    except Exception:
                        pass

                elif kind == "error":
                    self._set_busy(False, 0, "Export failed")
                    messagebox.showerror("Shotdown", str(payload))

        except queue.Empty:
            pass

        self.after(120, self._poll)

    def _close(self):
        try:
            self._save()
        except Exception:
            pass

        try:
            self.worker.send("quit")
        except Exception:
            pass

        self.destroy()


def main():
    App().mainloop()
