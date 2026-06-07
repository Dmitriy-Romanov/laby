# LABY — Maze Game

Pure static web game (no backend, no build step). Open `index.html` in a browser.

## Files

| File | Purpose |
|---|---|
| `index.html` | Single page: header with stats, game viewport, overlays, modals |
| `game.js` | All logic in one IIFE: maze gen, game state, camera, rendering, input |
| `style.css` | Full styling, ZX Spectrum palette, pixel font, animations |

## Run

Open `index.html` directly, or serve the folder with any static HTTP server:

```bash
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

## Architecture

### Maze generation (`generateMaze`)

- Recursive backtracking on odd-sized grid
- `WALL = '█'`, `PATH = ' '`, `EXIT = '$'`
- Extra paths opened (`grid cells / 40` walls removed) for more loops and multiple solutions
- Start: left side, randomly top `(1,1)` or bottom `(1,h-2)`
- Exit: right side on the opposite diagonal: `(w-2,h-2)` or `(w-2,1)`
- Generation uses a short seed code shown in the header and accepted in settings
- Default: 71x41, configurable up to 151x151

### Camera system (`updateCamera`, `applyPositions`)

- Single large maze, Mario-style scrolling
- Camera tracks player at ~40% from left, ~50% from top
- `camX`/`camY` snapped to integer cell positions
- CSS `transition: transform 0.12s` on `.maze-container` gives smooth cell-by-cell scroll
- Small mazes (fit in viewport) are centered automatically
- Player and enemies are children of `.maze-container` — their transforms are relative to the maze origin
- Both container and player have matching transition timing so camera-follow looks correct

### Rendering (`buildGrid`, `renderMaze`)

- `buildGrid()`: creates all cell `<div>` elements once, stores in `state.cells[y][x]`
- `renderMaze()`: computes cell state each frame, but writes `className` only when a cell actually changes
- Enemies are created dynamically in `buildGrid()`, stored in `enemyEls[]`
- Container/player/enemy transforms are cached to avoid duplicate style writes
- Fog of war: cells not recently revealed get `.cell-fog`. `FORGET_THRESHOLD = 10` moves

### Game state (`createGame`)

Key fields on `state`:

```
maze        — {grid[][], w, h, startPos, exitPos}
px, py      — player position (world coords)
camX, camY  — camera offset in cells
seed        — current reproducible seed code
enemies[]   — {type, size, x, y, dir, ticks, chaseEvery, minX, maxX, minY, maxY}
keys[]      — {x, y, collected}
powerups[]  — {x, y, type}
effects     — {vision: N, freeze: N, away: N}
revealed[][] — moveCount when each cell was last revealed (-1 = never, 255 = permanent)
footprints  — Set of "x,y" strings
visited     — Set of "x,y" strings
score, lives, moveCount, won, dead, totalKeys, collectedKeys, totalPowerups, collectedPowerups
```

### Difficulty

Game starts with difficulty selection modal. Stored in `difficulty` variable, affects maze size and enemy behavior.
`beginner` uses the Easy-sized maze without enemies and does not write to high scores.

| Level | Maze size | Patrol density/chase | Hunter density/chase |
|-------|-----------|----------------------|----------------------|
| beginner | 71x41 | none | none |
| easy   | 71x41 | 1 per 800 cells / 10 | 1 per 800 cells / 8 |
| medium | 81x51 | 1 per 700 cells / 9 | 1 per 800 cells / 7 |
| hard   | 91x61 | 1 per 600 cells / 8 | 1 per 800 cells / 6 |

Chase: every N-th tick, enemy picks direction closest to player (including diagonal).
`DIFFICULTY` stores maze size, patrol chase interval, hunter chase interval, and whether enemies are enabled.

### Enemies (`placeEnemies`, `tickEnemies`)

- Patrols: 3x3 red enemies, 1 per difficulty density
- Hunters: 2x2 cyan/magenta scanner enemies, 1 per 800 cells, chase every 8/7/6 ticks
- Vertical strips: maze width divided into `count` equal columns per enemy type
- Each enemy gets one vertical strip (`minX..maxX`), full height (`minY=0, maxY=maze.h-size`)
- Spawns at nearest path cell to strip center
- Random walk with 8 directions, 25% chance to change direction per tick
- Every `chaseEvery` ticks: picks direction toward player
- When `away` effect active: picks direction away from player
- Enemies avoid overlapping each other while spawning and moving
- All enemies always move (even off-screen), tick every 600ms
- Collision uses each enemy's `size`
- Player starts with 5 lives. Enemy contact removes 1 life, hides that enemy for 5 seconds, then respawns it in its zone. Last life triggers failure.

### Keys

- `KEY_DENSITY = 800` — 1 key per 800 total cells, minimum 1 when space allows
- All keys must be collected before the exit can win the game
- The exit is rendered as a locked grate until all keys are collected

### Powerups (`placePowerups`, `collectPowerup`)

- `PU_DENSITY = 100` — 1 powerup per 100 total cells
- Key Scan powerups are placed first, at least 2 per key when space allows
- Torch powerups are placed separately: `keys + 1`, kept away from map edges when space allows
- Other types cycle: `vision → freeze → xray → bonus → penalty → away` (`away` is shown to players as Repel)
- Placed on random `PATH` cells, at least 5 Manhattan distance from start
- Effects:
  - `vision` — radius 2, lasts 15 moves
  - `freeze` — stops all enemies, lasts 12 moves
  - `xray` — instant 9x9 reveal around player, cells fade by normal fog rules
  - `bonus` — instant +100 score, no duration
  - `penalty` — instant -50 score, clamped at 0
  - `away` / **Repel** — enemies flee from player, lasts 5 enemy ticks
  - `torch` — permanently reveals a circular radius-4 area around the pickup cell
  - `keyscan` — permanently reveals uncollected key positions on the map

### Scoring

- `+10` per new cell visited (first time stepping on it)
- `-1` per step onto an already visited cell; score is clamped at 0
- `+100` per `bonus` powerup collected
- `-50` per `penalty` powerup collected; score is clamped at 0

### High scores

- Stored locally in `localStorage` under `laby.highScores.v1`
- Separate TOP-5 tables for `easy`, `medium`, and `hard`
- Default rows are `PLAYER 0000`
- Runs are ranked by higher score, then fewer moves
- After win/death, qualifying runs insert into the table immediately and ask for a 7-character name
- Name entry uses physical `A-Z` / `0-9` keys, so it works even when the keyboard layout is not English
- Press `Space` to show scores
- Press `Z` to reset score tables

### UI flow

- **Header**: Moves, Powerups, Keys, Score, Lives, Enemies, Map, Seed, H Help button
- **R**: opens settings modal (custom maze size and optional seed)
- **WASD / Arrows**: move
- **H**: opens help
- **Space**: opens/closes local high scores
- **Z**: resets local high scores
- Keyboard controls use physical key codes, so `WASD/R/H/Z` work in non-English layouts
- Hidden debug `X`: saves a map snapshot JSON to `localStorage` and tries to download it
- After winning, `Show short track` replays a computed route from start through all keys to the exit without enemies
- Help/settings/win/death pause also disables active game animations to reduce browser/GPU load
- Touch/reduced-motion environments disable decorative infinite animations and blur filters by default
- **Collect popup**: floating powerup name for 2 seconds, centered on screen
- **Win/Death overlays**: show moves + score, button to restart

## Visual style

- **Font**: `Bitcount Prop Single` (Google Fonts) — retro pixel font, sizes doubled (~200%) to compensate for smaller rendering
- **Palette**: ZX Spectrum
  - Background: `#000000` (black)
  - Walls: `#0000cd` (blue) / `#0000ff` border
  - Player: `#ffff00` (yellow) glow
  - Patrols: `#ff0000` (red) 3x3 blocks with eyes
  - Hunters: cyan/magenta 2x2 scanner drones
  - Container border: `#00cdcd` (cyan) glow
  - Fog: `#1a1a2e`
  - Powerups: cyan/silver/magenta/gold/red/orange/green/amber pixel module icons
- Cell size: `--cell-size: 36px` desktop, `25px` mobile

## Performance notes

- `renderMaze()` avoids duplicate `className` writes through `state.cellClasses`
- `visible[][]` is reused instead of allocated on every render
- Camera/player/enemy transforms are cached before style writes
- Paused states add `.is-paused` to both `.app` and `body`
- Touch/reduced-motion environments disable decorative infinite animations, blur filters, and expensive sprite filters
- Browser checks showed the paused game dropping from high GPU use to normal idle-like consumption on desktop Chrome

## Key constants (game.js top)

```
PU_DENSITY = 100       — powerups per total cells
EXTRA_PATH_DENSITY = 32 — lower value opens more wall links after maze generation
KEY_DENSITY = 800      — keys per total cells
PENALTY_POINTS = 50    — negative pickup score loss
HUNTER_DENSITY = 800   — hunters per total cells
Difficulty: easy (71x41, patrol 800/10, hunter 800/8), medium (81x51, patrol 700/9, hunter 800/7), hard (91x61, patrol 600/8, hunter 800/6)
FORGET_THRESHOLD = 10  — fog returns after N moves
Cell: 36px (desktop) / 25px (mobile)
Tick: 600ms
Camera: 40% from left, 50% from top
Default maze: 71 x 41
```

## GitHub

This project is a pure static app and is safe to keep in a private GitHub repository. If publishing later, GitHub Pages can serve it directly from the repo root or a `docs/` folder.

## Roadmap Notes

- Research current no-hosting publishing platforms for small web games/apps. The target is a simple online version without maintaining a server.
- Explore a Telegram Mini App version through a bot. Prior experience exists with a home-server setup; the next version should use more reliable hosting/deployment. Implementation notes will be added after the Telegram instructions are provided.
- If mobile becomes a target, redesign controls for touch input instead of only adapting the desktop keyboard flow.
