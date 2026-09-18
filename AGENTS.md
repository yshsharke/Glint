# Glint

Windows selection assistant built with Electron, TypeScript and selection-hook.

- Keep selection acquisition in `src/selection-host.ts` (Electron utility process). Native UIA calls can block; do not move synchronous capture onto the main/UI thread.
- Keep rendering sandboxed, with context isolation and a narrow preload bridge. Never expose Node or arbitrary IPC to the renderer.
- Main process owns model requests and encrypted credentials. Do not log API keys or selected text.
- Keep scope small and configurable. Make actions, triggers and visual settings independent.
- Keep the UI compact and close to Windows conventions: system fonts, neutral surfaces, restrained borders, small controls. Avoid hero sections, marketing copy and excessive whitespace.
- Use the shared Lucide icon catalog in `src/icons.ts` for controls and user actions. Keep icons offline, load image assets on demand, and retain the upstream license in builds.
- Consult `docs/REFERENCES.md` when borrowing compatibility ideas from Cherry Studio; preserve upstream license obligations.
- Run `npm run check` for changes; run `npm run smoke` for window, IPC or native lifecycle changes.
- Smoke tests use a separate profile and a local fake model. Do not send test text to external services or overwrite the user's profile.
- Keep intermediate files and screenshots in ignored `work/`; generated builds in ignored `dist/`.
