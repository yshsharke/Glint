# Third-party software

Glint's original code and brand artwork are licensed under MIT. Third-party components retain their own licenses; Glint's license does not replace them. Exact installed versions and transitive dependencies are recorded in `package-lock.json`.

## Components used at runtime or included in generated assets

| Component | License | Use |
| --- | --- | --- |
| [Electron](https://github.com/electron/electron) | MIT, plus bundled component notices | Desktop runtime |
| [selection-hook](https://github.com/0xfullex/selection-hook) | MIT | Windows selection with Glint's [copy-mode patch](patches/README.md), and upstream Linux X11/Wayland PRIMARY capture |
| [node-addon-api](https://github.com/nodejs/node-addon-api) | MIT | Native addon support for selection-hook |
| [node-gyp-build](https://github.com/prebuild/node-gyp-build) | MIT | Native addon loader |
| [Lucide](https://github.com/lucide-icons/lucide) | ISC and notices included in its full LICENSE | Controls and action icons |
| [React / React DOM](https://github.com/facebook/react) | MIT | Renderer components and state updates |
| [Fluent UI React v9](https://github.com/microsoft/fluentui) | MIT | Controls, themes, accessibility and motion |
| [Griffel](https://github.com/microsoft/griffel) | MIT | Fluent UI runtime styles |

Frontend dependencies are bundled into the renderer. The build reads its bundle manifest and copies the full licenses of included packages (including transitive dependencies) to `dist/licenses/frontend/`, together with their exact versions in `dependencies.json`.

Fluent's built-in controls also use Fluent System Icons (MIT). The `@fluentui/react-icons@2.0.341` npm archive omits its license, so `third_party/fluentui-system-icons-LICENSE` preserves the upstream text at the package's git revision [`2e4da95009de778ae0f41ec6c17bc67c97f4dc56`](https://github.com/microsoft/fluentui-system-icons/blob/2e4da95009de778ae0f41ec6c17bc67c97f4dc56/LICENSE). Glint's action catalog remains Lucide.

The build copies full license texts into `dist/licenses/`, including Electron's `LICENSES.chromium.html`. Retain this directory when distributing built files. An eventual installer must also preserve the notices shipped with Electron and any additional dependencies it includes; `dist/` alone is not a runnable distribution.

## Build and development tools

| Component | License | Use |
| --- | --- | --- |
| [resvg-js](https://github.com/thx/resvg-js) | MPL-2.0 | Generates PNG/ICO brand assets during build |
| [esbuild](https://github.com/evanw/esbuild) | MIT | Bundling |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 | Type checking |
| [Node.js type definitions](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT | Development types |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT | Windows installer/portable and Linux AppImage/tar packaging |
| [Electron ASAR](https://github.com/electron/asar) | MIT | Packaged archive verification |
| [node-gyp](https://github.com/nodejs/node-gyp) | MIT | Builds the Windows selection compatibility patch |

These tools are installed by npm and are not copied into Glint's renderer bundle. Their license texts accompany the installed packages. Node.js/Electron also include additional third-party notices in their distributions.

AppImage contains a launcher generated from electron-builder's MIT-licensed template; its full license is included as `dist/licenses/electron-builder-LICENSE`. AppImage's native runtime and compatibility libraries come from electron-builder's upstream AppImage toolset, not the npm runtime dependencies. Before distributing Linux binaries, audit that toolset's component licenses, notices and corresponding-source requirements in addition to the application notices above.

The Windows setup and portable launchers are generated with NSIS. NSIS permits generated installers to be distributed under terms of the author's choice; see [NSIS license](https://nsis.sourceforge.io/License). This project uses the unmodified NSIS binaries supplied by electron-builder, rather than redistributing its compiler as part of the app.

## Implementation references

Cherry Studio (AGPL-3.0) was studied for architecture and compatibility behavior. Its application code and UI are not vendored in this repository. See [reference provenance](docs/REFERENCES.md) for the reviewed revision and boundaries. Do not copy AGPL-covered code into this MIT project without first resolving the resulting licensing requirements.
