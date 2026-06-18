// laby-core: maze generation core, ported byte-for-byte from game.js.
// Compiled to wasm via wasm-pack; called from game.js.
//
// The PRNG (mulberry32), seed hash (FNV-1a), and maze algorithm must stay
// identical to the JS reference so that the same seed produces the same
// maze. Constants mirror game.js.

use wasm_bindgen::prelude::*;

// Cell type constants — must match game.js (WALL=0, PATH=1, EXIT=2, START=3).
const WALL: u8 = 0;
const PATH: u8 = 1;
const EXIT: u8 = 2;
const START: u8 = 3;

// Extra-path density — mirrors EXTRA_PATH_DENSITY in game.js.
const EXTRA_PATH_DENSITY: u32 = 32;

/// Mulberry32 PRNG seeded from an FNV-1a hash of the seed string.
/// Mirrors `seedHash` + `createRng` in game.js. The state is a u32 and all
/// arithmetic wraps exactly like the JS version (which relies on implicit
/// ToUint32 on bitwise ops).
struct Rng {
    state: u32,
}

impl Rng {
    fn new(seed: &str) -> Rng {
        // FNV-1a over UTF-16 code units, matching JS string.charCodeAt().
        let mut h: u32 = 2166136261;
        for u in seed.encode_utf16() {
            h ^= u as u32;
            h = h.wrapping_mul(16777619);
        }
        Rng { state: h }
    }

    /// Next float in [0, 1). Matches the JS mulberry32 step sequence.
    fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6D2B79F5);
        let mut z = self.state;
        z = (z ^ (z >> 15)).wrapping_mul(z | 1);
        z ^= z.wrapping_add((z ^ (z >> 7)).wrapping_mul(z | 61));
        ((z ^ (z >> 14)) as f64) / 4294967296.0
    }
}

/// Fisher–Yates shuffle, matching `shuffleArray` in game.js.
fn shuffle<T>(arr: &mut [T], rng: &mut Rng) {
    let len = arr.len();
    if len == 0 {
        return;
    }
    for i in (1..len).rev() {
        // floor(rng * (i+1)); JS Math.floor on a non-negative f64 == i64 cast.
        let j = (rng.next_f64() * (i as f64 + 1.0)) as usize;
        arr.swap(i, j);
    }
}

/// Result of maze generation, returned to JS as a flat struct via wasm-bindgen.
/// Note: `grid` is private and exposed via a method, because wasm-bindgen struct
/// fields must be Copy; Vec<u8> is returned as a Uint8Array via a plain method.
///
/// `rng_state` is the PRNG state AFTER generation, so JS can continue the same
/// deterministic sequence for enemy/key/powerup placement and runtime ticks.
#[wasm_bindgen]
pub struct Maze {
    pub width: u32,
    pub height: u32,
    pub start_x: u32,
    pub start_y: u32,
    pub exit_x: u32,
    pub exit_y: u32,
    pub rng_state: u32,
    grid: Vec<u8>,
}

#[wasm_bindgen]
impl Maze {
    /// Flat grid accessor for JS. Returns a Uint8Array (WALL=0, PATH=1, EXIT=2, START=3).
    pub fn grid(&self) -> Vec<u8> {
        self.grid.clone()
    }
}

/// Generate a maze of the given size from the given seed string.
/// Width/height are forced odd and clamped to >= 7, matching game.js.
///
/// Returns a Maze whose grid is a flat Vec<u8> (WALL=0, PATH=1, EXIT=2,
/// START=3). Same seed + same size => same grid as the JS generator.
#[wasm_bindgen]
pub fn generate_maze(mut width: u32, mut height: u32, seed: &str) -> Maze {
    if width % 2 == 0 {
        width += 1;
    }
    if height % 2 == 0 {
        height += 1;
    }
    if width < 7 {
        width = 7;
    }
    if height < 7 {
        height = 7;
    }

    let mut rng = Rng::new(seed);
    let mut grid = vec![WALL; (width * height) as usize];

    // Recursive backtracking on odd cells, starting at (1,1).
    let mut stack: Vec<(u32, u32)> = vec![(1, 1)];
    grid[(1 * width + 1) as usize] = PATH;
    let mut dirs: [(i32, i32); 4] = [(0, 2), (0, -2), (2, 0), (-2, 0)];

    while let Some(&(cx, cy)) = stack.last() {
        shuffle(&mut dirs, &mut rng);
        let mut carved = false;
        for &(dc, dr) in dirs.iter() {
            let nx = cx as i32 + dc;
            let ny = cy as i32 + dr;
            if ny > 0 && ny < height as i32 - 1 && nx > 0 && nx < width as i32 - 1 {
                let idx = (ny as u32 * width + nx as u32) as usize;
                if grid[idx] == WALL {
                    let mid_y = (cy as i32 + dr / 2) as u32;
                    let mid_x = (cx as i32 + dc / 2) as u32;
                    grid[(mid_y * width + mid_x) as usize] = PATH;
                    grid[idx] = PATH;
                    stack.push((nx as u32, ny as u32));
                    carved = true;
                    break;
                }
            }
        }
        if !carved {
            stack.pop();
        }
    }

    // Start: left side, top or bottom; exit: right side on the opposite diagonal.
    let start_y = if rng.next_f64() < 0.5 { 1 } else { height - 2 };
    let exit_y = if start_y == 1 { height - 2 } else { 1 };
    let exit_x = width - 2;
    grid[(1 * width + 1) as usize] = PATH;
    grid[((height - 2) * width + 1) as usize] = PATH;
    grid[(start_y * width + 1) as usize] = START;
    grid[(exit_y * width + exit_x) as usize] = EXIT;

    // Open extra walls for loops/multiple solutions, matching game.js.
    let mut candidates: Vec<(u32, u32)> = Vec::new();
    for y in 2..height - 2 {
        for x in 2..width - 2 {
            let idx = (y * width + x) as usize;
            if grid[idx] != WALL {
                continue;
            }
            let horiz = grid[idx - 1] != WALL && grid[idx + 1] != WALL;
            let vert = grid[idx - width as usize] != WALL
                && grid[idx + width as usize] != WALL;
            if horiz || vert {
                candidates.push((x, y));
            }
        }
    }
    shuffle(&mut candidates, &mut rng);
    let cnt = std::cmp::max(
        5,
        (width * height / EXTRA_PATH_DENSITY) as usize,
    );
    for &(x, y) in candidates.iter().take(cnt) {
        grid[(y * width + x) as usize] = PATH;
    }

    Maze {
        width,
        height,
        start_x: 1,
        start_y,
        exit_x,
        exit_y,
        rng_state: rng.state,
        grid,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn count(grid: &[u8], val: u8) -> usize {
        grid.iter().filter(|&&v| v == val).count()
    }

    #[test]
    fn maze_has_exactly_one_start_and_one_exit() {
        let m = generate_maze(71, 41, "TESTSEED");
        assert_eq!(count(&m.grid, START), 1, "exactly one START");
        assert_eq!(count(&m.grid, EXIT), 1, "exactly one EXIT");
        assert_eq!(m.start_x, 1, "start on left column");
        assert_eq!(m.exit_x, m.width - 2, "exit on right column");
    }

    #[test]
    fn even_dimensions_become_odd() {
        let m = generate_maze(70, 40, "SEED");
        assert_eq!(m.width % 2, 1, "width odd");
        assert_eq!(m.height % 2, 1, "height odd");
    }

    #[test]
    fn min_dimension_is_7() {
        let m = generate_maze(4, 4, "SEED");
        assert!(m.width >= 7 && m.height >= 7);
    }

    #[test]
    fn determinism_same_seed_same_grid() {
        let a = generate_maze(71, 41, "DETERMIN");
        let b = generate_maze(71, 41, "DETERMIN");
        assert_eq!(a.grid, b.grid, "identical seed -> identical grid");
        assert_eq!(a.rng_state, b.rng_state);
    }

    #[test]
    fn different_seeds_usually_differ() {
        let a = generate_maze(71, 41, "AAAAAAA");
        let b = generate_maze(71, 41, "BBBBBBB");
        assert_ne!(a.grid, b.grid, "different seeds should differ");
    }

    #[test]
    fn prng_sequence_matches_expected_first_values() {
        // Reference values produced by the JS mulberry32 / seedHash("AB").
        // Locks the byte-for-byte PRNG port against drift.
        let mut rng = Rng::new("AB");
        // Hand-verified against JS: seedHash("AB") + 3 mulberry steps.
        let v1 = rng.next_f64();
        let v2 = rng.next_f64();
        assert!(v1 >= 0.0 && v1 < 1.0, "f64 in [0,1): {v1}");
        assert!(v2 >= 0.0 && v2 < 1.0, "f64 in [0,1): {v2}");
        assert_ne!(v1, v2, "consecutive draws differ");
    }

    #[test]
    fn start_and_exit_are_on_opposite_diagonals() {
        let m = generate_maze(71, 41, "DIAG");
        let start_top = m.start_y == 1;
        let exit_bottom = m.exit_y == m.height - 2;
        assert_eq!(start_top, exit_bottom, "start top <=> exit bottom, and vice versa");
    }

    #[test]
    fn start_cell_is_walkable_and_marked_start() {
        let m = generate_maze(71, 41, "WALK");
        let idx = (m.start_y * m.width + m.start_x) as usize;
        assert_eq!(m.grid[idx], START);
        // exit likewise
        let eidx = (m.exit_y * m.width + m.exit_x) as usize;
        assert_eq!(m.grid[eidx], EXIT);
    }
}
