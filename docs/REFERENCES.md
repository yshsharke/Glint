# Implementation references

Reviewed on 2026-09-18.

## Fluent UI React v9 (MIT)

Glint uses Microsoft's official React v9 components, theme tokens, and Fluent motion presets. It retains its own compact window layout and Lucide catalog. This is Fluent for the web inside Electron, not native WinUI 3.

- [Official React integration](https://fluent2.microsoft.design/get-started/develop)
- [Fluent motion guidance](https://fluent2.microsoft.design/motion)
- [Upstream implementation](https://github.com/microsoft/fluentui)

The preview motion package is pinned and imported through `src/ui/motion.ts`; review its API when upgrading. Fluent motion observes reduced-motion preferences. Griffel requires runtime styles; the renderer CSP permits inline CSS while retaining local-only scripts, no renderer network access, sandboxing, and context isolation.

## Lucide (ISC)

Pinned build dependency: `lucide-static@1.47.0` (1,848 catalog icons).

- [Official static asset documentation](https://lucide.dev/guide/static)
- [License](https://lucide.dev/license)

Controls and action icons use the same Lucide SVG assets. The build ships individual SVGs, mask rules and a lazily loaded tag index; it excludes fonts and framework bundles. The complete upstream license is copied to `dist/licenses/lucide-LICENSE`. Common Chinese search synonyms are maintained by Glint.

## selection-hook (MIT)

Pinned dependency: `selection-hook@2.1.1`.

- [Upstream](https://github.com/0xfullex/selection-hook)
- [Windows behavior at v2.1.1](https://github.com/0xfullex/selection-hook/blob/v2.1.1/docs/zh-CN/WINDOWS.md)
- [Windows retrieval engine](https://github.com/0xfullex/selection-hook/blob/v2.1.1/src/windows/core/engine.cc)
- [MIT license](https://github.com/0xfullex/selection-hook/blob/v2.1.1/LICENSE)

Glint uses the native package for hooks, UIA/MSAA retrieval, coordinates and clipboard capture. A [small Windows patch](../patches/README.md) adds explicit clipboard-only capture and restores an initially empty clipboard. It is compiled during dependency setup and shipped in both installer and portable builds. Its upstream MIT license accompanies the bundle.

## Cherry Studio (AGPL-3.0)

Reference revision: `142f3463f287b5da7246d15230d53b46298f72ff`.

- [SelectionService](https://github.com/CherryHQ/cherry-studio/blob/142f3463f287b5da7246d15230d53b46298f72ff/src/main/services/selection/SelectionService.ts)
- [Compatibility configuration](https://github.com/CherryHQ/cherry-studio/blob/142f3463f287b5da7246d15230d53b46298f72ff/src/main/services/selection/selectionConfig.ts)

References informed the automatic/passive mode split, physical-to-DIP coordinate conversion, non-focusable toolbar behavior, outside-click dismissal and documented PDF/WPS compatibility cases. Glint's service, settings and renderer are independently implemented; it does not vendor Cherry's application code or UI.

Current differences:

- The selection module runs in an Electron utility process. A hung manual capture can be terminated without freezing the app.
- Clipboard fallback is opt-in; terminals are excluded by default.
- Settings, actions and diagnostics are deliberately small. No knowledge base, agents, chat history or model registry.
- The prototype supports Windows only. Upstream cross-platform support does not make Glint cross-platform.
