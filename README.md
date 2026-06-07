# LABY — Maze Game

Pure static web game (no backend, no build step). Open `index.html` in a browser.

## Files

| File | Purpose |
|---|---|
| `index.html` | Single page: header with stats, game viewport, overlays, modals |
| `game.js` | All logic in one IIFE: maze gen, game state, camera, rendering, input |
| `style.css` | Full styling, ZX Spectrum palette, pixel font, animations |

## Architecture

### Maze generation (`generateMaze`)

- Recursive backtracking on odd-sized grid
- `WALL = '█'`, `PATH = ' '`, `EXIT = '$'`
- Extra paths opened (`grid cells / 60` walls removed) for multiple solutions
- Start: left side, randomly top `(1,1)` or bottom `(1,h-2)`
- Exit: right side on the opposite diagonal: `(w-2,h-2)` or `(w-2,1)`
- Default: 71x41, configurable up to 201x201

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
- `renderMaze()`: updates `className` on every cell each frame (fog/visible states)
- Enemies are created dynamically in `buildGrid()`, stored in `enemyEls[]`
- Fog of war: cells not recently revealed get `.cell-fog`. `FORGET_THRESHOLD = 10` moves

### Game state (`createGame`)

Key fields on `state`:

```
maze        — {grid[][], w, h, startPos, exitPos}
px, py      — player position (world coords)
camX, camY  — camera offset in cells
enemies[]   — {x, y, dir, ticks, minX, maxX, minY, maxY}
chaseEvery  — N: enemies chase player every N ticks
powerups[]  — {x, y, type}
effects     — {vision: N, freeze: N, away: N}
revealed[][] — moveCount when each cell was last revealed (-1 = never)
footprints  — Set of "x,y" strings
visited     — Set of "x,y" strings
score, moveCount, won, dead, totalPowerups, collectedPowerups
```

### Difficulty

Game starts with difficulty selection modal. Stored in `difficulty` variable, affects maze size and enemy behavior.

| Level | Maze size | Enemy density | Chase every N ticks |
|-------|-----------|--------------|-------------------|
| easy   | 71x41 | 1 per 600 cells | 10 |
| medium | 81x51 | 1 per 550 cells | 9 |
| hard   | 91x61 | 1 per 500 cells | 8 |

Chase: every N-th tick, enemy picks direction closest to player (including diagonal).
`state.chaseEvery` stores the interval. `DIFFICULTY` object holds config.

### Enemies (`placeEnemies`, `tickEnemies`)

- Vertical strips: maze width divided into `count` equal columns
- Each enemy gets one vertical strip (`minX..maxX`), full height (`minY=0, maxY=maze.h-3`)
- Spawns at nearest path cell to strip center
- Random walk with 8 directions, 25% chance to change direction per tick
- Every `chaseEvery` ticks: picks direction toward player
- When `away` effect active: picks direction away from player
- All enemies always move (even off-screen), tick every 600ms
- Enemy is 3x3 cells, collision: `e.x <= px < e.x+3 && e.y <= py < e.y+3`

### Powerups (`placePowerups`, `collectPowerup`)

- `PU_DENSITY = 100` — 1 powerup per 100 total cells
- Types cycle: `vision → freeze → xray → bonus → away` (`away` is shown to players as Repel)
- Placed on random `PATH` cells, at least 5 Manhattan distance from start
- Effects:
  - `vision` — radius 2, lasts 15 moves
  - `freeze` — stops all enemies, lasts 12 moves
  - `xray` — instant 9x9 reveal around player, cells fade by normal fog rules
  - `bonus` — instant +100 score, no duration
  - `away` / **Repel** — enemies flee from player, lasts 5 enemy ticks

### Scoring

- `+10` per new cell visited (first time stepping on it)
- `-1` per step onto an already visited cell; score is clamped at 0
- `+100` per `bonus` powerup collected

### UI flow

- **Header**: Moves, Size, Powerups (collected/total), Score, H Help button
- **R**: opens settings modal (custom maze size)
- **WASD / Arrows**: move
- **H**: opens help
- **Collect popup**: floating powerup name for 2 seconds, centered on screen
- **Win/Death overlays**: show moves + score, button to restart

## Visual style

- **Font**: `Bitcount Prop Single` (Google Fonts) — retro pixel font, sizes doubled (~200%) to compensate for smaller rendering
- **Palette**: ZX Spectrum
  - Background: `#000000` (black)
  - Walls: `#0000cd` (blue) / `#0000ff` border
  - Player: `#ffff00` (yellow) glow
  - Enemies: `#ff0000` (red) 3x3 blocks with eyes
  - Container border: `#00cdcd` (cyan) glow
  - Fog: `#1a1a2e`
  - Powerups: cyan/silver/magenta/gold/orange pixel module icons
- Cell size: `--cell-size: 36px` desktop, `25px` mobile

## Key constants (game.js top)

```
PU_DENSITY = 100       — powerups per total cells
Difficulty: easy (71x41, 600/10), medium (81x51, 550/9), hard (91x61, 500/8)
FORGET_THRESHOLD = 10  — fog returns after N moves
Cell: 36px (desktop) / 25px (mobile)
Tick: 600ms
Camera: 40% from left, 50% from top
Default maze: 71 x 41
```
