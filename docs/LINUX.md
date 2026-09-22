# Linux Support (Preview)

Glint supports Linux x64 on X11 and Wayland compositors exposing PRIMARY selection through `ext-data-control-v1` or `wlr-data-control-unstable-v1` version 2 or later. Capture uses the existing `selection-hook` backend in the utility process. No `wl-clipboard`, root access, or input-group membership is required.

## Desktop Requirements

| Session | Selection | Source app / exclusions | Position |
| --- | --- | --- | --- |
| X11 | PRIMARY | WM_CLASS / supported | Cursor coordinates |
| KDE Plasma, Hyprland | Wayland PRIMARY | Unavailable | Compositor coordinates, when available |
| Sway, other wlroots compositors, COSMIC | Wayland PRIMARY, subject to protocol support | Unavailable | XWayland pointer fallback; may be stale |
| GNOME Wayland | Unsupported by the pinned backend | Unavailable | Use an X11 session |

Glint's windows run through **XWayland**: Electron cannot position a floating toolbar globally under native Wayland. `npm start` and the packaged desktop entry pass `--ozone-platform=x11` before Electron starts; direct executable launches relaunch with this flag. Direct AppImage relaunches use extraction mode so they do not depend on the original mount or a FUSE installation. XWayland and a valid `DISPLAY` are required. The utility process retains `WAYLAND_DISPLAY`, so capture still reaches native Wayland applications. Like the native backend, Glint selects Wayland only when `WAYLAND_DISPLAY` is nonempty; `XDG_SESSION_TYPE=wayland` alone does not enable native Wayland capture.

Linux capture is **PRIMARY only**. The target application must publish selected text to PRIMARY. Copy and copy-on-demand capture are disabled; the regular clipboard is never used as a substitute. Copying results and history still uses Electron's normal clipboard API.

Wayland defaults to shortcut mode. Source application identity and exclusions are unavailable. Automatic mode can be enabled, but it observes PRIMARY changes from every application, including Glint and terminals. Existing exclusions are inactive on Wayland and remain saved for X11 or Windows. A profile with exclusions starts in shortcut mode on its first Wayland launch; subsequent Wayland trigger choices are saved separately as `waylandTrigger` in `settings.json`. Switching sessions or saving unrelated settings does not erase exclusions, the other session's trigger, or Windows capture-mode preferences. Linux always applies PRIMARY capture at runtime.

Without input device access, the backend uses debounced PRIMARY changes. Global mouse, wheel and Escape dismissal may be unavailable; the Linux toolbar has a close button. Invalid native coordinates are ignored and the XWayland cursor position is used as fallback. Capture and positioning vary by compositor and application.

With input-device access, the native hook can start even when data-control is unavailable. Its public API does not expose protocol availability; diagnostics therefore report that monitoring has started, not that PRIMARY capture is proven. Verify a real selection on the target compositor.

Normal Wayland launches enable Electron's `GlobalShortcutsPortal`. Install `xdg-desktop-portal` and a matching desktop backend with GlobalShortcuts support, then accept the desktop permission prompt. A successful registration request does not prove permission was granted. If the shortcut does not fire, check desktop shortcut permissions or enable automatic capture. Smoke runs use XWayland shortcut registration to avoid desktop permission prompts.

## Build and Run

Use Node.js 24, npm and Git. Linux uses the upstream x64 prebuild; it does not compile the Windows C++ extension. This binary requires glibc 2.38 or newer and libstdc++ with `GLIBCXX_3.4.30` (for example Ubuntu 24.04). Runtime libraries include libevdev, X11, XTest, XFixes, Wayland, and Electron's GTK/NSS/audio dependencies.

For Ubuntu 24.04:

```sh
sudo apt install libevdev2 libxtst6 libx11-6 libxfixes3 libwayland-client0 \
  libgtk-3-0t64 libnss3 libasound2t64 xwayland xdg-desktop-portal
npm ci
npm run setup:electron
npm start
```

Also install your desktop's portal backend and unlock its keyring. API keys require a real Secret Service or KWallet encryption backend; Electron's `basic_text` fallback and unavailable backends are rejected. A local model without an API key works without a keyring.

Chromium's sandbox must work. Glint rejects `--no-sandbox`, including when an AppImage launcher adds it automatically. Use your distribution's approved user-namespace/AppArmor configuration, or an unpacked installation with a correctly installed root-owned `chrome-sandbox` helper; do not disable the sandbox to work around startup failures. Ubuntu 24.04 can restrict user namespaces for uninstalled applications.

## Data

| Content | Default path | Override |
| --- | --- | --- |
| Settings and encrypted API key | `~/.config/Glint/settings.json` | `$XDG_CONFIG_HOME/Glint/settings.json` (Electron appData) |
| Saved SQLite records | `~/.local/share/Glint/data/` | `$XDG_DATA_HOME/Glint/data/` |
| Rotating logs | `~/.local/state/Glint/logs/` | `$XDG_STATE_HOME/Glint/logs/` |

Relative or empty data/state overrides fall back to defaults. Records are unencrypted, as on Windows. Quit Glint before removing these Glint directories to erase local data. Smoke profiles always stay under ignored `work/`, regardless of XDG overrides.

## Verification

```sh
npm run check
# Only inside a disposable desktop or nested compositor:
GLINT_TEST_DESKTOP=1 npm run smoke
```

Unit tests cover platform detection, preference preservation across sessions, native configuration, unavailable features, XDG paths, keyring policy, and coordinate validation. The three smoke scenarios exercise settings/IPC (including persisted session preferences), records with a local fake model, and real native capture. Linux native smoke checks PRIMARY, pause/resume, toolbar dismissal and an unchanged regular clipboard. It also checks source identity and exclusions on X11, and automatic capture on Wayland without input-device access. Gesture-based automatic capture with input devices needs a manual check: Electron's fixture events do not inject OS gestures. The report lists exactly which checks ran. Windows retains UIA, copy modes, exclusions and clipboard restoration.

Native smoke refuses to run without `GLINT_TEST_DESKTOP=1`: this acknowledges that the current session is disposable; it does not create isolation itself. The fixture replaces the session's PRIMARY selection, which is not restored. Records smoke temporarily changes the regular clipboard and restores it. No external model is used. Unavailable or failed native scenarios are failures, never passes. Portal authorization, unlocked-keyring credential round trips and third-party app compatibility require manual checks on the target desktop.

Linux CI runs checks, records smoke and unpacked-package verification under Xvfb, exercising X11 rather than establishing Wayland compositor compatibility.

## Packaging

```sh
npm run package:linux
npm run package:verify:linux -- --appimage
```

Outputs are `release/Glint-<version>-linux-x64.AppImage`, `release/Glint-<version>-linux-x64.tar.gz`, `release/SHA256SUMS-linux.txt`, and `release/linux-unpacked/`. AppImage requires FUSE or its `--appimage-extract-and-run` option. The tar archive includes the `glint` executable and runtime resources; keep that directory intact.

Verification checks that unpacked resources match the current build, licenses and the native binary, then runs isolated startup probes for sandboxed IPC and SQLite, both with an explicit X11 flag and through the direct-launch relaunch path. It also verifies refusal of unsandboxed startup. `--appimage` tests both `APPIMAGE_EXTRACT_AND_RUN=1` and `--appimage-extract-and-run`; omit it to check only `release/linux-unpacked/`, as CI does. Test FUSE mounting and desktop integration separately on each distribution. The GitHub release workflow still publishes Windows artifacts; existing releases do not contain Linux downloads.
