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

    // ─── Game State ────────────────────────────────────────────────────────
    const PU_TYPES = ['vision', 'freeze', 'xray', 'bonus', 'penalty', 'away'];
    const PU_DURATIONS = {vision: 15, freeze: 12, away: 5};
    const BONUS_POINTS = 100;
    const PENALTY_POINTS = 50;
    const CELL_POINTS = 10;
    const REVISIT_PENALTY = 1;
    const ENEMY_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    const FORGET_THRESHOLD = 10;
    const EXTRA_PATH_DENSITY = 40;
    const PU_DENSITY = 100;
    const KEY_DENSITY = 800;
    const HUNTER_DENSITY = 800;
    const DIFFICULTY = {
        easy:   {width: 71, height: 41, enemyDensity: 800, chaseEvery: 10, hunterChaseEvery: 8},
        medium: {width: 81, height: 51, enemyDensity: 700, chaseEvery: 9, hunterChaseEvery: 7},
        hard:   {width: 91, height: 61, enemyDensity: 600, chaseEvery: 8, hunterChaseEvery: 6},
    };
    let difficulty = 'easy';
    let currentSeed = makeSeed();

    function createGame(width = 71, height = 41) {
        const maze = generateMaze(width, height);
        const totalCells = maze.w * maze.h;
        const cfg = DIFFICULTY[difficulty];
        const enemyCount = Math.max(1, Math.floor(totalCells / cfg.enemyDensity));
        const hunterCount = Math.max(1, Math.floor(totalCells / HUNTER_DENSITY));
        const enemies = [
            ...placeEnemies(maze, enemyCount, 'patrol', 3, cfg.chaseEvery, []),
        ];
        enemies.push(...placeEnemies(maze, hunterCount, 'hunter', 2, cfg.hunterChaseEvery, enemies));

        const state = {
            maze,
            seed: currentSeed,
            px: maze.startPos.x,
            py: maze.startPos.y,
            moveCount: 0,
            score: 0,
            won: false,
            dead: false,
            enemies,
            revealed: createEmptyGrid(maze.w, maze.h),
            visible: createEmptyGrid(maze.w, maze.h),
            keys: [],
            totalKeys: Math.max(1, Math.floor(totalCells / KEY_DENSITY)),
            collectedKeys: 0,
            powerups: [],
            effects: {},
            keyScanUntil: 0,
            footprints: new Set(),
            visited: new Set(),
            camX: 0,
            camY: 0,
            totalPowerups: 0,
            collectedPowerups: 0,
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
        const rect = enemyRect(candidate);
        for (let i = 0; i < enemies.length; i++) {
            if (i === idx) continue;
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
        for (let i = 0; i < Math.min(state.totalKeys, candidates.length); i++) {
            state.keys.push({x: candidates[i].x, y: candidates[i].y, collected: false});
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
        for (let i = 0; i < scanCount; i++) {
            const c = candidates[i];
            state.powerups.push({x: c.x, y: c.y, type: 'keyscan'});
        }
        for (let i = scanCount; i < count; i++) {
            const c = candidates[i];
            const ptype = PU_TYPES[(i - scanCount) % PU_TYPES.length];
            state.powerups.push({x: c.x, y: c.y, type: ptype});
        }
        state.totalPowerups = state.powerups.length;
    }

    function effectiveRadius(state) {
        if (state.effects.vision) return 2;
        return 1;
    }

    function revealAround(state, cx, cy) {
        const r = effectiveRadius(state);
        const m = state.maze;
        const rev = state.revealed;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < m.w && ny >= 0 && ny < m.h) {
                    rev[ny][nx] = state.moveCount;
                }
            }
        }
    }

    function computeVisible(state) {
        const m = state.maze;
        const rev = state.revealed;
        const visible = state.visible;
        for (let y = 0; y < m.h; y++) {
            for (let x = 0; x < m.w; x++) {
                visible[y][x] = rev[y][x] >= 0 && (state.moveCount - rev[y][x]) <= FORGET_THRESHOLD;
                if (x === m.exitPos.x && y === m.exitPos.y) visible[y][x] = true;
            }
        }
        return visible;
    }

    function tickEnemies(state) {
        if (state.won || state.dead || state.effects.freeze) return;
        const fleeing = !!state.effects.away;
        for (const e of state.enemies) {
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

    function checkEnemyCollisions(state) {
        for (const e of state.enemies) {
            if (e.x <= state.px && state.px < e.x + e.size && e.y <= state.py && state.py < e.y + e.size) {
                state.dead = true;
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
                } else if (type === 'xray') {
                    revealArea(state, state.px, state.py, 4);
                } else if (type === 'keyscan') {
                    state.keyScanUntil = Date.now() + 5000;
                    setTimeout(() => {
                        if (state && Date.now() >= state.keyScanUntil) renderMaze();
                    }, 5050);
                } else {
                    state.effects[type] = PU_DURATIONS[type];
                }
                state.powerups.splice(i, 1);
                state.collectedPowerups++;
                return type;
            }
        }
        return null;
    }

    function collectKey(state) {
        for (const key of state.keys) {
            if (!key.collected && key.x === state.px && key.y === state.py) {
                key.collected = true;
                state.collectedKeys++;
                return true;
            }
        }
        return false;
    }

    function revealArea(state, cx, cy, r) {
        const m = state.maze;
        const rev = state.revealed;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < m.w && ny >= 0 && ny < m.h) {
                    rev[ny][nx] = state.moveCount;
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

    function updateCamera(state) {
        const cs = cellSize();
        const area = document.querySelector('.game-area');
        const availW = area.clientWidth - 4;
        const availH = area.clientHeight - 4;
        const m = state.maze;
        const viewW = Math.floor(availW / cs);
        const viewH = Math.floor(availH / cs);

        if (m.w <= viewW) {
            state.camX = 0;
        } else {
            const targetX = state.px - Math.floor(viewW * 0.4);
            state.camX = Math.max(0, Math.min(targetX, m.w - viewW));
        }

        if (m.h <= viewH) {
            state.camY = 0;
        } else {
            const targetY = state.py - Math.floor(viewH * 0.5);
            state.camY = Math.max(0, Math.min(targetY, m.h - viewH));
        }
    }

    // ─── DOM Refs ──────────────────────────────────────────────────────────
    const $ = (s) => document.querySelector(s);
    const appEl = $('.app');
    const mazeEl = $('#maze');
    const playerEl = $('#player');
    const containerEl = $('#maze-container');
    const movesEl = $('#moves');
    const sizeEl = $('#size');
    const scoreEl = $('#score');
    const enemiesEl = $('#enemies');
    const powerupsEl = $('#powerups');
    const keysEl = $('#keys');
    const seedEl = $('#seed');
    const effectsBar = $('#effects-bar');
    const collectPopup = $('#collect-popup');
    const winOverlay = $('#win-overlay');
    const winMoves = $('#win-moves');
    const deathOverlay = $('#death-overlay');
    const deathMoves = $('#death-moves');
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

    function setTransform(el, cacheName, value) {
        if (state[cacheName] !== value) {
            state[cacheName] = value;
            el.style.transform = value;
        }
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

    const PU_NAMES = {vision: 'VISION', freeze: 'FREEZE', xray: 'X-RAY', bonus: '+100 PTS', penalty: '-50 PTS', away: 'REPEL', keyscan: 'KEY SCAN'};
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
        const area = document.querySelector('.game-area');
        area.classList.add('shake');
        setTimeout(() => area.classList.remove('shake'), 500);
    }

    function flashScreen() {
        const flash = document.createElement('div');
        flash.className = 'screen-flash';
        document.querySelector('.game-area').appendChild(flash);
        setTimeout(() => flash.remove(), 260);
    }

    function applyEnemyPositions() {
        const cs = cellSize();
        for (let i = 0; i < state.enemies.length; i++) {
            if (enemyEls[i]) {
                const transform = `translate(${state.enemies[i].x * cs}px, ${state.enemies[i].y * cs}px)`;
                if (state.enemyTransforms[i] !== transform) {
                    state.enemyTransforms[i] = transform;
                    enemyEls[i].style.transform = transform;
                }
            }
        }
    }

    function renderMaze() {
        const m = state.maze;
        const visible = computeVisible(state);
        const puMap = {};
        const keyMap = {};
        const keyScanActive = Date.now() < state.keyScanUntil;
        state.powerups.forEach(p => { puMap[p.x + ',' + p.y] = p.type; });
        state.keys.forEach(k => {
            if (!k.collected) keyMap[k.x + ',' + k.y] = true;
        });

        for (let y = 0; y < m.h; y++) {
            for (let x = 0; x < m.w; x++) {
                const key = keyMap[x + ',' + y];
                let cls = 'cell ';

                if (!visible[y][x] && !(key && keyScanActive)) {
                    setCellClass(y, x, cls + 'cell-fog');
                    continue;
                }

                const ch = m.grid[y][x];
                const isExit = x === m.exitPos.x && y === m.exitPos.y;
                const pu = puMap[x + ',' + y];
                const isVisited = state.visited.has(x + ',' + y);
                const isFootprint = state.footprints.has(x + ',' + y);

                if (key) {
                    cls += 'cell-key';
                    if (keyScanActive && !visible[y][x]) cls += ' cell-key-scan';
                } else if (pu) {
                    cls += 'cell-powerup-' + pu;
                } else if (isVisited) {
                    cls += 'cell-visited';
                    if (ch === WALL) cls += ' cell-wall';
                    else if (isExit) cls += state.collectedKeys >= state.totalKeys ? ' cell-exit' : ' cell-exit-locked';
                    else cls += ' cell-path';
                } else if (isFootprint) {
                    cls += 'cell-footprint';
                    if (ch === WALL) cls += ' cell-wall';
                    else if (isExit) cls += state.collectedKeys >= state.totalKeys ? ' cell-exit' : ' cell-exit-locked';
                    else cls += ' cell-path';
                } else if (ch === WALL) {
                    cls += 'cell-wall';
                } else if (isExit) {
                    cls += state.collectedKeys >= state.totalKeys ? 'cell-exit' : 'cell-exit-locked';
                } else {
                    cls += 'cell-path';
                }
                setCellClass(y, x, cls);
            }
        }

        updateCamera(state);
        applyPositions();

        setText(movesEl, state.moveCount);
        setText(sizeEl, m.w + '\u00d7' + m.h);
        setText(scoreEl, state.score);
        setText(enemiesEl, state.enemies.length);
        setText(powerupsEl, state.collectedPowerups + '/' + state.totalPowerups);
        setText(keysEl, state.collectedKeys + '/' + state.totalKeys);
        setText(seedEl, state.seed);

        effectsBar.innerHTML = '';
        for (const [type, remaining] of Object.entries(state.effects)) {
            const badge = document.createElement('div');
            badge.className = 'effect-badge effect-' + type;
            badge.textContent = (PU_NAMES[type] || type.toUpperCase()) + ' ' + remaining;
            effectsBar.appendChild(badge);
        }
        if (keyScanActive) {
            const badge = document.createElement('div');
            badge.className = 'effect-badge effect-keyscan';
            badge.textContent = 'KEY SCAN ' + Math.ceil((state.keyScanUntil - Date.now()) / 1000);
            effectsBar.appendChild(badge);
        }

        if (state.dead) {
            deathMoves.textContent = state.moveCount;
            const el = $('#death-score');
            if (el) el.textContent = state.score;
            deathOverlay.classList.remove('hidden');
            setPaused(true);
            if (!state.deathHandled) {
                state.deathHandled = true;
                shakeScreen();
                sfxDeath();
            }
        } else {
            deathOverlay.classList.add('hidden');
        }

        if (state.won) {
            winMoves.textContent = state.moveCount;
            const el = $('#win-score');
            if (el) el.textContent = state.score;
            winOverlay.classList.remove('hidden');
            setPaused(true);
            if (!state.winHandled) {
                state.winHandled = true;
                sfxWin();
            }
        } else {
            winOverlay.classList.add('hidden');
        }
    }

    function applyPositions() {
        const cs = cellSize();
        const area = document.querySelector('.game-area');
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

    function closeSettings() {
        settingsModal.classList.add('hidden');
        if (helpModal.classList.contains('hidden')) setPaused(false);
    }

    function showDifficulty() {
        difficultyModal.classList.remove('hidden');
    }

    function toggleHelp() {
        if (helpModal.classList.contains('hidden')) {
            helpModal.classList.remove('hidden');
            setPaused(true);
        } else {
            helpModal.classList.add('hidden');
            if (settingsModal.classList.contains('hidden')) setPaused(false);
        }
    }

    const keyMap = {
        ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
        ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
        ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
        ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'h' || e.key === 'H') {
            if (!state || state.won || state.dead) return;
            toggleHelp();
            return;
        }
        if (!helpModal.classList.contains('hidden')) {
            if (e.key === 'Escape') toggleHelp();
            return;
        }
        if (!settingsModal.classList.contains('hidden')) {
            if (e.key === 'Escape') closeSettings();
            return;
        }
        if (paused) return;
        if (e.key in keyMap) {
            e.preventDefault();
            move(...keyMap[e.key]);
        } else if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            openSettings();
        }
    });

    $('#btn-new-after-win').addEventListener('click', showDifficulty);
    $('#btn-new-after-death').addEventListener('click', showDifficulty);
    $('#btn-cancel').addEventListener('click', closeSettings);
    $('#btn-help-close').addEventListener('click', toggleHelp);
    helpModal.querySelector('.modal-backdrop').addEventListener('click', toggleHelp);
    $('.help-hint').addEventListener('click', toggleHelp);

    $('#btn-generate').addEventListener('click', () => {
        const w = parseInt(inputWidth.value, 10) || 71;
        const h = parseInt(inputHeight.value, 10) || 41;
        const seed = inputSeed.value || makeSeed();
        closeSettings();
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
            newGame(cfg.width, cfg.height);
        });
    });
})();
