---
name: run-legion-pdf
description: Build, launch, and drive the Legion PDF Electron app on this WSL machine. Use when asked to run the app, screenshot it, open a PDF in it, or verify a change works in the real app (not just tests). Drives via a Playwright REPL — no visible window needed.
---

Legion PDF is an Electron app. For agent use, drive it through the REPL at
`.claude/skills/run-legion-pdf/driver.mjs`: it launches the built app on the
WSLg X display, and takes line commands (screenshot, click, type, eval) over
stdin. Proven flow: opened encrypted Judicial Council forms, filled fields,
saved, verified bytes (2026-08-22).

All paths relative to the repo root.

## Prerequisites

Nothing to install: WSLg provides the display (`:0` — no xvfb), and
`playwright-core` is a devDependency. If `npx vitest` or `npx tsc` are
missing, devDependencies were pruned — run `npm install --include=dev`
(see Gotchas).

## Build

```bash
npm run build   # electron-vite build → out/  (the driver launches out/)
```

Rebuild after every code change — the driver runs the BUILT app, not dev mode.

## Run (agent path)

```bash
tmux new-session -d -s lpdf -x 220 -y 50
tmux send-keys -t lpdf 'cd <repo> && exec node .claude/skills/run-legion-pdf/driver.mjs' Enter
timeout 20 bash -c 'until tmux capture-pane -t lpdf -p | grep -q "driver ready"; do sleep 0.4; done'
tmux send-keys -t lpdf 'launch /path/to/some.pdf' Enter   # args = files to open (argv path)
timeout 45 bash -c 'until tmux capture-pane -t lpdf -p | grep -q "launched\."; do sleep 0.5; done'
tmux send-keys -t lpdf 'ss first-look' Enter
sleep 2; tmux capture-pane -t lpdf -p | tail -5
```

Screenshots land in `/tmp/legion-pdf-driver/shots/` (override:
`SCREENSHOT_DIR`). **Always Read the screenshot** — a blank frame means the
launch failed.

### Commands

| command | what it does |
|---|---|
| `launch [pdf ...]` | launch the app; extra args open like a double-clicked file |
| `ss [name]` | screenshot → shots dir |
| `click <css-sel>` | DOM click (never coordinates) |
| `click-text <label>` | click button by `title` / aria-label / text — toolbar and dock buttons all carry `title` ("Save (Ctrl+S)", "Fill Forms", "Next page") |
| `type <text>` / `press <key>` | keyboard into the focused element |
| | **Gotcha (2026-08-22):** `type` can silently TRUNCATE long strings (a ~230-char chat message lost its tail mid-word). For anything long or load-bearing, set the value via `eval` with the native setter instead: `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, text); el.dispatchEvent(new Event("input", {bubbles: true}))` |
| `wait <css-sel>` | wait for element, 15 s |
| `eval <js>` | evaluate an expression in the page, print JSON |
| `text [css-sel]` | print innerText |
| `quit` | close app and exit the REPL |

Useful eval idioms:

- Focus a form field by AcroForm name, then `type`:
  `eval (() => { const i = [...document.querySelectorAll(".annotationLayer input")].find(e => e.name.endsWith(".Name[0]")); i.focus(); return i.name; })()`
- Count rendered form widgets: `eval document.querySelectorAll(".annotationLayer section").length`

## Run (human path)

```bash
npm run dev   # hot-reload window on the WSLg display
```

## Gotchas (all hit for real)

- **Restart cycles: kill the tmux session, never reuse the pane.** After
  `quit`, greps against `capture-pane` match STALE scrollback ("launched."
  from the previous run) and commands land in bash instead of the REPL.
  Fresh `tmux kill-session` + `new-session` per launch cycle.
- **`--ozone-platform=headless` dumps core.** Use the WSLg X display
  (driver defaults `DISPLAY=:0`); `--no-sandbox` is required.
- **Keyboard accelerators (Ctrl+S) don't fire** — the headless-ish window
  never has OS focus. Click the toolbar buttons by `title` instead.
- **Single-instance lock:** the app quits instantly (exit 0, no output) if
  another instance shares its user-data dir. The driver passes its own
  `--user-data-dir`; other agents' instances on this machine don't collide.
- **`NODE_ENV=production` in the environment makes `npm install` silently
  delete devDependencies.** Fixed at the source (armory terminal server,
  2026-08-22) but if electron/vitest vanish: `npm install --include=dev`.
- **pdf.js layers collapse to zero size** without `--scale-factor` AND
  `--scale-round-x/y` CSS vars — already handled in
  `annotation-layer-draw.ts` / `annotation-layer.css`; symptom is widgets
  stacked as a dot at the page corner.

## Troubleshooting

- **Launch timeout:** `out/` missing or stale → `npm run build`.
- **App exits instantly, exit 0:** single-instance lock (see Gotchas) or a
  stale process holding the driver's udata dir:
  `pkill -f "user-data-dir=.*legion-pdf-driver"`.
- **Blank screenshot:** window still loading — re-`ss` after 2 s; if still
  blank, `eval document.body.childElementCount` to see if the renderer died.
