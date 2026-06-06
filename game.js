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
    function sfxAlert() { beep(350, 0.08, 'square', 0.16); }

    // ─── Maze Generation ────────────────────────────────────────────────
    const WALL = '\u2588';
    const PATH = ' ';
    const EXIT = '$';

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

        const exitY = h - 2;
        const exitX = w - 2;
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
        const cnt = Math.max(5, Math.floor((w * h) / 60));
        for (let i = 0; i < Math.min(cnt, candidates.length); i++) {
            grid[candidates[i].y][candidates[i].x] = PATH;
        }

        return {grid, w, h, exitPos: {x: exitX, y: exitY}};
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // ─── Game State ────────────────────────────────────────────────────────
    const PU_TYPES = ['vision', 'freeze', 'xray', 'bonus', 'away'];
    const PU_DURATIONS = {vision: 15, freeze: 12, away: 5};
    const PU_POINTS = {bonus: 100};
    const CELL_POINTS = 10;
    const ENEMY_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    const FORGET_THRESHOLD = 10;
    const PU_DENSITY = 100;
    const DIFFICULTY = {
        easy:   {enemyDensity: 600, chaseEvery: 10},
        medium: {enemyDensity: 600, chaseEvery: 9},
        hard:   {enemyDensity: 500, chaseEvery: 8},
    };
    let difficulty = 'easy';

    function createGame(width = 71, height = 41) {
        const maze = generateMaze(width, height);
        const totalCells = maze.w * maze.h;
        const cfg = DIFFICULTY[difficulty];
        const enemyCount = Math.max(1, Math.floor(totalCells / cfg.enemyDensity));
        const enemies = placeEnemies(maze, enemyCount);

        const state = {
            maze,
            px: 1,
            py: 1,
            moveCount: 0,
            score: 0,
            won: false,
            dead: false,
            enemies,
            chaseEvery: cfg.chaseEvery,
            revealed: createEmptyGrid(maze.w, maze.h),
            powerups: [],
            effects: {},
            footprints: new Set(),
            visited: new Set(),
            camX: 0,
            camY: 0,
            totalPowerups: 0,
            collectedPowerups: 0,
        };

        state.revealed[1][1] = 0;
        revealAround(state, 1, 1);
        state.footprints.add('1,1');
        state.visited.add('1,1');
        placePowerups(state);
        return state;
    }

    function createEmptyGrid(w, h) {
        const grid = [];
        for (let y = 0; y < h; y++) grid[y] = new Array(w).fill(-1);
        return grid;
    }

    function placeEnemies(maze, count) {
        const enemies = [];
        const stripW = maze.w / count;

        for (let i = 0; i < count; i++) {
            const xS = Math.max(1, Math.floor(i * stripW));
            const xE = Math.min(maze.w - 1, Math.floor((i + 1) * stripW));
            const cx = Math.floor((xS + xE) / 2);
            const cy = Math.floor(maze.h / 2);

            let bestX = cx, bestY = cy, bestDist = Infinity;
            for (let y = 1; y < maze.h - 1; y++) {
                for (let x = xS; x < xE; x++) {
                    if (maze.grid[y][x] !== WALL) {
                        const d = Math.abs(x - cx) + Math.abs(y - cy);
                        if (d < bestDist) { bestDist = d; bestX = x; bestY = y; }
                    }
                }
            }

            enemies.push({
                x: bestX,
                y: bestY,
                dir: Math.floor(Math.random() * ENEMY_DIRS.length),
                ticks: 0,
                minX: xS,
                maxX: Math.min(xE, maze.w) - 3,
                minY: 0,
                maxY: maze.h - 3,
            });
        }
        return enemies;
    }

    function placePowerups(state) {
        const m = state.maze;
        const candidates = [];
        for (let y = 2; y < m.h - 2; y++) {
            for (let x = 2; x < m.w - 2; x++) {
                if (m.grid[y][x] === PATH && Math.abs(x - 1) + Math.abs(y - 1) >= 5) {
                    candidates.push({x, y});
                }
            }
        }
        shuffleArray(candidates);
        const count = Math.min(Math.floor((m.w * m.h) / PU_DENSITY), candidates.length);
        for (let i = 0; i < count; i++) {
            const c = candidates[i];
            const ptype = PU_TYPES[i % PU_TYPES.length];
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
        const visible = [];
        for (let y = 0; y < m.h; y++) {
            visible[y] = [];
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
            } else if (e.ticks % state.chaseEvery === 0) {
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
            } else if (Math.random() < 0.25) {
                e.dir = Math.floor(Math.random() * ENEMY_DIRS.length);
            }
            const [dx, dy] = ENEMY_DIRS[e.dir];
            const nx = e.x + dx;
            const ny = e.y + dy;
            if (nx >= e.minX && nx <= e.maxX && ny >= e.minY && ny <= e.maxY) {
                e.x = nx;
                e.y = ny;
            } else {
                e.dir = Math.floor(Math.random() * ENEMY_DIRS.length);
            }
        }
        checkEnemyCollisions(state);
    }

    function checkEnemyCollisions(state) {
        for (const e of state.enemies) {
            if (e.x <= state.px && state.px < e.x + 3 && e.y <= state.py && state.py < e.y + 3) {
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
                    state.score += PU_POINTS.bonus;
                } else if (type === 'xray') {
                    revealArea(state, state.px, state.py, 4);
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
            return true;
        }
        return false;
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
    const mazeEl = $('#maze');
    const playerEl = $('#player');
    const containerEl = $('#maze-container');
    const movesEl = $('#moves');
    const sizeEl = $('#size');
    const scoreEl = $('#score');
    const enemiesEl = $('#enemies');
    const powerupsEl = $('#powerups');
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

    let gameId = null;
    let moving = false;
    let tickInterval = null;
    let state = null;
    let paused = false;
    let prevPups = 0;
    let enemyEls = [];

    function cellSize() {
        return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-size'));
    }

    // ─── Build & Render ─────────────────────────────────────────────────
    function buildGrid() {
        mazeEl.innerHTML = '';
        const cs = cellSize();
        const m = state.maze;
        mazeEl.style.gridTemplateColumns = `repeat(${m.w}, ${cs}px)`;
        mazeEl.style.gridTemplateRows = `repeat(${m.h}, ${cs}px)`;
        state.cells = [];
        for (let y = 0; y < m.h; y++) {
            state.cells[y] = [];
            for (let x = 0; x < m.w; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell cell-fog';
                mazeEl.appendChild(cell);
                state.cells[y][x] = cell;
            }
        }

        for (const el of enemyEls) el.remove();
        enemyEls = [];
        for (let i = 0; i < state.enemies.length; i++) {
            const el = document.createElement('div');
            el.className = 'enemy';
            containerEl.appendChild(el);
            enemyEls.push(el);
        }
    }

    const PU_NAMES = {vision: '◉ VISION', freeze: '✱ FREEZE', xray: 'Ω X-RAY', bonus: '★ +100 PTS', away: '⇐ AWAY'};
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

    function renderMaze() {
        const m = state.maze;
        const visible = computeVisible(state);
        const puMap = {};
        state.powerups.forEach(p => { puMap[p.x + ',' + p.y] = p.type; });

        for (let y = 0; y < m.h; y++) {
            for (let x = 0; x < m.w; x++) {
                const cell = state.cells[y][x];
                cell.className = 'cell';

                if (!visible[y][x]) {
                    cell.classList.add('cell-fog');
                    continue;
                }

                const ch = m.grid[y][x];
                const isExit = x === m.exitPos.x && y === m.exitPos.y;
                const pu = puMap[x + ',' + y];
                const isVisited = state.visited.has(x + ',' + y);
                const isFootprint = state.footprints.has(x + ',' + y);

                if (pu) {
                    cell.classList.add('cell-powerup-' + pu);
                } else if (isVisited) {
                    cell.classList.add('cell-visited');
                    if (ch === WALL) cell.classList.add('cell-wall');
                    else if (isExit) cell.classList.add('cell-exit');
                    else cell.classList.add('cell-path');
                } else if (isFootprint) {
                    cell.classList.add('cell-footprint');
                    if (ch === WALL) cell.classList.add('cell-wall');
                    else if (isExit) cell.classList.add('cell-exit');
                    else cell.classList.add('cell-path');
                } else if (ch === WALL) {
                    cell.classList.add('cell-wall');
                } else if (isExit) {
                    cell.classList.add('cell-exit');
                } else {
                    cell.classList.add('cell-path');
                }
            }
        }

        updateCamera(state);
        applyPositions();

        movesEl.textContent = state.moveCount;
        sizeEl.textContent = m.w + '\u00d7' + m.h;
        scoreEl.textContent = state.score;
        enemiesEl.textContent = state.enemies.length;
        powerupsEl.textContent = state.collectedPowerups + '/' + state.totalPowerups;

        effectsBar.innerHTML = '';
        for (const [type, remaining] of Object.entries(state.effects)) {
            const badge = document.createElement('div');
            badge.className = 'effect-badge effect-' + type;
            badge.textContent = type.toUpperCase() + ' ' + remaining;
            effectsBar.appendChild(badge);
        }

        let nearEnemy = false;
        for (const e of state.enemies) {
            if (Math.abs(e.x - state.px) + Math.abs(e.y - state.py) <= 4) {
                nearEnemy = true;
                break;
            }
        }
        if (nearEnemy && !state.dead && !state.won) {
            playerEl.classList.add('near-enemy');
            if (!playerEl.dataset.alerted) { sfxAlert(); playerEl.dataset.alerted = '1'; }
        } else {
            playerEl.classList.remove('near-enemy');
            delete playerEl.dataset.alerted;
        }

        if (state.dead) {
            deathMoves.textContent = state.moveCount;
            const el = $('#death-score');
            if (el) el.textContent = state.score;
            deathOverlay.classList.remove('hidden');
            stopTick();
            shakeScreen();
            sfxDeath();
        } else {
            deathOverlay.classList.add('hidden');
        }

        if (state.won) {
            winMoves.textContent = state.moveCount;
            const el = $('#win-score');
            if (el) el.textContent = state.score;
            winOverlay.classList.remove('hidden');
            stopTick();
            sfxWin();
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

        containerEl.style.transform = `translate(${tx}px, ${ty}px)`;
        playerEl.style.transform = `translate(${state.px * cs}px, ${state.py * cs}px)`;

        for (let i = 0; i < state.enemies.length; i++) {
            const e = state.enemies[i];
            if (enemyEls[i]) {
                enemyEls[i].style.transform = `translate(${e.x * cs}px, ${e.y * cs}px)`;
            }
        }
    }

    // ─── Game Loop ────────────────────────────────────────────────────────
    function startTick() {
        stopTick();
        tickInterval = setInterval(() => {
            if (!state || paused) return;
            tickEnemies(state);
            const cs = cellSize();
            for (let i = 0; i < state.enemies.length; i++) {
                if (enemyEls[i]) {
                    enemyEls[i].style.transform = `translate(${state.enemies[i].x * cs}px, ${state.enemies[i].y * cs}px)`;
                }
            }
            let nearEnemy = false;
            for (const e of state.enemies) {
                if (Math.abs(e.x - state.px) + Math.abs(e.y - state.py) <= 4) {
                    nearEnemy = true;
                    break;
                }
            }
            if (nearEnemy && !state.dead && !state.won) {
                playerEl.classList.add('near-enemy');
                if (!playerEl.dataset.alerted) { sfxAlert(); playerEl.dataset.alerted = '1'; }
            } else {
                playerEl.classList.remove('near-enemy');
                delete playerEl.dataset.alerted;
            }
            if (state.dead || state.won) renderMaze();
        }, 600);
    }

    function stopTick() {
        if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    }

    function newGame(width, height) {
        initAudio();
        state = createGame(width, height);
        gameId = state.id;
        prevPups = state.powerups.length;
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
            const pu = collectPowerup(state);
            if (pu) {
                showCollectPopup(pu);
                sfxCollect();
            } else {
                sfxStep();
            }
            revealAround(state, state.px, state.py);
            const m = state.maze;
            if (state.py === m.exitPos.y && state.px === m.exitPos.x) state.won = true;
        }

        checkEnemyCollisions(state);
        renderMaze();
        moving = false;
    }

    // ─── UI Events ────────────────────────────────────────────────────────
    function openSettings() { settingsModal.classList.remove('hidden'); inputWidth.focus(); }
    function closeSettings() { settingsModal.classList.add('hidden'); }

    function showDifficulty() {
        difficultyModal.classList.remove('hidden');
    }

    function toggleHelp() {
        if (helpModal.classList.contains('hidden')) {
            helpModal.classList.remove('hidden');
            paused = true;
            stopTick();
        } else {
            helpModal.classList.add('hidden');
            paused = false;
            startTick();
        }
    }

    const keyMap = {
        ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
        ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
        ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
        ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'F1' || e.key === 'h' || e.key === 'H') {
            if (e.key === 'F1') e.preventDefault();
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
        closeSettings();
        newGame(w, h);
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
            difficultyModal.classList.add('hidden');
            newGame(71, 41);
        });
    });
})();
