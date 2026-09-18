# Implementation references

Reviewed on 2026-09-18.

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

Glint directly uses the native package for hooks, UIA/MSAA retrieval, coordinates and optional clipboard fallback. Its upstream license must accompany any distributed bundle containing the package.

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
