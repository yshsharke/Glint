# selection-hook Windows extension

`selection-hook-2.1.1.patch` extends the pinned MIT dependency with
`setClipboardOnly(boolean)`. Both automatic and manual capture pass this flag in
the existing worker configuration snapshot. When enabled, neither UIA nor MSAA
is queried; failed copies never fall back to potentially incorrect accessibility
text. Global application exclusions and clipboard enablement still apply.

The patch also checks source-window focus before copying and before accepting
the result, rejects pre-existing clipboard changes in explicit copy mode, and
restores an originally empty clipboard. It reuses the upstream clipboard format
backup, copy shortcuts, polling, and cancellation machinery.

Glint's `native/clipboard-history.*` helper uses the Windows history API to attempt
removal of a temporary copy. It excludes pre-existing IDs, matches exact text
within the capture time window, and stops when the clipboard changes or more
than one record matches. Restoration adds the documented Windows exclusion
format to avoid another history entry or cloud upload. History access is bounded
and optional; unsupported/disabled history does not prevent capture. This cannot
guarantee that a temporary copy never appears, reverse a history eviction, or
clean a third-party clipboard manager. Ambiguous and delayed records are retained.

Run `npm run test:clipboard-history` for policy and Windows API checks. The live
test skips when history is disabled or near capacity, without changing the user's
preferences or evicting existing entries. It deletes only its own generated test
records and restores the clipboard. Regular Electron smoke checks capture behavior.

`npm ci` applies and compiles the patch using Python and Visual Studio C++ tools.
Builds verify its source and binary fingerprint; the patched binary replaces the
Windows x64 prebuild used in both development and packaged apps. Do not update
the dependency without reviewing and regenerating this patch. Upstream's MIT
license remains included in the distribution.
