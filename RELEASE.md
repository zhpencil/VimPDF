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

- `VimPDF-1.0.0-arm64.dmg` — macOS on Apple Silicon
- `VimPDF-1.0.0-arm64-mac.zip` — portable app bundle
- `checksums.txt` — SHA-256 checksums

## Installing on macOS

The build is unsigned, so Gatekeeper blocks the first launch. Right-click **VimPDF** and choose **Open**, or run:

```sh
xattr -dr com.apple.quarantine /Applications/VimPDF.app
```

Windows and Linux packages can be built from source with `npm run dist:win` and `npm run dist:linux`.
