# Arch Linux Packaging (AUR-style)

This folder contains a PKGBUILD that wraps the AppImage into a system package.

## Build locally

```bash
cd packaging/arch
makepkg -si
```

## Update version

Update `pkgver` in `PKGBUILD` to match the GitHub release tag and filename.

## Notes
- This uses the AppImage from GitHub Releases.
- You can compute checksums and replace the `SKIP` entries if desired.
