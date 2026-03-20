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
