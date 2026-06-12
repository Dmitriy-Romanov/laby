# AGENTS.md

## Project

Pure static web game (LABY — maze game). No build step, no backend, no dependencies. Open `index.html` in a browser to run.

## Validate changes

```bash
node --check game.js        # JS syntax check
xmllint --noout assets/sprites/*.svg  # SVG syntax (if xmllint available)
```

Or use the helper script:

```bash
./laby.sh 3                 # run all checks
./laby.sh 1                 # JS only
./laby.sh 2                 # SVG only
```

**Always run `node --check game.js` after editing game.js.** There is no linter, formatter, or type checker — this is the only automated validation.

## Architecture

All game logic lives in a single IIFE in `game.js`. `style.css` handles rendering via CSS classes and transforms. `index.html` is the full DOM structure. SVG sprites in `assets/sprites/` are referenced directly by CSS `url()` — no bundler.

Key flow: `createGame()` → `buildGrid()` → `renderMaze()` loop. Camera follows player via CSS `transition` on `.maze-container`. Enemies tick every 600ms independently.

### Grid storage

The maze grid is a **flat `Uint8Array(w * h)`** with numeric constants: `WALL = 0`, `PATH = 1`, `EXIT = 2`. Access formula: `grid[y * w + x]`. Do NOT use `grid[y][x]` — the grid is not a 2D array.

## Code conventions

- Single-file IIFE, `'use strict'`, no modules or imports
- Constants at the top of game.js (density values, durations, difficulty table)
- DOM refs cached once at module scope via `querySelector`
- Rendering avoids duplicate writes: `state.cellClasses[][]` and `state.enemyTransforms[]` cache last-written values
- Keyboard input uses `event.code` (physical keys), not `event.key`, so WASD works in non-English layouts
- Sprites: SVG files are rendered at tile size (36×36 per cell). Edit the SVG, reload the browser — no build. Keep `shape-rendering="crispEdges"` for pixel art style.

## Gotchas

- Cell size CSS var: `--cell-size: 36px` everywhere. Changing this affects camera, grid, and sprite sizing.
- `style.css` version query string in index.html must match to bust caches after CSS changes.
- `game.js` version query string in index.html must match after JS changes.
- High scores stored in `localStorage` under `laby.highScores.v1` — reset with hidden key `Z` during gameplay.
- `beginner` and `custom` difficulty levels do NOT write to high score tables.
- Maze dimensions must be odd. Generator enforces this, and custom input rounds to nearest odd (7–151 per side).

## Helper script

`./laby.sh` provides interactive menu and direct commands for syntax checks, git ops, local server (port 8081), and branch management. It runs JS/SVG checks before committing. The helper does not merge branches — experimental work stays isolated until manual review.
