# wasm experiment — context and roadmap

> **Branch:** `experiment/wasm-maze`
> **Status:** working prototype, **not merged into `main`**. The pure-JS game on `main` is unaffected and remains the source of truth.
> **Last updated:** June 2026

This file exists so that **any** person or AI assistant opening this branch cold can understand what it is, why it exists, and what the open ideas are — without spelunking through git history.

---

## 1. What this branch is

An experiment that moves **one** piece of game logic — maze generation — out of `game.js` and into a **Rust core compiled to WebAssembly**. Everything else (rendering, input, enemy AI, scoring, UI) still runs in the existing vanilla JS. The goal was twofold:

1. Let the maintainer (background: 6502/NES assembly, prefers Rust) actually *touch* wasm hands-on: build a crate, compile it, load it in a browser, call it from JS. No frameworks, no bundler.
2. Prove out the architecture for a possible larger migration that would enable a **headless, code-blind AI benchmark** of the game (see §4).

The migration is **byte-for-byte deterministic** vs. the JS reference: the same seed + size produces the same grid on both paths. This is enforced by porting the PRNG and seed hash exactly (see §3).

### What works today
- `wasm/` Rust crate (`laby-core`): `generate_maze(width, height, seed) -> Maze`.
- Compiled artifact committed at `assets/wasm/laby_core_bg.wasm` (16 KB) + the wasm-bindgen JS glue at `assets/wasm/laby_core.js` (11 KB), loaded as a plain `<script>` (`--target no-modules`, so `file://` still works).
- `game.js` calls the wasm path when ready and **falls back to the original JS `generateMaze()`** if wasm isn't loaded yet or fails. The first game of a session may start on JS fallback while wasm streams in the background; subsequent games use wasm.
- 8 Rust unit tests (`cargo test` in `wasm/`) covering determinism, start/exit placement, dimension clamping, walkability.
- `laby.sh` has a `wasm` command / menu item to rebuild the crate.

### What is explicitly NOT done
- Enemy AI, visibility/fog, collision, scoring are **still JS**. Only maze generation moved.
- Not merged to `main`.
- No automated cross-check that JS-grid == wasm-grid for the same seed (the PRNG is verified by `cargo test`; visual/manual cross-check is the maintainer's responsibility before any merge).

---

## 2. The two lessons learned (read these before touching the glue)

Both are real bugs that were caught and fixed. They encode wasm/Rust-specific rules that a JS developer (or an AI without wasm experience) will trip on.

### Lesson A — wasm/Rust has no GC: mind `free()` ordering
`wasm_bindgen` returns Rust structs to JS as opaque handles. You **must** call `.free()` to return the memory, and you **must not** touch any field after `.free()` — it's a use-after-free, surfaced as `Uncaught Error: null pointer passed to rust`. Always snapshot every field into a JS local **before** `.free()`:

```js
// CORRECT
const grid = result.grid();
const w = result.width;
result.free();          // free only after all reads
return {grid, w};

// WRONG (caused the "empty field" bug)
result.free();
return {grid, w: result.width};   // read after free -> null pointer
```

### Lesson B — wasm-bindgen glue wants an object, not a positional arg
The generated `__wbg_init` expects `{module_or_path: "..."}`. Passing the path as a bare string hits a deprecated branch and warns on every load:

```js
// CORRECT
wasm_bindgen({module_or_path: 'assets/wasm/laby_core_bg.wasm'})

// WRONG (logs "using deprecated parameters...")
wasm_bindgen('assets/wasm/laby_core_bg.wasm')
```

---

## 3. The determinism contract (do not break this)

For the JS fallback and the wasm path to be interchangeable, the **entire** PRNG sequence — maze gen, enemy spawn, key/powerup/shelter placement, and runtime enemy randomness — must be identical. The wasm `generate_maze` therefore **returns the final PRNG state** (`Maze.rng_state`), and `game.js` calls `createRngFromState(state)` to continue the exact same `mulberry32` sequence afterwards. If you change anything below, you will desync the two paths:

| Concern | Where | Rule |
|---|---|---|
| PRNG algorithm | `mulberry32` | **32-bit only.** Constant `0x6D2B79F5`, all ops `wrapping_*`/`>>`/`^`. Not negotiable. |
| Seed hash | FNV-1a over **UTF-16 code units** | JS `charCodeAt` semantics; Rust must iterate `encode_utf16()`. ASCII seeds are unaffected, but non-ASCII would diverge if you used Rust `as_bytes()`. |
| Draw order | maze carve → extra paths → start/exit stamp | Must match `game.js::generateMaze` step for step. |
| Shuffles | Fisher–Yates with `floor(rng * (i+1))` | Rust port uses the same `floor` semantics. |

If you add a new randomized step, add it to **both** paths in the same order, or you desync.

---

## 4. The bigger vision: an AI benchmark

The original motivation. Today an AI agent (e.g. Codex) given this repo can simply read `generateMaze` + the seed and analytically solve the maze — no "playing" required. Moving logic into wasm raises that bar: the grid lives in wasm linear memory, not readable JS. For a *truly* vision-only benchmark, more leaks must be closed (DOM cell classes expose the explored map; the minimap leaks coords; the seed leaks on death). But the wasm migration is the architectural foundation either way. This branch is the first concrete step.

---

## 5. Open ideas / roadmap

Ordered roughly cheapest → most involved. None are committed; pick what's interesting.

### Idea 1 — Tighter types: `u8` coordinates (cheap, taste)
`Maze` fields `width/height/start_x/start_y/exit_x/exit_y` are `u32` but max grid is ~151 → `u8` is plenty. The only reason they're `u32` was to avoid thinking about operand width in index arithmetic. Switching to `u8` requires explicit widening casts at `y * width + x` and `width * height` (the multiplication widens). For someone with assembly instincts this is the natural discipline. **`rng_state` MUST stay `u32`** — mulberry32 is defined on 32 bits.

### Idea 2 — NES-style packed grid: 2 bits per cell (memory, flavor)
The grid has only 4 cell types (WALL/PATH/EXIT/START) → exactly 2 bits each. Currently `Vec<u8>` = 1 byte/cell. Packing to 2 bits/cell cuts grid memory **75%** (151×151: 5.7 KB → 1.4 KB). Inspired by NES CHR data (2 bits/pixel, 4 colors, 8×8 tiles = 16 bytes). Cost: bit masking on every access. Functions needed:
```rust
fn cell_get(grid: &[u8], x: u8, y: u8, w: u8) -> u8 {
    let bit = ((y as usize) * (w as usize) + (x as usize)) * 2;
    (grid[bit >> 3] >> (bit & 7)) & 0b11
}
// plus cell_set, and a packing build step
```
Pure exercise in bit discipline; no behavioral change.

### Idea 3 — Move enemy AI to wasm (real work, real payoff)
`tickEnemies`, `canPlaceEnemy`, `respawnEnemy`, `checkEnemyCollisions` are the next natural candidates. They're pure functions over `state` + the grid. Moving them would (a) give them real unit tests on the Rust side, (b) further shrink the JS-readable surface for the benchmark idea, (c) require exposing `state` across the boundary (the hard part — likely a shared `Uint8Array` view of the grid + a small fixed-layout struct). This is where the wasm migration stops being a "let's touch wasm" exercise and becomes an architecture.

### Idea 4 — Visibility/fog and pathfinding
`revealAround`/`computeVisible` and the BFS in `shortestPathBetween` are also pure-grid algorithms and port cleanly. Same shared-state challenge as Idea 3.

### Idea 5 — Headless benchmark harness
Once enough logic is in wasm, expose a `tick()` / `move(dx,dy)` / `observe()` API and drive it from a CLI (no browser). This is the "pure-reasoning benchmark" — no vision noise, fully reproducible by seed. Out of scope until Ideas 3–4 land.

---

## 6. How to work on this branch

```bash
cd /Users/dmitriiromanov/pi/laby
git checkout experiment/wasm-maze

# After editing wasm/src/lib.rs, rebuild + copy artifacts:
./laby.sh wasm        # menu item 12 / command 'wasm'

# Or manually:
cd wasm && wasm-pack build --target no-modules --release && \
  cp pkg/laby_core_bg.wasm ../assets/wasm/ && \
  cp pkg/laby_core.js ../assets/wasm/

# Run Rust tests:
cd wasm && cargo test

# Try it in a browser:
python3 -m http.server 8081    # then open http://127.0.0.1:8081/
```

Requires: `rustup target add wasm32-unknown-unknown` and `cargo install wasm-pack` (one-time).

When comparing against `main`: the same seed should render the identical maze. The seed is shown in the post-game screen; note one, switch branches, replay it.
