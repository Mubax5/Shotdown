# Contributing

Pull requests are welcome. Keep capture logic resilient to WhatsApp DOM changes: prefer heuristics and fallbacks over one brittle selector.

Before opening a PR:

1. Run `pytest -q`.
2. Test both light and dark desktop modes when changing the UI.
3. Verify generated PDFs at 100% zoom and confirm every file stays below the configured hard cap.
4. Do not add telemetry, analytics, remote uploads, or cloud processing without an explicit opt-in design.
5. Never commit private chat screenshots or authenticated browser-profile data.
