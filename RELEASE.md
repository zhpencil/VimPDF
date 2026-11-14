# VimPDF 1.0.0

The first cross-platform release of VimPDF — a keyboard-first PDF reader for macOS, Windows and Linux.

## Highlights

- Cover-grid and list library with remembered position and zoom per document
- Paragraph-level reading with `J` / `K`, `[` / `]` section jumps and `G` targets
- Outline and annotation sidebars, occurrence-level search, immersive fullscreen
- Highlights and notes with inline KaTeX math, Markdown export, undo
- Flashcard deck built from every highlight and note, with last-card restore
- Chinese / English interface
- Local-first storage — PDFs and annotations never leave your computer

## Downloads

- **macOS (Apple Silicon)** — `VimPDF-1.0.0-arm64.dmg`, or the portable `VimPDF-1.0.0-arm64-mac.zip`
- **Windows (64-bit)** — `VimPDF.Setup.1.0.0.exe`
- **Linux (64-bit)** — `VimPDF-1.0.0.AppImage`, or `vimpdf_1.0.0_amd64.deb`
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
chmod +x VimPDF-1.0.0.AppImage && ./VimPDF-1.0.0.AppImage
# or
sudo dpkg -i vimpdf_1.0.0_amd64.deb
```
