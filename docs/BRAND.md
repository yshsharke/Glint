# Glint mark

The selected concept C combines rounded selection brackets with a soft four-point glint in the center.
Both variants use the same paths in `scripts/brand.mjs`:

- **Outline:** a single-color stroke for the settings header and selection toolbar. Its CSS mask follows the current accent color.
- **Filled:** heavier white brackets and a pale cyan glint on a blue rounded square for window, taskbar and tray icons.

`npm run build` generates the two SVGs, PNGs at 16–256 px and a multi-resolution Windows ICO in `dist/brand/`. Rasterization happens only during the build using the development dependency `@resvg/resvg-js`; the running app loads static assets.

The Glint mark is an original app identity, separate from the Lucide catalog used for actions and controls. Keep the two variants' geometry together when editing the design.
