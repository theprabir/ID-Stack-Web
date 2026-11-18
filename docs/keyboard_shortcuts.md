# Keyboard Shortcuts

ID Stack currently has a **minimal keyboard surface** — the app is wizard- and
form-driven, so almost everything is a click away and no global shortcuts are
bound yet.

## ID Studio

| Action | Windows | macOS |
|---|---|---|
| Open the file picker on an upload tile | `Enter` or `Space` (tile focused) | `Enter` or `Space` (tile focused) |
| Collapse / expand the sidebar | click `»` / `«` | click `»` / `«` |

## Text inputs

Standard text editing applies inside every input (mapping keys, file naming
pattern, imposition dimensions, numbering prefix, …).

## Desktop shell shortcuts

The Windows app deliberately behaves like an installed program rather than a
web page, so the browser-style shortcuts are **not** available inside it:

- `F5`, `Ctrl+R` / `Ctrl+Shift+R` — reload is disabled (no web page to reload).
- `Ctrl++`, `Ctrl+-`, `Ctrl+0` and `Ctrl+wheel` — zoom is disabled; the layout
  already adapts to the window size.
- `F12` / `Ctrl+Shift+I` — developer tools are disabled in release builds.

Use the window controls for maximize / restore; the app's own **Fit** control
handles preview zoom.

## Planned

Shortcuts are added as features land; none are bound yet beyond the above.
Candidates for future releases: step navigation (`1`–`3`), preview front/back
toggle, batch pause/resume, theme toggle.
