# Third-party software

Glint's original code and brand artwork are licensed under MIT. Third-party components retain their own licenses; Glint's license does not replace them. Exact installed versions and transitive dependencies are recorded in `package-lock.json`.

## Components used at runtime or included in generated assets

| Component | License | Use |
| --- | --- | --- |
| [Electron](https://github.com/electron/electron) | MIT, plus bundled component notices | Desktop runtime |
| [selection-hook](https://github.com/0xfullex/selection-hook) | MIT | Native Windows selection engine |
| [node-addon-api](https://github.com/nodejs/node-addon-api) | MIT | Native addon support for selection-hook |
| [node-gyp-build](https://github.com/prebuild/node-gyp-build) | MIT | Native addon loader |
| [Lucide](https://github.com/lucide-icons/lucide) | ISC and notices included in its full LICENSE | Controls and action icons |

The build copies full license texts into `dist/licenses/`, including Electron's `LICENSES.chromium.html`. Retain this directory when distributing built files. An eventual installer must also preserve the notices shipped with Electron and any additional dependencies it includes; `dist/` alone is not a runnable distribution.

## Build and development tools

| Component | License | Use |
| --- | --- | --- |
| [resvg-js](https://github.com/thx/resvg-js) | MPL-2.0 | Generates PNG/ICO brand assets during build |
| [esbuild](https://github.com/evanw/esbuild) | MIT | Bundling |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 | Type checking |
| [Node.js type definitions](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT | Development types |

These tools are installed by npm and are not copied into Glint's renderer bundle. Their license texts accompany the installed packages. Node.js/Electron also include additional third-party notices in their distributions.

## Implementation references

Cherry Studio (AGPL-3.0) was studied for architecture and compatibility behavior. Its application code and UI are not vendored in this repository. See [reference provenance](docs/REFERENCES.md) for the reviewed revision and boundaries. Do not copy AGPL-covered code into this MIT project without first resolving the resulting licensing requirements.
