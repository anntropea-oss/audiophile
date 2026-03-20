# AudioPhile Install Guide

This guide covers installing the desktop app on macOS and Linux.

## macOS (DMG)

1. Download `AudioPhile-<version>-arm64.dmg`.
2. Open the DMG and drag **AudioPhile** into **Applications**.
3. Launch **AudioPhile** from **Applications**.

If macOS blocks the first launch:
- Right-click the app → **Open** → **Open**.
- Or go to **System Settings → Privacy & Security** and click **Open Anyway**.

## Linux (AppImage)

1. Download `AudioPhile-<version>.AppImage`.
2. Make it executable:

```bash
chmod +x AudioPhile-<version>.AppImage
```

3. Run it:

```bash
./AudioPhile-<version>.AppImage
```

## Linux (Debian/Ubuntu .deb)

1. Download `AudioPhile-<version>.deb`.
2. Install:

```bash
sudo apt install ./AudioPhile-<version>.deb
```

3. Launch from your applications menu.

## Linux (Arch-based) — Download Workflow

### AppImage (recommended)

1. Download `AudioPhile-<version>.AppImage`
2. Make it executable:

```bash
chmod +x AudioPhile-<version>.AppImage
```

3. Run it:

```bash
./AudioPhile-<version>.AppImage
```

### Hyprland/Wayland performance flags

If you see rendering glitches under Hyprland, run:

```bash
ELECTRON_OZONE_PLATFORM_HINT=wayland ./AudioPhile-<version>.AppImage --ozone-platform=wayland --enable-features=WaylandWindowDecorations
```

### Pacman package (optional)

If you distribute a `.pkg.tar.zst`:

```bash
sudo pacman -U ./AudioPhile-<version>-x86_64.pkg.tar.zst
```

## Linux (Flatpak)

If you build the GTK frontend:

```bash
flatpak-builder --user --install --force-clean build-dir flatpak/org.audiophile.AudioPhile.json
```

The GTK app connects to the Node/FFmpeg backend at `http://localhost:8080`.
Start the server (`npm start`) before launching the GUI.
