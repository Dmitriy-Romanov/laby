(() => {
    'use strict';

    let audioCtx = null;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function beep(freq, duration, type = 'square', vol = 0.18) {
        if (!audioCtx) return;
        try {
            const t = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + duration);
        } catch (e) {}
    }

    function sfxStep() { beep(200 + Math.random() * 150, 0.04, 'square', 0.18); }
    function sfxCollect() { beep(900, 0.06, 'square', 0.2); setTimeout(() => beep(1200, 0.08, 'square', 0.18), 60); }
    function sfxAllKeys() { [0, 85, 170, 255, 340].forEach((d, i) => setTimeout(() => beep([660, 880, 990, 1175, 1320][i], 0.09, 'square', 0.16), d)); }
    function sfxWin() { [0, 80, 160, 240, 320].forEach((d, i) => setTimeout(() => beep(300 + i * 150, 0.1, 'square', 0.18), d)); }
    function sfxDeath() { [0, 90, 180, 270].forEach((d, i) => setTimeout(() => beep(180 - i * 35, 0.15, 'square', 0.2), d)); }

    // ─── Maze Generation ────────────────────────────────────────────────
    const WALL = '\u2588';
    const PATH = ' ';
    const EXIT = '$';
    let rng = Math.random;

    function makeSeed() {
        return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0').toUpperCase();
    }

    function clampMazeSide(value, fallback) {
        const n = parseInt(value, 10);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(7, Math.min(MAX_CUSTOM_SIDE, n));
    }

    function seedHash(seed) {
        let h = 2166136261;
        for (let i = 0; i < seed.length; i++) {
            h ^= seed.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function createRng(seed) {
        let t = seedHash(seed);
        return () => {
            t += 0x6D2B79F5;
            let x = t;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }

    function createMazeGrid(w, h) {
        const grid = [];
        for (let y = 0; y < h; y++) {
            grid[y] = [];
            for (let x = 0; x < w; x++) grid[y][x] = WALL;
        }
        return grid;
    }

    function generateMaze(w, h) {
        if (w % 2 === 0) w++;
        if (h % 2 === 0) h++;
        w = Math.max(7, w);
        h = Math.max(7, h);

        const grid = createMazeGrid(w, h);
        const stack = [{x: 1, y: 1}];
        grid[1][1] = PATH;
        const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]];

        while (stack.length > 0) {
            const cx = stack[stack.length - 1].x;
            const cy = stack[stack.length - 1].y;
            shuffleArray(dirs);
            let carved = false;
            for (const [dc, dr] of dirs) {
                const nx = cx + dc;
                const ny = cy + dr;
                if (ny > 0 && ny < h - 1 && nx > 0 && nx < w - 1) {
                    if (grid[ny][nx] === WALL) {
                        grid[cy + Math.floor(dr / 2)][cx + Math.floor(dc / 2)] = PATH;
                        grid[ny][nx] = PATH;
                        stack.push({x: nx, y: ny});
                        carved = true;
                        break;
                    }
                }
            }
            if (!carved) stack.pop();
        }

        const startY = rng() < 0.5 ? 1 : h - 2;
        const exitY = startY === 1 ? h - 2 : 1;
        const exitX = w - 2;
        grid[1][1] = PATH;
        grid[h - 2][1] = PATH;
        grid[exitY][exitX] = EXIT;

        const candidates = [];
        for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
                if (grid[y][x] !== WALL) continue;
                const horiz = grid[y][x - 1] !== WALL && grid[y][x + 1] !== WALL;
                const vert = grid[y - 1][x] !== WALL && grid[y + 1][x] !== WALL;
                if (horiz || vert) candidates.push({x, y});
            }
        }
        shuffleArray(candidates);
        const cnt = Math.max(5, Math.floor((w * h) / EXTRA_PATH_DENSITY));
        for (let i = 0; i < Math.min(cnt, candidates.length); i++) {
            grid[candidates[i].y][candidates[i].x] = PATH;
        }

        return {grid, w, h, startPos: {x: 1, y: startY}, exitPos: {x: exitX, y: exitY}};
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    function cellDistance(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    function spreadDistance(totalCells, count, minDistance) {
        if (count <= 1) return 0;
        return Math.max(minDistance, Math.floor(Math.sqrt(totalCells / count) * 0.55));
    }

    function selectSpreadCells(candidates, count, minDistance, blockers = []) {
        const picked = [];
        let distance = minDistance;

        while (picked.length < count && distance >= 0) {
            picked.length = 0;
            for (const c of candidates) {
                if (picked.length >= count) break;
                const farFromPicked = picked.every(p => cellDistance(c, p) >= distance);
                const farFromBlockers = blockers.every(p => cellDistance(c, p) >= Math.min(distance, minDistance));
                if (farFromPicked && farFromBlockers) picked.push(c);
            }
            distance -= 2;
        }

        if (picked.length < count) {
            for (const c of candidates) {
                if (picked.length >= count) break;
                if (!picked.some(p => p.x === c.x && p.y === c.y)) picked.push(c);
            }
        }

        return picked.slice(0, count);
    }

    // ─── Game State ────────────────────────────────────────────────────────
    const PU_TYPES = ['vision', 'freeze', 'xray', 'bonus', 'penalty', 'away'];
    const PU_DURATIONS = {vision: 15, freeze: 12, away: 5};
    const BONUS_POINTS = 100;
    const KEY_SCAN_BONUS_POINTS = 20;
    const LIFE_BONUS_POINTS = 40;
    const PENALTY_POINTS = 50;
    const CELL_POINTS = 10;
    const REVISIT_PENALTY = 1;
    const START_LIVES = 5;
    const FINAL_LIVES_BONUS = 4000;
    const FINAL_DOTS_BONUS = 4000;
    const FINAL_POWERUPS_BONUS = 2000;
    const HIT_RESPAWN_MS = 5000;
    const HIT_INVULNERABLE_MS = 900;
    const ENEMY_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    const FORGET_THRESHOLD = 7;
    const PERMA_VISIBLE = -2;
    const TORCH_RADIUS = 4;
    const TORCH_EDGE_MARGIN = TORCH_RADIUS + 2;
    const MAX_CUSTOM_SIDE = 151;
    const EXTRA_PATH_DENSITY = 32;
    const PU_DENSITY = 100;
    const KEY_DENSITY = 800;
    const HUNTER_DENSITY = 800;
    const DIFFICULTY = {
        beginner: {width: 51, height: 31, enemyDensity: 0, chaseEvery: 0, hunterChaseEvery: 0, enemies: false},
        easy:   {width: 71, height: 41, enemyDensity: 800, chaseEvery: 10, hunterChaseEvery: 8},
        medium: {width: 81, height: 51, enemyDensity: 700, chaseEvery: 9, hunterChaseEvery: 7},
        hard:   {width: 91, height: 61, enemyDensity: 600, chaseEvery: 8, hunterChaseEvery: 6},
        custom: {width: 71, height: 41, enemyDensity: 800, chaseEvery: 10, hunterChaseEvery: 8},
    };
    const SCORE_STORAGE_KEY = 'laby.highScores.v1';
    const DEBUG_SNAPSHOT_KEY = 'laby.debugSnapshot.v1';
    const SCORE_LEVELS = ['easy', 'medium', 'hard'];
    const SCORE_LIMIT = 5;
    const SCORE_NAME_LIMIT = 7;
    let difficulty = 'easy';
    let currentSeed = makeSeed();

    function createGame(width = 71, height = 41) {
        const maze = generateMaze(width, height);
        const totalCells = maze.w * maze.h;
        const cfg = DIFFICULTY[difficulty];
        const enemies = [];
        if (cfg.enemies !== false) {
            const enemyCount = Math.max(1, Math.floor(totalCells / cfg.enemyDensity));
            const hunterCount = Math.max(1, Math.floor(totalCells / HUNTER_DENSITY));
            enemies.push(...placeEnemies(maze, enemyCount, 'patrol', 3, cfg.chaseEvery, []));
            enemies.push(...placeEnemies(maze, hunterCount, 'hunter', 2, cfg.hunterChaseEvery, enemies));
        }

        const state = {
            maze,
            seed: currentSeed,
            px: maze.startPos.x,
            py: maze.startPos.y,
            moveCount: 0,
            score: 0,
            lives: START_LIVES,
            invulnerableUntil: 0,
            won: false,
            dead: false,
            enemies,
            revealed: createEmptyGrid(maze.w, maze.h),
            visible: createEmptyGrid(maze.w, maze.h),
            keys: [],
            totalKeys: Math.max(1, Math.floor(totalCells / KEY_DENSITY)),
            collectedKeys: 0,
            powerups: [],
            torches: [],
            effects: {},
            replayKeys: null,
            replayCollectedKeys: 0,
            footprints: new Set(),
            visited: new Set(),
            camX: 0,
            camY: 0,
            totalPowerups: 0,
            collectedPowerups: 0,
            totalGoodPowerups: 0,
            collectedGoodPowerups: 0,
            finalScoreApplied: false,
            baseScore: 0,
            finalBonus: null,
            shortTrackRoute: null,
            walkableCellCount: null,
        };

        revealAround(state, state.px, state.py);
        state.footprints.add(state.px + ',' + state.py);
        state.visited.add(state.px + ',' + state.py);
        placeKeys(state);
        placePowerups(state);
        return state;
    }

    function createEmptyGrid(w, h) {
        const grid = [];
        for (let y = 0; y < h; y++) grid[y] = new Array(w).fill(-1);
        return grid;
    }

    function enemyRect(enemy, x = enemy.x, y = enemy.y) {
        return {x, y, w: enemy.size, h: enemy.size};
    }

    function rectsOverlap(a, b, pad = 0) {
        return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x &&
            a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
    }

    function canPlaceEnemy(enemies, idx, candidate) {
        const now = Date.now();
        const rect = enemyRect(candidate);
        for (let i = 0; i < enemies.length; i++) {
            if (i === idx) continue;
            if (enemies[i].inactiveUntil && enemies[i].inactiveUntil > now) continue;
            if (rectsOverlap(rect, enemyRect(enemies[i]), 1)) return false;
        }
        return true;
    }

    function placeEnemies(maze, count, type, size, chaseEvery, existing) {
        const enemies = [];
        const stripW = maze.w / count;
        const occupied = [...(existing || [])];

        for (let i = 0; i < count; i++) {
            const xS = Math.max(1, Math.floor(i * stripW));
            const xE = Math.min(maze.w - 1, Math.floor((i + 1) * stripW));
            const cx = Math.floor((xS + xE) / 2);
            const cy = Math.floor(maze.h / 2);

            let bestX = cx, bestY = cy, bestDist = Infinity;
            for (let y = 1; y < maze.h - 1; y++) {
                for (let x = xS; x < xE; x++) {
                    if (maze.grid[y][x] !== WALL) {
                        const candidate = {x, y, size};
                        if (!canPlaceEnemy(occupied, -1, candidate)) continue;
                        const d = Math.abs(x - cx) + Math.abs(y - cy);
                        if (d < bestDist) { bestDist = d; bestX = x; bestY = y; }
                    }
                }
            }

            enemies.push({
                type,
                size,
                x: bestX,
                y: bestY,
                dir: Math.floor(rng() * ENEMY_DIRS.length),
                ticks: 0,
                chaseEvery,
                inactiveUntil: 0,
                minX: xS,
                maxX: Math.min(xE, maze.w) - size,
                minY: 0,
                maxY: maze.h - size,
            });
            occupied.push(enemies[enemies.length - 1]);
        }
        return enemies;
    }

    function placeKeys(state) {
        const m = state.maze;
        const candidates = [];
        for (let y = 2; y < m.h - 2; y++) {
            for (let x = 2; x < m.w - 2; x++) {
                if (m.grid[y][x] === PATH && Math.abs(x - state.px) + Math.abs(y - state.py) >= 8) {
                    candidates.push({x, y});
                }
            }
        }
        shuffleArray(candidates);
        const keyCount = Math.min(state.totalKeys, candidates.length);
        const keyDistance = spreadDistance(m.w * m.h, keyCount, 14);
        const cells = selectSpreadCells(candidates, keyCount, keyDistance);
        for (const c of cells) {
            state.keys.push({x: c.x, y: c.y, collected: false});
        }
        state.totalKeys = state.keys.length;
    }

    function placePowerups(state) {
        const m = state.maze;
        const candidates = [];
        const keyCells = new Set(state.keys.map(k => k.x + ',' + k.y));
        for (let y = 2; y < m.h - 2; y++) {
            for (let x = 2; x < m.w - 2; x++) {
                if (m.grid[y][x] === PATH && !keyCells.has(x + ',' + y) &&
                    Math.abs(x - state.px) + Math.abs(y - state.py) >= 5) {
                    candidates.push({x, y});
                }
            }
        }
        shuffleArray(candidates);
        const count = Math.min(Math.floor((m.w * m.h) / PU_DENSITY), candidates.length);
        const scanCount = Math.min(state.totalKeys * 2, count);
        const powerupDistance = spreadDistance(m.w * m.h, count, 6);
        const scanCells = selectSpreadCells(candidates, scanCount, powerupDistance, state.keys);
        const occupied = [...state.keys, ...scanCells];
        const usedCells = new Set(scanCells.map(c => c.x + ',' + c.y));
        const remainingCandidates = candidates.filter(c => !usedCells.has(c.x + ',' + c.y));
        const torchCandidates = remainingCandidates.filter(c =>
            c.x >= TORCH_EDGE_MARGIN && c.x < m.w - TORCH_EDGE_MARGIN &&
            c.y >= TORCH_EDGE_MARGIN && c.y < m.h - TORCH_EDGE_MARGIN
        );
        const torchCount = Math.min(state.totalKeys * 2, count - scanCount, torchCandidates.length);
        const torchCells = selectSpreadCells(torchCandidates, torchCount, 12, occupied);
        torchCells.forEach(c => usedCells.add(c.x + ',' + c.y));
        const afterTorchCount = Math.max(0, count - scanCount - torchCount);
        const lifeCells = selectSpreadCells(
            candidates.filter(c => !usedCells.has(c.x + ',' + c.y)),
            Math.min(state.totalKeys, afterTorchCount),
            powerupDistance,
            [...occupied, ...torchCells]
        );
        lifeCells.forEach(c => usedCells.add(c.x + ',' + c.y));
        const otherCells = selectSpreadCells(
            candidates.filter(c => !usedCells.has(c.x + ',' + c.y)),
            Math.max(0, afterTorchCount - lifeCells.length),
            powerupDistance,
            [...occupied, ...torchCells, ...lifeCells]
        );

        for (let i = 0; i < scanCount; i++) {
            const c = scanCells[i];
            state.powerups.push({x: c.x, y: c.y, type: 'keyscan'});
        }
        for (const c of torchCells) {
            state.powerups.push({x: c.x, y: c.y, type: 'torch'});
        }
        for (const c of lifeCells) {
            state.powerups.push({x: c.x, y: c.y, type: 'life'});
        }
        for (let i = 0; i < otherCells.length; i++) {
            const c = otherCells[i];
            const ptype = PU_TYPES[i % PU_TYPES.length];
            state.powerups.push({x: c.x, y: c.y, type: ptype});
        }
        state.totalPowerups = state.powerups.length;
        state.totalGoodPowerups = state.powerups.filter(p => p.type !== 'penalty').length;
    }

    function effectiveRadius(state) {
        if (state.effects.vision) return 2;
        return 1;
    }

    function revealCell(state, x, y) {
        if (state.revealed[y][x] !== PERMA_VISIBLE) state.revealed[y][x] = state.moveCount;
    }

    function revealCellPermanent(state, x, y) {
        state.revealed[y][x] = PERMA_VISIBLE;
    }

    function revealCirclePermanent(state, cx, cy, r) {
        const m = state.maze;
        const r2 = r * r;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r2) continue;
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < m.w && ny >= 0 && ny < m.h) {
                    revealCellPermanent(state, nx, ny);
                }
            }
        }
    }

    function revealAroundPermanent(state, cx, cy, r = 1) {
        const m = state.maze;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < m.w && ny >= 0 && ny < m.h) {
                    revealCellPermanent(state, nx, ny);
                }
            }
        }
    }

    function resetReplayVisibility(state) {
        for (let y = 0; y < state.maze.h; y++) {
            state.revealed[y].fill(-1);
        }
    }

    function applyKeyScan(state) {
        const hiddenKeys = state.keys.filter(key =>
            !key.collected && state.revealed[key.y][key.x] !== PERMA_VISIBLE
        );
        if (!hiddenKeys.length) {
            state.score += KEY_SCAN_BONUS_POINTS;
            return 'score';
        }
        const key = hiddenKeys[Math.floor(rng() * hiddenKeys.length)];
        revealCellPermanent(state, key.x, key.y);
        return 'key';
    }

    function revealAround(state, cx, cy) {
        const baseRadius = effectiveRadius(state);
        const m = state.maze;
        const revealIfInside = (x, y) => {
            if (x >= 0 && x < m.w && y >= 0 && y < m.h) revealCell(state, x, y);
        };

        if (state.effects.vision) {
            const r = TORCH_RADIUS;
            const r2 = r * r;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy <= r2) revealIfInside(cx + dx, cy + dy);
                }
            }
            return;
        }

        for (let dy = -baseRadius; dy <= baseRadius; dy++) {
            for (let dx = -baseRadius; dx <= baseRadius; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                revealIfInside(nx, ny);
            }
        }

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            for (let step = 1; step <= 3; step++) {
                const nx = cx + dx * step;
                const ny = cy + dy * step;
                if (nx < 0 || nx >= m.w || ny < 0 || ny >= m.h) break;

                revealCell(state, nx, ny);
                if (dx !== 0) {
                    revealIfInside(nx, ny - 1);
                    revealIfInside(nx, ny + 1);
                } else {
                    revealIfInside(nx - 1, ny);
                    revealIfInside(nx + 1, ny);
                }
                if (m.grid[ny][nx] === WALL) break;
            }
        }
    }

    function computeVisible(state) {
        const m = state.maze;
        const rev = state.revealed;
        const visible = state.visible;
        for (let y = 0; y < m.h; y++) {
            for (let x = 0; x < m.w; x++) {
                visible[y][x] = rev[y][x] === PERMA_VISIBLE ||
                    (rev[y][x] >= 0 && (state.moveCount - rev[y][x]) <= FORGET_THRESHOLD);
                if (x === m.exitPos.x && y === m.exitPos.y) visible[y][x] = true;
            }
        }
        return visible;
    }

    function tickEnemies(state) {
        if (state.won || state.dead || state.effects.freeze) return;
        const fleeing = !!state.effects.away;
        const now = Date.now();
        for (const e of state.enemies) {
            if (e.inactiveUntil && e.inactiveUntil > now) continue;
            if (e.inactiveUntil && e.inactiveUntil <= now) respawnEnemy(state, e);
            e.ticks++;
            if (fleeing) {
                let bestDir = e.dir;
                let bestDist = -1;
                for (let d = 0; d < ENEMY_DIRS.length; d++) {
                    const [ddx, ddy] = ENEMY_DIRS[d];
                    const nx = e.x + ddx;
                    const ny = e.y + ddy;
                    if (nx < e.minX || nx > e.maxX || ny < e.minY || ny > e.maxY) continue;
                    const dist = Math.abs(nx - state.px) + Math.abs(ny - state.py);
                    if (dist > bestDist) { bestDist = dist; bestDir = d; }
                }
                e.dir = bestDir;
            } else if (e.ticks % e.chaseEvery === 0) {
                const chaseNoise = e.type === 'hunter' ? 0.45 : 0;
                if (chaseNoise && rng() < chaseNoise) {
                    e.dir = Math.floor(rng() * ENEMY_DIRS.length);
                } else {
                    let bestDir = e.dir;
                    let bestDist = Infinity;
                    for (let d = 0; d < ENEMY_DIRS.length; d++) {
                        const [ddx, ddy] = ENEMY_DIRS[d];
                        const nx = e.x + ddx;
                        const ny = e.y + ddy;
                        if (nx < e.minX || nx > e.maxX || ny < e.minY || ny > e.maxY) continue;
                        const dist = Math.abs(nx - state.px) + Math.abs(ny - state.py);
                        if (dist < bestDist) { bestDist = dist; bestDir = d; }
                    }
                    e.dir = bestDir;
                }
            } else if (rng() < 0.25) {
                e.dir = Math.floor(rng() * ENEMY_DIRS.length);
            }
            const [dx, dy] = ENEMY_DIRS[e.dir];
            const nx = e.x + dx;
            const ny = e.y + dy;
            if (nx >= e.minX && nx <= e.maxX && ny >= e.minY && ny <= e.maxY &&
                canPlaceEnemy(state.enemies, state.enemies.indexOf(e), {...e, x: nx, y: ny})) {
                e.x = nx;
                e.y = ny;
            } else {
                e.dir = Math.floor(rng() * ENEMY_DIRS.length);
            }
        }
        checkEnemyCollisions(state);
    }

    function respawnEnemy(state, enemy) {
        const candidates = [];
        const m = state.maze;
        for (let y = enemy.minY; y <= enemy.maxY; y++) {
            for (let x = enemy.minX; x <= enemy.maxX; x++) {
                if (m.grid[y][x] === WALL) continue;
                const candidate = {...enemy, x, y, inactiveUntil: 0};
                if (!canPlaceEnemy(state.enemies, state.enemies.indexOf(enemy), candidate)) continue;
                candidates.push({x, y, dist: Math.abs(x - state.px) + Math.abs(y - state.py)});
            }
        }
        if (!candidates.length) {
            enemy.inactiveUntil = Date.now() + 1000;
            return;
        }
        candidates.sort((a, b) => b.dist - a.dist);
        const pick = candidates[Math.floor(rng() * Math.min(8, candidates.length))];
        enemy.x = pick.x;
        enemy.y = pick.y;
        enemy.dir = Math.floor(rng() * ENEMY_DIRS.length);
        enemy.ticks = 0;
        enemy.inactiveUntil = 0;
    }

    function checkEnemyCollisions(state) {
        if (Date.now() < state.invulnerableUntil) return;
        for (const e of state.enemies) {
            if (e.inactiveUntil && e.inactiveUntil > Date.now()) continue;
            if (e.x <= state.px && state.px < e.x + e.size && e.y <= state.py && state.py < e.y + e.size) {
                if (state.lives <= 1) {
                    state.lives = 0;
                    state.dead = true;
                } else {
                    state.lives--;
                    state.invulnerableUntil = Date.now() + HIT_INVULNERABLE_MS;
                    e.inactiveUntil = Date.now() + HIT_RESPAWN_MS;
                    showCollectPopup('LIFE -1');
                    sfxDeath();
                }
                return;
            }
        }
    }

    function tickEffects(state) {
        const expired = [];
        for (const etype in state.effects) {
            state.effects[etype]--;
            if (state.effects[etype] <= 0) expired.push(etype);
        }
        for (const etype of expired) delete state.effects[etype];
    }

    function collectPowerup(state) {
        for (let i = 0; i < state.powerups.length; i++) {
            const p = state.powerups[i];
            if (p.x === state.px && p.y === state.py) {
                const type = p.type;
                if (type === 'bonus') {
                    state.score += BONUS_POINTS;
                } else if (type === 'penalty') {
                    state.score = Math.max(0, state.score - PENALTY_POINTS);
                } else if (type === 'life') {
                    if (state.lives < START_LIVES) state.lives++;
                    else {
                        state.score += LIFE_BONUS_POINTS;
                        state.powerups.splice(i, 1);
                        state.collectedPowerups++;
                        state.collectedGoodPowerups++;
                        return 'life-bonus';
                    }
                } else if (type === 'xray') {
                    revealArea(state, state.px, state.py, 6);
                } else if (type === 'keyscan') {
                    const result = applyKeyScan(state);
                    state.powerups.splice(i, 1);
                    state.collectedPowerups++;
                    state.collectedGoodPowerups++;
                    return result === 'score' ? 'keyscan-bonus' : type;
                } else if (type === 'torch') {
                    state.torches.push({x: p.x, y: p.y});
                    revealCirclePermanent(state, p.x, p.y, TORCH_RADIUS);
                } else {
                    state.effects[type] = PU_DURATIONS[type];
                }
                state.powerups.splice(i, 1);
                state.collectedPowerups++;
                if (type !== 'penalty') state.collectedGoodPowerups++;
                return type;
            }
        }
        return null;
    }

    function collectKey(state) {
        for (const key of state.keys) {
            if (!key.collected && key.x === state.px && key.y === state.py) {
                key.collected = true;
                if (state.revealed[key.y][key.x] === PERMA_VISIBLE) {
                    state.revealed[key.y][key.x] = state.moveCount;
                }
                state.collectedKeys++;
                return true;
            }
        }
        return false;
    }

    function revealArea(state, cx, cy, r) {
        const m = state.maze;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < m.w && ny >= 0 && ny < m.h) {
                    revealCell(state, nx, ny);
                }
            }
        }
    }

    function dropFootprint(state) {
        state.footprints.add(state.px + ',' + state.py);
    }

    function markVisited(state) {
        const key = state.px + ',' + state.py;
        if (!state.visited.has(key)) {
            state.visited.add(key);
            state.score += CELL_POINTS;
        } else {
            state.score = Math.max(0, state.score - REVISIT_PENALTY);
        }
    }

    function canMove(state, dx, dy) {
        const m = state.maze;
        const nx = state.px + dx;
        const ny = state.py + dy;
        if (nx >= 0 && nx < m.w && ny >= 0 && ny < m.h) {
            return m.grid[ny][nx] !== WALL;
        }
        return false;
    }

    function updateCamera(state, focusX = state.px, focusY = state.py) {
        const m = state.maze;
        const {viewW, viewH} = getViewSize();

        if (m.w <= viewW) {
            state.camX = 0;
        } else {
            const targetX = focusX - Math.floor(viewW * 0.4);
            state.camX = Math.max(0, Math.min(targetX, m.w - viewW));
        }

        if (m.h <= viewH) {
            state.camY = 0;
        } else {
            const targetY = focusY - Math.floor(viewH * 0.5);
            state.camY = Math.max(0, Math.min(targetY, m.h - viewH));
        }
    }

    function getViewSize() {
        const cs = cellSize();
        return {
            viewW: Math.floor((gameAreaEl.clientWidth - 4) / cs),
            viewH: Math.floor((gameAreaEl.clientHeight - 4) / cs),
        };
    }

    // ─── DOM Refs ──────────────────────────────────────────────────────────
    const $ = (s) => document.querySelector(s);
    const appEl = $('.app');
    const gameAreaEl = $('.game-area');
    const mazeEl = $('#maze');
    const playerEl = $('#player');
    const containerEl = $('#maze-container');
    const trackRunnerEl = $('#track-runner');
    const minimapEl = $('#minimap');
    const movesEl = $('#moves');
    const scoreEl = $('#score');
    const powerupsEl = $('#powerups');
    const dotsEl = $('#dots');
    const livesBarEl = $('#lives-bar');
    const keysBarEl = $('#keys-bar');
    const collectPopup = $('#collect-popup');
    const winOverlay = $('#win-overlay');
    const winMoves = $('#win-moves');
    const winShortMoves = $('#win-short-moves');
    const winVisited = $('#win-visited');
    const winSeed = $('#win-seed');
    const winBreakdown = $('#win-breakdown');
    const deathOverlay = $('#death-overlay');
    const deathMoves = $('#death-moves');
    const deathSeed = $('#death-seed');
    const deathBreakdown = $('#death-breakdown');
    const scoresOverlay = $('#scores-overlay');
    const scoreListEl = $('#score-list');
    const scoreHelpEl = $('#score-help');
    const settingsModal = $('#settings-modal');
    const helpModal = $('#help-modal');
    const difficultyModal = $('#difficulty-modal');
    const inputWidth = $('#input-width');
    const inputHeight = $('#input-height');
    const inputSeed = $('#input-seed');

    let moving = false;
    let tickInterval = null;
    let state = null;
    let paused = false;
    let enemyEls = [];
    let scoreTables = loadScoreTables();
    let activeScoreTab = 'easy';
    let pendingScoreEntry = null;
    let shortTrackTimer = null;

    function setPaused(value) {
        paused = value;
        appEl.classList.toggle('is-paused', paused);
        document.body.classList.toggle('is-paused', paused);
        if (paused) {
            stopTick();
        } else if (state && !state.dead && !state.won) {
            startTick();
        }
    }

    function cellSize() {
        return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-size'));
    }

    function padStat(value, size) {
        return String(Math.max(0, value)).padStart(size, '0').slice(-size);
    }

    function renderIconBar(el, total, filled, symbol, activeClass) {
        if (!el) return;
        const safeTotal = Math.max(0, total);
        const safeFilled = Math.max(0, Math.min(filled, safeTotal));
        let html = '';
        for (let i = 0; i < safeTotal; i++) {
            html += '<span class="hud-icon ' + (i < safeFilled ? activeClass : '') + '">' + symbol + '</span>';
        }
        if (el.dataset.html !== html) {
            el.dataset.html = html;
            el.innerHTML = html;
        }
    }

    function setText(el, value) {
        const text = String(value);
        if (el.textContent !== text) el.textContent = text;
    }

    function setCellClass(y, x, className) {
        if (state.cellClasses[y][x] !== className) {
            state.cellClasses[y][x] = className;
            state.cells[y][x].className = className;
        }
    }

    function posKey(p) {
        return p.x + ',' + p.y;
    }

    function shortestPathBetween(m, from, to) {
        const start = posKey(from);
        const target = posKey(to);
        if (start === target) return [{x: from.x, y: from.y}];
        const queue = [{x: from.x, y: from.y}];
        const prev = new Map([[start, null]]);
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

        for (let qi = 0; qi < queue.length; qi++) {
            const cur = queue[qi];
            for (const [dx, dy] of dirs) {
                const nx = cur.x + dx;
                const ny = cur.y + dy;
                if (nx < 0 || nx >= m.w || ny < 0 || ny >= m.h) continue;
                if (m.grid[ny][nx] === WALL) continue;
                const key = nx + ',' + ny;
                if (prev.has(key)) continue;
                prev.set(key, cur.x + ',' + cur.y);
                if (key === target) {
                    const path = [{x: nx, y: ny}];
                    let back = prev.get(key);
                    while (back) {
                        const [bx, by] = back.split(',').map(Number);
                        path.push({x: bx, y: by});
                        back = prev.get(back);
                    }
                    return path.reverse();
                }
                queue.push({x: nx, y: ny});
            }
        }
        return [];
    }

    function concatRouteSegments(points) {
        const route = [];
        for (let i = 0; i < points.length - 1; i++) {
            const segment = shortestPathBetween(state.maze, points[i], points[i + 1]);
            if (!segment.length) return [];
            route.push(...(i === 0 ? segment : segment.slice(1)));
        }
        return route;
    }

    function nearestKeyOrder(keys) {
        const remaining = keys.slice();
        const order = [];
        let cur = state.maze.startPos;
        while (remaining.length) {
            let bestIndex = 0;
            let bestPath = null;
            for (let i = 0; i < remaining.length; i++) {
                const path = shortestPathBetween(state.maze, cur, remaining[i]);
                if (!bestPath || path.length < bestPath.length) {
                    bestPath = path;
                    bestIndex = i;
                }
            }
            const [next] = remaining.splice(bestIndex, 1);
            order.push(next);
            cur = next;
        }
        return order;
    }

    function exactKeyOrder(keys) {
        const points = [state.maze.startPos, ...keys, state.maze.exitPos];
        const distances = Array.from({length: points.length}, () => []);
        for (let i = 0; i < points.length; i++) {
            for (let j = 0; j < points.length; j++) {
                if (i === j) distances[i][j] = 0;
                else distances[i][j] = shortestPathBetween(state.maze, points[i], points[j]).length - 1;
            }
        }

        const allMask = (1 << keys.length) - 1;
        const memo = new Map();
        function solve(at, mask) {
            const key = at + ':' + mask;
            if (memo.has(key)) return memo.get(key);
            if (mask === allMask) return {cost: distances[at][points.length - 1], order: []};
            let best = {cost: Infinity, order: []};
            for (let i = 0; i < keys.length; i++) {
                if (mask & (1 << i)) continue;
                const next = i + 1;
                const tail = solve(next, mask | (1 << i));
                const cost = distances[at][next] + tail.cost;
                if (cost < best.cost) best = {cost, order: [keys[i], ...tail.order]};
            }
            memo.set(key, best);
            return best;
        }
        return solve(0, 0).order;
    }

    function buildShortTrackRoute() {
        if (state.shortTrackRoute) return state.shortTrackRoute;
        const keys = state.keys.map(k => ({x: k.x, y: k.y}));
        const orderedKeys = keys.length <= 10 ? exactKeyOrder(keys) : nearestKeyOrder(keys);
        state.shortTrackRoute = concatRouteSegments([state.maze.startPos, ...orderedKeys, state.maze.exitPos]);
        return state.shortTrackRoute;
    }

    function drawMinimap() {
        if (!state || !minimapEl) return;
        const ctx = minimapEl.getContext('2d');
        const m = state.maze;
        const w = minimapEl.width;
        const h = minimapEl.height;
        const pad = 8;
        const innerW = w - pad * 2;
        const innerH = h - pad * 2;
        const scale = Math.min(innerW / m.w, innerH / m.h);
        const mapW = Math.max(1, Math.round(m.w * scale));
        const mapH = Math.max(1, Math.round(m.h * scale));
        const ox = Math.floor((w - mapW) / 2);
        const oy = Math.floor((h - mapH) / 2);
        const view = getViewSize();
        const viewW = Math.min(m.w, view.viewW);
        const viewH = Math.min(m.h, view.viewH);
        const viewX = ox + Math.round(state.camX * scale);
        const viewY = oy + Math.round(state.camY * scale);
        const viewRectW = Math.max(2, Math.round(viewW * scale));
        const viewRectH = Math.max(2, Math.round(viewH * scale));
        const playerX = ox + Math.round((state.px + 0.5) * scale);
        const playerY = oy + Math.round((state.py + 0.5) * scale);
        const startX = ox + Math.round((m.startPos.x + 0.5) * scale);
        const startY = oy + Math.round((m.startPos.y + 0.5) * scale);
        const exitX = ox + Math.round((m.exitPos.x + 0.5) * scale);
        const exitY = oy + Math.round((m.exitPos.y + 0.5) * scale);

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0, 0, 205, 0.28)';
        ctx.fillRect(ox, oy, mapW, mapH);
        ctx.strokeStyle = '#00cdcd';
        ctx.lineWidth = 2;
        ctx.strokeRect(ox + 0.5, oy + 0.5, mapW - 1, mapH - 1);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(viewX + 0.5, viewY + 0.5, viewRectW, viewRectH);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(startX - 1, startY - 1, 3, 3);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(exitX - 2.5, exitY - 2.5, 5, 5);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(playerX - 2, playerY - 2, 5, 5);
        ctx.strokeStyle = '#ff0000';
        ctx.strokeRect(playerX - 2.5, playerY - 2.5, 5, 5);
    }

    function setTransform(el, cacheName, value) {
        if (state[cacheName] !== value) {
            state[cacheName] = value;
            el.style.transform = value;
        }
    }

    function defaultScoreEntry() {
        return {name: 'PLAYER', score: 0, moves: 9999, lives: 0, seed: '', date: ''};
    }

    function defaultScoreTables() {
        const tables = {};
        SCORE_LEVELS.forEach(level => {
            tables[level] = Array.from({length: SCORE_LIMIT}, defaultScoreEntry);
        });
        return tables;
    }

    function normalizeScoreTables(raw) {
        const defaults = defaultScoreTables();
        if (!raw || typeof raw !== 'object') return defaults;
        SCORE_LEVELS.forEach(level => {
            const rows = Array.isArray(raw[level]) ? raw[level] : [];
            defaults[level] = rows.slice(0, SCORE_LIMIT).map(row => ({
                name: String(row.name || 'PLAYER').slice(0, SCORE_NAME_LIMIT).toUpperCase(),
                score: Math.max(0, parseInt(row.score, 10) || 0),
                moves: Math.max(0, parseInt(row.moves, 10) || 9999),
                lives: Math.max(0, Math.min(START_LIVES, parseInt(row.lives, 10) || 0)),
                seed: String(row.seed || ''),
                date: String(row.date || ''),
            }));
            while (defaults[level].length < SCORE_LIMIT) defaults[level].push(defaultScoreEntry());
        });
        return defaults;
    }

    function loadScoreTables() {
        try {
            return normalizeScoreTables(JSON.parse(localStorage.getItem(SCORE_STORAGE_KEY)));
        } catch (e) {
            return defaultScoreTables();
        }
    }

    function saveScoreTables() {
        try {
            localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(scoreTables));
        } catch (e) {}
    }

    function sortScoreRows(rows) {
        return rows.slice().sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.moves !== b.moves) return a.moves - b.moves;
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
    }

    function scoreInsertIndex(level, entry) {
        if (entry.score <= 0) return -1;
        const rows = sortScoreRows([...(scoreTables[level] || []), entry]).slice(0, SCORE_LIMIT);
        return rows.indexOf(entry);
    }

    function formatScore(value) {
        return String(value).padStart(4, '0');
    }

    function scoreNameInputText() {
        const name = pendingScoreEntry ? pendingScoreEntry.name : '';
        const padded = (name + '_'.repeat(SCORE_NAME_LIMIT)).slice(0, SCORE_NAME_LIMIT);
        return padded.slice(0, name.length) + '<span class="score-cursor">_</span>' + padded.slice(name.length + 1);
    }

    function renderScoreTabs() {
        document.querySelectorAll('[data-score-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.scoreTab === activeScoreTab);
        });
    }

    function renderScoreTable() {
        renderScoreTabs();
        const rows = scoreTables[activeScoreTab] || [];
        scoreListEl.innerHTML = '';
        rows.forEach((row, index) => {
            const li = document.createElement('li');
            const isEntry = pendingScoreEntry && pendingScoreEntry.level === activeScoreTab &&
                pendingScoreEntry.index === index;
            li.className = 'score-row' + (isEntry ? ' is-entry' : '');
            const rank = document.createElement('span');
            const name = document.createElement('span');
            const score = document.createElement('span');
            const moves = document.createElement('span');
            const lives = document.createElement('span');
            rank.className = 'score-rank';
            name.className = 'score-name';
            score.className = 'score-score';
            moves.className = 'score-moves';
            lives.className = 'score-lives';
            rank.textContent = index + 1;
            if (isEntry) {
                name.classList.add('score-input');
                name.innerHTML = scoreNameInputText();
            } else {
                name.textContent = row.name;
            }
            score.textContent = formatScore(row.score);
            moves.textContent = row.score > 0 ? row.moves : '----';
            lives.textContent = row.score > 0 ? '♥' + row.lives : '---';
            li.append(rank, name, score, moves, lives);
            scoreListEl.appendChild(li);
        });
        if (pendingScoreEntry) {
            scoreHelpEl.textContent = 'Type name, Enter to save';
        } else {
            scoreHelpEl.textContent = 'Space: close';
        }
    }

    function showScores(level = difficulty) {
        activeScoreTab = SCORE_LEVELS.includes(level) ? level : 'easy';
        scoresOverlay.classList.remove('hidden');
        setPaused(true);
        renderScoreTable();
    }

    function closeScores() {
        if (pendingScoreEntry) {
            submitScoreName();
            return;
        }
        scoresOverlay.classList.add('hidden');
        if (!state) {
            setPaused(false);
        } else if (!state.dead && !state.won &&
            helpModal.classList.contains('hidden') && settingsModal.classList.contains('hidden')) {
            setPaused(false);
        }
    }

    function resetScoreTables() {
        pendingScoreEntry = null;
        scoreTables = defaultScoreTables();
        saveScoreTables();
        showScores(activeScoreTab);
    }

    function scoreInputChar(e) {
        if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
        if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
        if (/^Numpad[0-9]$/.test(e.code)) return e.code.slice(6);
        if (/^[a-zA-Z0-9]$/.test(e.key)) return e.key.toUpperCase();
        return '';
    }

    function handleScoreInput(e) {
        if (!pendingScoreEntry) return false;
        if (e.key === 'Enter') {
            submitScoreName();
            return true;
        }
        if (e.key === 'Backspace') {
            pendingScoreEntry.name = pendingScoreEntry.name.slice(0, -1);
            renderScoreTable();
            return true;
        }
        const char = scoreInputChar(e);
        if (char && pendingScoreEntry.name.length < SCORE_NAME_LIMIT) {
            pendingScoreEntry.name += char;
            renderScoreTable();
            return true;
        }
        return true;
    }

    function submitScoreName() {
        if (!pendingScoreEntry) return;
        const entry = pendingScoreEntry.entry;
        entry.name = pendingScoreEntry.name || 'PLAYER';
        scoreTables[pendingScoreEntry.level][pendingScoreEntry.index] = entry;
        pendingScoreEntry = null;
        saveScoreTables();
        renderScoreTable();
    }

    function recordRunScore(result) {
        if (!SCORE_LEVELS.includes(difficulty)) return;
        const level = difficulty;
        const entry = {
            name: '',
            score: state.score,
            moves: state.moveCount,
            lives: state.lives,
            seed: state.seed,
            date: new Date().toISOString(),
            result,
        };
        const index = scoreInsertIndex(level, entry);
        if (index >= 0) {
            const rows = sortScoreRows([...(scoreTables[level] || []), entry]).slice(0, SCORE_LIMIT);
            scoreTables[level] = rows;
            pendingScoreEntry = {level, index, entry, name: ''};
        } else {
            pendingScoreEntry = null;
        }
        showScores(level);
    }

    // ─── Build & Render ─────────────────────────────────────────────────
    function buildGrid() {
        mazeEl.innerHTML = '';
        const cs = cellSize();
        const m = state.maze;
        mazeEl.style.gridTemplateColumns = `repeat(${m.w}, ${cs}px)`;
        mazeEl.style.gridTemplateRows = `repeat(${m.h}, ${cs}px)`;
        state.cells = [];
        state.cellClasses = [];
        state.containerTransform = '';
        state.playerTransform = '';
        state.enemyTransforms = [];
        for (let y = 0; y < m.h; y++) {
            state.cells[y] = [];
            state.cellClasses[y] = [];
            for (let x = 0; x < m.w; x++) {
                const cell = document.createElement('div');
                const className = 'cell cell-fog';
                cell.className = className;
                mazeEl.appendChild(cell);
                state.cells[y][x] = cell;
                state.cellClasses[y][x] = className;
            }
        }

        for (const el of enemyEls) el.remove();
        enemyEls = [];
        for (let i = 0; i < state.enemies.length; i++) {
            const el = document.createElement('div');
            el.className = 'enemy enemy-' + state.enemies[i].type;
            containerEl.appendChild(el);
            enemyEls.push(el);
            state.enemyTransforms[i] = '';
        }
    }

    const PU_NAMES = {vision: 'VISION', freeze: 'FREEZE', xray: 'X-RAY', bonus: '+100 PTS', penalty: '-50 PTS', life: 'LIFE', 'life-bonus': '+40 PTS', away: 'REPEL', torch: 'TORCH', keyscan: 'KEY LOCATE', 'keyscan-bonus': '+20 PTS'};
    let collectTimeout = null;

    function showCollectPopup(type) {
        if (collectTimeout) clearTimeout(collectTimeout);
        collectPopup.textContent = PU_NAMES[type] || type;
        collectPopup.className = 'collect-popup';
        collectTimeout = setTimeout(() => {
            collectPopup.classList.add('hidden');
            collectTimeout = null;
        }, 2000);
    }

    function shakeScreen() {
        const area = gameAreaEl;
        area.classList.add('shake');
        setTimeout(() => area.classList.remove('shake'), 500);
    }

    function flashScreen() {
        const flash = document.createElement('div');
        flash.className = 'screen-flash';
        gameAreaEl.appendChild(flash);
        setTimeout(() => flash.remove(), 260);
    }

    function applyEnemyPositions() {
        const cs = cellSize();
        const now = Date.now();
        for (let i = 0; i < state.enemies.length; i++) {
            if (enemyEls[i]) {
                enemyEls[i].classList.toggle('hidden', !!state.showingShortTrack);
                if (state.showingShortTrack) continue;
                const enemy = state.enemies[i];
                const inactive = enemy.inactiveUntil > now;
                enemyEls[i].classList.toggle('is-inactive', inactive);
                const transform = `translate(${enemy.x * cs}px, ${enemy.y * cs}px)`;
                if (state.enemyTransforms[i] !== transform) {
                    state.enemyTransforms[i] = transform;
                    enemyEls[i].style.transform = transform;
                }
            }
        }
    }

    function renderMaze() {
        const m = state.maze;
        if ((state.dead || state.won) && !state.finalScoreApplied) applyFinalScore();
        const visible = computeVisible(state);
        const puMap = {};
        const keyMap = {};
        const torchMap = {};
        const renderKeys = state.showingShortTrack && state.replayKeys ? state.replayKeys : state.keys;
        const renderCollectedKeys = state.showingShortTrack ? state.totalKeys : state.collectedKeys;
        state.powerups.forEach(p => { puMap[p.x + ',' + p.y] = p.type; });
        state.torches.forEach(t => { torchMap[t.x + ',' + t.y] = true; });
        renderKeys.forEach(k => {
            if (!k.collected) keyMap[k.x + ',' + k.y] = true;
        });

        for (let y = 0; y < m.h; y++) {
            for (let x = 0; x < m.w; x++) {
                const pos = x + ',' + y;
                const key = keyMap[pos];
                const scannedKey = key && state.revealed[y][x] === PERMA_VISIBLE;
                let cls = 'cell ';

                if (!visible[y][x]) {
                    setCellClass(y, x, cls + 'cell-fog');
                    continue;
                }

                const ch = m.grid[y][x];
                const isExit = x === m.exitPos.x && y === m.exitPos.y;
                const pu = puMap[pos];
                const torch = torchMap[pos];
                const isVisited = state.visited.has(x + ',' + y);
                const isFootprint = state.footprints.has(x + ',' + y);

                if (key) {
                    cls += 'cell-key';
                    if (scannedKey && !visible[y][x]) cls += ' cell-key-scan';
                } else if (pu) {
                    cls += 'cell-powerup-' + pu;
                } else if (torch) {
                    cls += 'cell-torch';
                } else if (isVisited) {
                    cls += 'cell-visited';
                    if (ch === WALL) cls += ' cell-wall';
                    else if (isExit) cls += renderCollectedKeys >= state.totalKeys ? ' cell-exit' : ' cell-exit-locked';
                    else cls += ' cell-path';
                } else if (isFootprint) {
                    cls += 'cell-footprint';
                    if (ch === WALL) cls += ' cell-wall';
                    else if (isExit) cls += renderCollectedKeys >= state.totalKeys ? ' cell-exit' : ' cell-exit-locked';
                    else cls += ' cell-path';
                } else if (ch === WALL) {
                    cls += 'cell-wall';
                } else if (isExit) {
                    cls += renderCollectedKeys >= state.totalKeys ? 'cell-exit' : 'cell-exit-locked';
                } else {
                    cls += 'cell-path';
                }
                setCellClass(y, x, cls);
            }
        }

        updateCamera(state);
        applyPositions();

        setText(movesEl, padStat(state.moveCount, 4));
        setText(scoreEl, padStat(state.score, 5));
        setText(powerupsEl, state.collectedPowerups + '/' + state.totalPowerups);
        setText(dotsEl, state.visited.size + '/' + countWalkableCells());
        renderIconBar(livesBarEl, START_LIVES, state.lives, '♥', 'is-life-on');
        renderIconBar(keysBarEl, state.totalKeys, renderCollectedKeys, '⚿', 'is-key-on');

        if (state.dead) {
            deathMoves.textContent = state.moveCount;
            const el = $('#death-score');
            if (el) el.textContent = state.score;
            if (deathSeed) deathSeed.textContent = state.seed;
            renderFinalBreakdown(deathBreakdown);
            deathOverlay.classList.remove('hidden');
            setPaused(true);
            if (!state.deathHandled) {
                state.deathHandled = true;
                shakeScreen();
                sfxDeath();
                recordRunScore('fail');
            }
        } else {
            deathOverlay.classList.add('hidden');
        }

        if (state.won) {
            winMoves.textContent = state.moveCount;
            const el = $('#win-score');
            if (el) el.textContent = state.score;
            if (winSeed) winSeed.textContent = state.seed;
            updateWinStats();
            renderFinalBreakdown(winBreakdown);
            if (state.showingShortTrack) winOverlay.classList.add('hidden');
            else winOverlay.classList.remove('hidden');
            setPaused(true);
            if (!state.winHandled) {
                state.winHandled = true;
                sfxWin();
                recordRunScore('win');
            }
        } else {
            winOverlay.classList.add('hidden');
        }
    }

    function applyPositions() {
        const cs = cellSize();
        const area = gameAreaEl;
        const availW = area.clientWidth - 4;
        const availH = area.clientHeight - 4;
        const m = state.maze;
        const mazeW = m.w * cs;
        const mazeH = m.h * cs;

        let tx, ty;
        if (mazeW <= availW) {
            tx = (availW - mazeW) / 2;
        } else {
            tx = -state.camX * cs;
        }
        if (mazeH <= availH) {
            ty = (availH - mazeH) / 2;
        } else {
            ty = -state.camY * cs;
        }

        setTransform(containerEl, 'containerTransform', `translate(${tx}px, ${ty}px)`);
        setTransform(playerEl, 'playerTransform', `translate(${state.px * cs}px, ${state.py * cs}px)`);

        applyEnemyPositions();
        drawMinimap();
    }

    function stopShortTrack() {
        if (shortTrackTimer) {
            clearInterval(shortTrackTimer);
            shortTrackTimer = null;
        }
        if (trackRunnerEl) trackRunnerEl.classList.add('hidden');
        if (state) state.showingShortTrack = false;
        if (state) {
            state.replayKeys = null;
            state.replayCollectedKeys = 0;
        }
        playerEl.classList.remove('is-replay-hidden');
    }

    function finishShortTrack() {
        if (shortTrackTimer) {
            clearInterval(shortTrackTimer);
            shortTrackTimer = null;
        }
        if (!state) return;
        state.showingShortTrack = false;
        state.replayKeys = null;
        state.replayCollectedKeys = 0;
        if (trackRunnerEl) trackRunnerEl.classList.add('hidden');
        playerEl.classList.remove('is-replay-hidden');
        renderMaze();
    }

    function setTrackRunnerPosition(point) {
        const cs = cellSize();
        setTransform(trackRunnerEl, 'trackRunnerTransform', `translate(${point.x * cs}px, ${point.y * cs}px)`);
        updateCamera(state, point.x, point.y);
        applyPositions();
    }

    function countWalkableCells() {
        if (state.walkableCellCount !== null) return state.walkableCellCount;
        let count = 0;
        for (let y = 0; y < state.maze.h; y++) {
            for (let x = 0; x < state.maze.w; x++) {
                if (state.maze.grid[y][x] !== WALL) count++;
            }
        }
        state.walkableCellCount = count;
        return state.walkableCellCount;
    }

    function computeFinalBonus() {
        const walkable = countWalkableCells();
        const livesBonus = Math.round(FINAL_LIVES_BONUS * (state.lives / START_LIVES));
        const dotsBonus = walkable > 0 ? Math.round(FINAL_DOTS_BONUS * (state.visited.size / walkable)) : 0;
        const powerupsBonus = state.totalGoodPowerups > 0 ?
            Math.round(FINAL_POWERUPS_BONUS * (state.collectedGoodPowerups / state.totalGoodPowerups)) : 0;
        return {
            livesBonus,
            dotsBonus,
            powerupsBonus,
            total: livesBonus + dotsBonus + powerupsBonus,
            walkable,
        };
    }

    function applyFinalScore() {
        if (state.finalScoreApplied) return;
        state.baseScore = state.score;
        state.finalBonus = computeFinalBonus();
        state.score += state.finalBonus.total;
        state.finalScoreApplied = true;
    }

    function renderFinalBreakdown(el) {
        if (!el || !state.finalBonus) return;
        const b = state.finalBonus;
        el.innerHTML = [
            'Game Score: ' + state.baseScore,
            'Bonuses:',
            'Lives: +' + b.livesBonus + ' (' + state.lives + '/' + START_LIVES + ')',
            'Dots: +' + b.dotsBonus + ' (' + state.visited.size + '/' + b.walkable + ')',
            'Powerups: +' + b.powerupsBonus + ' (' + state.collectedGoodPowerups + '/' + state.totalGoodPowerups + ')',
            'Total Score = ' + state.score,
        ].map(line => '<div>' + line + '</div>').join('');
    }

    function updateWinStats() {
        const route = buildShortTrackRoute();
        setText(winShortMoves, route.length ? route.length - 1 : '--');
        setText(winVisited, state.visited.size + '/' + countWalkableCells());
    }

    function showShortTrack() {
        if (!state || !state.won) return;
        stopShortTrack();
        const route = buildShortTrackRoute();
        if (!route.length) return;
        resetReplayVisibility(state);
        state.replayKeys = state.keys.map(k => ({x: k.x, y: k.y, collected: false}));
        state.replayCollectedKeys = 0;
        state.showingShortTrack = true;
        winOverlay.classList.add('hidden');
        setPaused(true);
        playerEl.classList.add('is-replay-hidden');
        renderMaze();
        trackRunnerEl.classList.remove('hidden');
        let index = 0;
        revealAroundPermanent(state, route[index].x, route[index].y);
        renderMaze();
        setTrackRunnerPosition(route[index]);
        shortTrackTimer = setInterval(() => {
            index++;
            if (index >= route.length) {
                finishShortTrack();
                return;
            }
            revealAroundPermanent(state, route[index].x, route[index].y);
            renderMaze();
            setTrackRunnerPosition(route[index]);
        }, 55);
    }

    function saveDebugSnapshot() {
        if (!state) return;
        const cs = cellSize();
        const viewport = {
            pixelWidth: gameAreaEl.clientWidth,
            pixelHeight: gameAreaEl.clientHeight,
            cellSize: cs,
            cellWidth: Math.floor((gameAreaEl.clientWidth - 4) / cs),
            cellHeight: Math.floor((gameAreaEl.clientHeight - 4) / cs),
            camX: state.camX,
            camY: state.camY,
        };
        const permanentCells = [];
        const recentVisibleCells = [];
        const staleRevealedCells = [];
        for (let y = 0; y < state.maze.h; y++) {
            for (let x = 0; x < state.maze.w; x++) {
                const revealedAt = state.revealed[y][x];
                if (revealedAt === PERMA_VISIBLE) {
                    permanentCells.push({x, y, ch: state.maze.grid[y][x]});
                } else if (revealedAt >= 0) {
                    const age = state.moveCount - revealedAt;
                    const cell = {x, y, ch: state.maze.grid[y][x], revealedAt, age};
                    if (age <= FORGET_THRESHOLD) recentVisibleCells.push(cell);
                    else staleRevealedCells.push(cell);
                }
            }
        }
        const snapshot = {
            version: 1,
            createdAt: new Date().toISOString(),
            seed: state.seed,
            difficulty,
            constants: {
                forgetThreshold: FORGET_THRESHOLD,
                permaVisible: PERMA_VISIBLE,
                torchRadius: TORCH_RADIUS,
                maxCustomSide: MAX_CUSTOM_SIDE,
                extraPathDensity: EXTRA_PATH_DENSITY,
                keyDensity: KEY_DENSITY,
                powerupDensity: PU_DENSITY,
                hunterDensity: HUNTER_DENSITY,
            },
            player: {x: state.px, y: state.py},
            viewport,
            camera: {x: state.camX, y: state.camY},
            maze: {
                w: state.maze.w,
                h: state.maze.h,
                startPos: state.maze.startPos,
                exitPos: state.maze.exitPos,
                grid: state.maze.grid.map(row => row.join('')),
            },
            visibility: {
                forgetThreshold: FORGET_THRESHOLD,
                permaVisible: PERMA_VISIBLE,
                revealed: state.revealed.map(row => row.slice()),
                visible: state.visible.map(row => row.slice()),
            },
            visibilitySummary: {
                permanentCells,
                recentVisibleCells,
                staleRevealedCells,
            },
            keys: state.keys.map(k => ({...k})),
            replayKeys: state.replayKeys ? state.replayKeys.map(k => ({...k})) : null,
            powerups: state.powerups.map(p => ({...p})),
            torches: state.torches.map(t => ({...t})),
            enemies: state.enemies.map(e => ({...e})),
            effects: {...state.effects},
            flags: {
                paused,
                showingShortTrack: !!state.showingShortTrack,
                shortTrackRunning: !!shortTrackTimer,
                invulnerableForMs: Math.max(0, state.invulnerableUntil - Date.now()),
            },
            stats: {
                moves: state.moveCount,
                score: state.score,
                won: state.won,
                dead: state.dead,
                lives: state.lives,
                totalKeys: state.totalKeys,
                collectedKeys: state.collectedKeys,
                replayCollectedKeys: state.replayCollectedKeys,
                totalPowerups: state.totalPowerups,
                collectedPowerups: state.collectedPowerups,
            },
        };
        const text = JSON.stringify(snapshot, null, 2);
        try {
            localStorage.setItem(DEBUG_SNAPSHOT_KEY, text);
        } catch (e) {}
        try {
            const blob = new Blob([text], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'laby-snapshot-' + state.seed + '-' + Date.now() + '.json';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {}
        showCollectPopup('SNAPSHOT SAVED');
    }

    // ─── Game Loop ────────────────────────────────────────────────────────
    function startTick() {
        stopTick();
        tickInterval = setInterval(() => {
            if (!state || paused) return;
            tickEnemies(state);
            applyEnemyPositions();
            if (state.dead || state.won) renderMaze();
        }, 600);
    }

    function stopTick() {
        if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    }

    function newGame(width, height, seed = makeSeed()) {
        initAudio();
        stopShortTrack();
        setPaused(false);
        currentSeed = seed.trim ? seed.trim().toUpperCase() : String(seed).toUpperCase();
        if (!currentSeed) currentSeed = makeSeed();
        rng = createRng(currentSeed);
        state = createGame(width, height);
        inputSeed.value = currentSeed;
        buildGrid();
        renderMaze();
        startTick();
    }

    function move(dx, dy) {
        if (!state || moving || paused) return;
        initAudio();
        moving = true;

        tickEffects(state);

        if (canMove(state, dx, dy)) {
            state.px += dx;
            state.py += dy;
            state.moveCount++;
            dropFootprint(state);
            markVisited(state);
            const keyCollected = collectKey(state);
            if (keyCollected) {
                showCollectPopup('KEY ACQUIRED');
                sfxCollect();
                if (state.collectedKeys === state.totalKeys) {
                    showCollectPopup('ALL KEYS');
                    sfxAllKeys();
                }
            }
            const pu = collectPowerup(state);
            if (pu) {
                showCollectPopup(pu);
                if (pu === 'xray') flashScreen();
                sfxCollect();
            } else if (!keyCollected) {
                sfxStep();
            }
            revealAround(state, state.px, state.py);
            const m = state.maze;
            if (state.py === m.exitPos.y && state.px === m.exitPos.x) {
                if (state.collectedKeys >= state.totalKeys) state.won = true;
                else showCollectPopup('KEYS REQUIRED');
            }
        }

        checkEnemyCollisions(state);
        renderMaze();
        moving = false;
    }

    // ─── UI Events ────────────────────────────────────────────────────────
    function openSettings() {
        settingsModal.classList.remove('hidden');
        setPaused(true);
        inputWidth.focus();
    }

    function openCustomFromDifficulty() {
        difficultyModal.classList.add('hidden');
        scoresOverlay.classList.add('hidden');
        openSettings();
    }

    function closeSettings() {
        settingsModal.classList.add('hidden');
        if (!state) {
            showDifficulty();
            return;
        }
        if (helpModal.classList.contains('hidden') && scoresOverlay.classList.contains('hidden')) setPaused(false);
    }

    function showDifficulty() {
        pendingScoreEntry = null;
        scoresOverlay.classList.add('hidden');
        difficultyModal.classList.remove('hidden');
        setPaused(true);
    }

    function toggleHelp() {
        if (helpModal.classList.contains('hidden')) {
            helpModal.classList.remove('hidden');
            setPaused(true);
        } else {
            helpModal.classList.add('hidden');
            if (settingsModal.classList.contains('hidden') && scoresOverlay.classList.contains('hidden')) setPaused(false);
        }
    }

    const keyMap = {
        ArrowUp: [0, -1], KeyW: [0, -1],
        ArrowDown: [0, 1], KeyS: [0, 1],
        ArrowLeft: [-1, 0], KeyA: [-1, 0],
        ArrowRight: [1, 0], KeyD: [1, 0],
    };

    document.addEventListener('keydown', (e) => {
        if (pendingScoreEntry) {
            if (handleScoreInput(e)) e.preventDefault();
            return;
        }
        if (e.code === 'Space') {
            e.preventDefault();
            if (scoresOverlay.classList.contains('hidden')) showScores(activeScoreTab);
            else closeScores();
            return;
        }
        if (e.code === 'KeyZ') {
            e.preventDefault();
            resetScoreTables();
            return;
        }
        if (e.code === 'KeyX') {
            e.preventDefault();
            saveDebugSnapshot();
            return;
        }
        if (!scoresOverlay.classList.contains('hidden')) {
            if (e.key === 'Escape') closeScores();
            return;
        }
        if (!helpModal.classList.contains('hidden')) {
            if (e.key === 'Escape' || e.code === 'KeyH') {
                e.preventDefault();
                toggleHelp();
            }
            return;
        }
        if (!settingsModal.classList.contains('hidden')) {
            if (e.key === 'Escape') closeSettings();
            return;
        }
        if (!difficultyModal.classList.contains('hidden')) {
            if (e.code === 'KeyC') {
                e.preventDefault();
                openCustomFromDifficulty();
            }
            return;
        }
        if (e.code === 'KeyH') {
            e.preventDefault();
            toggleHelp();
            return;
        }
        if (e.code === 'KeyN') {
            e.preventDefault();
            showDifficulty();
            return;
        }
        if (e.code === 'KeyC') {
            e.preventDefault();
            openSettings();
            return;
        }
        if (paused) return;
        if (e.code in keyMap) {
            e.preventDefault();
            move(...keyMap[e.code]);
        }
    });

    $('#btn-new-after-win').addEventListener('click', showDifficulty);
    $('#btn-show-short-track').addEventListener('click', showShortTrack);
    $('#btn-new-after-death').addEventListener('click', showDifficulty);
    $('#btn-new-after-scores').addEventListener('click', showDifficulty);
    $('#btn-scores-close').addEventListener('click', closeScores);
    $('#btn-cancel').addEventListener('click', closeSettings);
    $('#btn-help-close').addEventListener('click', toggleHelp);
    helpModal.querySelector('.modal-backdrop').addEventListener('click', toggleHelp);
    $('.help-hint').addEventListener('click', toggleHelp);

    $('#btn-generate').addEventListener('click', () => {
        const w = clampMazeSide(inputWidth.value, 71);
        const h = clampMazeSide(inputHeight.value, 41);
        inputWidth.value = w;
        inputHeight.value = h;
        const seed = inputSeed.value || makeSeed();
        difficulty = 'custom';
        settingsModal.classList.add('hidden');
        newGame(w, h, seed);
    });

    window.addEventListener('resize', () => {
        if (state) {
            updateCamera(state);
            applyPositions();
        }
    });

    document.querySelectorAll('[data-diff]').forEach(btn => {
        btn.addEventListener('click', () => {
            difficulty = btn.dataset.diff;
            const cfg = DIFFICULTY[difficulty];
            difficultyModal.classList.add('hidden');
            scoresOverlay.classList.add('hidden');
            newGame(cfg.width, cfg.height);
        });
    });

    const customMazeButton = $('[data-custom-maze]');
    if (customMazeButton) customMazeButton.addEventListener('click', openCustomFromDifficulty);

    document.querySelectorAll('[data-score-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (pendingScoreEntry) return;
            activeScoreTab = btn.dataset.scoreTab;
            renderScoreTable();
        });
    });
})();
