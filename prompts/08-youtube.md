Build me a clean YouTube experience — search, watch, and download videos without ads or tracking. Create a `youtube` domain plugin using yt-dlp through the Python bridge since YouTube aggressively blocks browser automation.

I want to search videos, watch them, and download them in different qualities (1080p/720p/480p) with a progress bar. Downloads should happen in the background and I should be able to play saved videos from a downloads library.

Dashboard at `/youtube` — responsive video grid with thumbnails and duration overlays. Click to watch with the video player at the top. Download button with quality picker. Downloads library where I can play or save my downloaded videos. Keyboard shortcuts for the player (space, fullscreen, seek, volume). Should feel fast and clean on both desktop and mobile.

## Hints

- YouTube aggressively blocks browser automation. Use `yt-dlp` (CLI tool bridge pattern) via Python bridge rather than browser interception for all data operations.
- `yt-dlp` Python API: `YoutubeDL({'extract_flat': True}).extract_info('ytsearch20:query', download=False)` for search; `YoutubeDL({'skip_download': True}).extract_info(url, download=False)` for video info.
- For downloads, use `threading.Thread(daemon=True)` with a module-level job dict for progress tracking.
- All routes should be `browserRequired: false` — yt-dlp handles everything.
- System Python on macOS is 3.9 — add `from __future__ import annotations` at the top of worker.py.
- `PythonBridge` path from domain plugins: `resolve(import.meta.dirname, '../../../services/python/worker.py')` (3 levels up).
