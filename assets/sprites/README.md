# LABY SVG sprite sources

These files are editable SVG sources for the game sprites.

Sprite rule: NES-style direct rendering. The game should place a sprite into its tile rectangle without decorative CSS frames, glow, inset, or extra pseudo-element details. If a sprite needs a border, shadow, empty space, or animation frame, draw it in the SVG source deliberately.

`assets/sprites/` is the active sprite set used by the game.

The game uses these files directly through `--pu-sprite: url("assets/sprites/...")` in `style.css`.
Edit a file, reload the browser, and the changed sprite should appear in the game.

Map powerups are rendered as the raw SVG stretched to the cell:

- cell size: `36x36` on desktop
- SVG source size: `36x36`
- no CSS frame around the SVG
- no CSS inset/padding around the SVG
- no CSS glow/filter on the SVG

Help icons use the same SVG files, scaled to the Help row icon box.

Collected map objects can also have their own sprite. Torch uses two files:

- `key-framed-cell.svg` — key on the map
- `powerup-torch-flame.svg` — uncollected torch powerup on the map and in Help
- `torch-lit-cell.svg` — lit torch left on the map after pickup

Enemies are rendered the same way:

- patrol enemy: `108x108`, because it occupies `3x3` cells
- hunter enemy: `72x72`, because it occupies `2x2` cells
- no CSS eyes/details layered on top

Player sprite is rendered the same way:

- player: `36x36`, because it occupies `1x1` cell
- short-track runner uses the same player SVG

Naming:

Players:

- `player-hero-1x1.svg` — main player and short-track replay runner, 1x1 cell

Map objects:

- `key-framed-cell.svg` — Key in frame
- `torch-lit-cell.svg` — Lit torch after pickup

Enemies:

- `enemy-patrol-3x3.svg` — Patrol enemy, 3x3 cells
- `enemy-hunter-2x2.svg` — Hunter enemy, 2x2 cells

Powerups:

- `powerup-vision-eye.svg` — Vision
- `powerup-freeze-snowflake.svg` — Freeze
- `powerup-xray-grid.svg` — X-Ray
- `powerup-bonus-plus.svg` — Bonus
- `powerup-life-heart.svg` — Life
- `powerup-repel-bars.svg` — Repel / Away
- `powerup-keyscan-crosshair.svg` — Key Locate
- `powerup-torch-flame.svg` — Torch

Keep `shape-rendering="crispEdges"` for ZX-style hard pixel edges.
