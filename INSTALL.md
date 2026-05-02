# AudioPhile Install Guide

This guide is written for non-technical users first. Use the “Advanced” section only if you need it.

## Quick Install (Recommended)

Download the latest release here:
- https://github.com/anntropea-oss/audiophile/releases/latest

### macOS
1. Open the release page and scroll to **Assets**.
2. Download the file that ends in `.dmg` (example: `AudioPhile-1.0.0-arm64.dmg`).
2. Open it, then drag **AudioPhile** into **Applications**.
3. Open **Applications** and launch **AudioPhile**.

If macOS blocks the first launch:
- Right-click **AudioPhile** → **Open** → **Open**.

### Linux (works on most distros)
1. Download the `.AppImage` file.
2. Right-click it → **Properties** → enable **Executable** (wording varies by file manager).
3. Double-click to run.

If your file manager does not have an “Executable” toggle, use Terminal:
```bash
chmod +x AudioPhile-<version>.AppImage
./AudioPhile-<version>.AppImage
```

## Advanced (Optional)

### Debian/Ubuntu (.deb)

Download the `.deb`, then install with:
```bash
sudo apt install ./AudioPhile-<version>.deb
```

### Arch/Hyprland (Wayland flags)

If you see rendering glitches under Hyprland, run:

```bash
ELECTRON_OZONE_PLATFORM_HINT=wayland ./AudioPhile-<version>.AppImage --ozone-platform=wayland --enable-features=WaylandWindowDecorations
```

### Flatpak (GTK frontend, developers)

If you build the GTK frontend:

```bash
flatpak-builder --user --install --force-clean build-dir flatpak/org.audiophile.AudioPhile.json
```

The GTK app connects to the Node/FFmpeg backend at `http://localhost:8080`.
Start the server (`npm start`) before launching the GUI.
