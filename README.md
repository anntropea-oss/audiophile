# AudioPhile

Batch normalize and master raw audio in the browser with optional MP3 export.

## Install guide

See [INSTALL.md](/Users/atropea/coding/audio_suite/INSTALL.md) for macOS and Linux install steps.

## Local server

Requires `ffmpeg` installed locally. On macOS: `brew install ffmpeg`.

```bash
npm install
npm start
```

Open `http://localhost:8080`.

## Docker

```bash
docker build -t audio-suite .
docker run --rm -p 8080:8080 audio-suite
```

Open `http://localhost:8080`.

## Desktop app (Electron)

```bash
npm install
npm run electron
```

To build a macOS `.app`:

```bash
npm run dist
```

## macOS signing + notarization (recommended for sharing)

This removes Gatekeeper warnings for other users.

1. Join the Apple Developer Program.
2. Create a "Developer ID Application" certificate in Keychain Access.
3. Export the certificate as a `.p12` (include the private key).
4. Create an app-specific password in your Apple ID.
5. Build with signing and notarization:

```bash
export CSC_LINK="/path/to/DeveloperID.p12"
export CSC_KEY_PASSWORD="your_p12_password"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="your-app-specific-password"
export APPLE_TEAM_ID="YOURTEAMID"
export CSC_IDENTITY_AUTO_DISCOVERY="true"

npm run dist
```

The signed, notarized DMG will be in `dist/`.

## Hosted server (VPS)

See [deploy/README.md](/Users/atropea/coding/audio_suite/deploy/README.md) for a step-by-step VPS setup using Docker Compose.

## Linux download workflow

Build Linux installers (AppImage + deb) on a Linux machine or CI:

```bash
npm install
npm run dist -- --linux
```

Outputs will be in `dist/`, for example:
- `AudioPhile-<version>.AppImage`
- `AudioPhile-<version>.deb`

You can also build Linux artifacts automatically via GitHub Actions.
See `.github/workflows/build-linux.yml`. It runs on tag pushes (e.g., `v1.0.1`)
or can be started manually from the Actions tab.

### Arch + Hyprland

See `packaging/arch/` for a PKGBUILD that wraps the AppImage and a Hyprland-ready
launcher script. The install guide includes Wayland flags for best performance.

Share these files via your download host, and optionally publish a simple install guide:

```bash
chmod +x AudioPhile-<version>.AppImage
./AudioPhile-<version>.AppImage
```

For Debian/Ubuntu:

```bash
sudo apt install ./AudioPhile-<version>.deb
```

## DMG auto-updates (recommended)

This project is configured for `electron-updater` using a generic HTTP feed.

1. Host your update files at a public URL (for example `https://your-domain.com/downloads`).
2. After running `npm run dist`, upload:
   - The latest DMG file (`AudioPhile-<version>-arm64.dmg`)
   - The update metadata (`latest-mac.yml`)
3. Set the feed URL for production (optional override):

```bash
export UPDATE_FEED_URL="https://your-domain.com/downloads"
```

When users open the app, it will check for updates and install them automatically.
