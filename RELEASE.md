# VimPDF 1.0.1

A polish release focused on macOS-level details: the outline now works in fullscreen, search highlights and centers the exact occurrence, sidebars and the shelf keep the active row centred, and the library got a macOS-style portrait cover grid.

## What's new

- **Vertical cover grid** — the library now uses macOS-style cards with portrait page covers, in an adaptive grid with a lighter list view. `J` / `K` step a whole row at the current window width.
- **Fullscreen outline fix** — in fullscreen the toolbar hides, but the outline, annotations sidebar and status bar stay reachable, so `T` / `B` (and `⌘1` / `⌘2`) work again.
- **Occurrence-level search** — results now paint the exact text run instead of the whole paragraph, scroll the match to the centre, count matches per occurrence, keep paragraph focus while stepping, and jump to the last hit when the search closes.
- **Centred selection** — the outline auto-scrolls the active row to the centre (instantly on open, 0.15 s on later moves), and the library centres the selected card with the same 0.15 s ease.
- **Cleaner note editor** — the `$...$` hint no longer sits in the empty note box; inline math is documented in the README.
- **GitHub hero image** and refreshed README.

Everything from 1.0.0 is still here: paragraph-level Vim navigation, highlights and notes with inline KaTeX math, flashcard deck, Markdown export, occurrence search, bilingual UI and local-first storage.

## Downloads

- **macOS (Apple Silicon)** — `VimPDF-1.0.1-arm64.dmg`, or the portable `VimPDF-1.0.1-arm64-mac.zip`
- **Windows (64-bit)** — `VimPDF.Setup.1.0.1.exe`
- **Linux (64-bit)** — `VimPDF-1.0.1.AppImage`, or `vimpdf_1.0.1_amd64.deb`
- `checksums.txt` — SHA-256 checksums for every file above

## Installing

### macOS

The build is unsigned, so Gatekeeper blocks the first launch. Right-click **VimPDF** and choose **Open**, or run:

```sh
xattr -dr com.apple.quarantine /Applications/VimPDF.app
```

### Windows

Run the installer. The build is unsigned, so SmartScreen may warn: choose **More info → Run anyway**.

### Linux

```sh
chmod +x VimPDF-1.0.1.AppImage && ./VimPDF-1.0.1.AppImage
# or
sudo dpkg -i vimpdf_1.0.1_amd64.deb
```
