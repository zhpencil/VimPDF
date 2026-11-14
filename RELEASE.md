# VimPDF 1.0.2

A visual release: the library shelf now scales properly from a laptop to a full-screen 4K display, and the app icon is a proper macOS-style rounded rectangle on every platform.

## What's new

- **A shelf that fits your screen** — the portrait cover grid steps through 4, 5, 6, 7 and 8 columns as the window grows (cards stay around 270–300 px wide instead of stretching or shrinking), and falls back to 3 or 2 columns in narrow windows. `J` / `K` still step exactly one row at whatever width is on screen.
- **Rounded-rectangle app icon** — the keycap icon now sits on the standard macOS icon tile with transparent padding and a soft contact shadow, so it looks right in the Dock, in Finder, in the Windows taskbar and in Linux launchers.
- **Refreshed GitHub hero image** with the new icon and the final library layout.
- **Release checksums** now match the Windows installer filename (`VimPDF.Setup.1.0.2.exe`), so `sha256sum -c checksums.txt` succeeds on every artifact.

Everything from 1.0.1 is still here: fullscreen outline, occurrence-level search, centred selection and outline rows, the clean note editor, and the macOS-consistent portrait shelf.

## Downloads

- **macOS (Apple Silicon)** — `VimPDF-1.0.2-arm64.dmg`, or the portable `VimPDF-1.0.2-arm64-mac.zip`
- **Windows (64-bit)** — `VimPDF.Setup.1.0.2.exe`
- **Linux (64-bit)** — `VimPDF-1.0.2.AppImage`, or `vimpdf_1.0.2_amd64.deb`
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
chmod +x VimPDF-1.0.2.AppImage && ./VimPDF-1.0.2.AppImage
# or
sudo dpkg -i vimpdf_1.0.2_amd64.deb
```
