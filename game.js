(() => {
  "use strict";

  const TILE = 24;
  const DIRS = [
    { x: 1, y: 0, name: "right" },
    { x: 0, y: 1, name: "down" },
    { x: -1, y: 0, name: "left" },
    { x: 0, y: -1, name: "up" },
  ];
  const DIR_FROM_NAME = { right: 0, down: 1, left: 2, up: 3 };
  const OPPOSITE = [2, 3, 0, 1];

  // 21×21 beach maze. # wall  . fruit  o power snack
  // _ empty sand  H nest  - nest door
  const MAZE_ROWS = [
    "#####################",
    "#.........#.........#",
    "#o##.###.#.#.###.##o#",
    "#.##.....#.#.....##.#",
    "#....###.....###....#",
    "###.#...##.##...#.###",
    "#...#.#.......#.#...#",
    "#.###.#.##_##.#.###.#",
    "#.....#.#___#.#.....#",
    "#####.#.##-##.#.#####",
    "#.....#.#HHH#.#.....#",
    "#####.#.#####.#.#####",
    "#.....#.......#.....#",
    "#.###.#.#####.#.###.#",
    "#...#.#.......#.#...#",
    "###.#.#.##.##.#.#.###",
    "#.....###...###.....#",
    "#.##.....#.#.....##.#",
    "#o##.###.#.#.###.##o#",
    "#.....#.......#.....#",
    "#####################",
  ];

  const COLS = MAZE_ROWS[0].length;
  const ROWS = MAZE_ROWS.length;
  const PLAYER_START = { c: 10, r: 19 };
  const HOUSE = { c: 10, r: 10 };
  const EXIT_TILE = { c: 10, r: 7 };

  const BOOTS = [
    { name: "Amber", color: "#e85d04", shy: false, scatter: { c: 19, r: 1 }, personality: "chase", release: 0 },
    { name: "Sky", color: "#4cc9f0", shy: false, scatter: { c: 1, r: 1 }, personality: "ambush", release: 800 },
    { name: "Sandy", color: "#90be6d", shy: false, scatter: { c: 19, r: 19 }, personality: "flank", release: 2400 },
    { name: "Coral", color: "#ff85a1", shy: true, scatter: { c: 1, r: 19 }, personality: "shy", release: 4200 },
  ];

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const livesEl = document.getElementById("lives");
  const titleScreen = document.getElementById("title-screen");
  const messageScreen = document.getElementById("message-screen");
  const messageTitle = document.getElementById("message-title");
  const messageBody = document.getElementById("message-body");
  const messageBtn = document.getElementById("message-btn");
  const startBtn = document.getElementById("start-btn");

  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;

  const state = {
    phase: "title",
    score: 0,
    high: Number(localStorage.getItem("coco-world-high") || 0),
    lives: 3,
    level: 1,
    pelletsLeft: 0,
    grid: [],
    player: null,
    boots: [],
    keys: new Set(),
    nextDir: 3,
    frightenedUntil: 0,
    mode: "scatter",
    modeUntil: 0,
    combo: 0,
    startedAt: 0,
    invulnUntil: 0,
    lastStamp: 0,
    readyUntil: 0,
    floaters: [],
    anim: 0,
    messageAction: null,
  };

  let audioCtx = null;

  function mazeAt(c, r) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return "#";
    return state.grid[r][c];
  }

  function isWall(ch) {
    return ch === "#";
  }

  function playerWalkable(ch) {
    return ch === "." || ch === "o" || ch === "_" || ch === " ";
  }

  function bootWalkable(ch) {
    return playerWalkable(ch) || ch === "H" || ch === "-";
  }

  function tileCenter(c, r) {
    return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
  }

  function rebuildGrid() {
    state.grid = MAZE_ROWS.map((row) => row.split(""));
    state.pelletsLeft = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = state.grid[r][c];
        if (ch === "." || ch === "o") state.pelletsLeft++;
      }
    }
  }

  function makeActor(c, r, dir) {
    const p = tileCenter(c, r);
    return { c, r, x: p.x, y: p.y, dir, nextDir: dir, speed: 1.55 };
  }

  function resetActors() {
    state.player = makeActor(PLAYER_START.c, PLAYER_START.r, 2);
    state.player.speed = playerSpeed();
    state.boots = BOOTS.map((spec, i) => {
      const nest = [
        { c: 10, r: 7 },
        { c: 9, r: 10 },
        { c: 10, r: 10 },
        { c: 11, r: 10 },
      ][i];
      const b = makeActor(nest.c, nest.r, 3);
      b.spec = spec;
      b.mode = i === 0 ? "leave" : "house";
      b.frightened = false;
      b.eaten = false;
      b.releaseAt = state.startedAt + spec.release;
      b.speed = bootSpeed(b);
      b.flap = i * 0.7;
      return b;
    });
    state.nextDir = 2;
    state.frightenedUntil = 0;
    state.combo = 0;
    state.mode = "scatter";
    state.modeUntil = performance.now() + 6000;
    state.readyUntil = performance.now() + 1600;
    state.invulnUntil = state.readyUntil;
  }

  function playerSpeed() {
    return Math.min(2.05, 1.55 + (state.level - 1) * 0.06);
  }

  function bootSpeed(boot) {
    if (boot.eaten) return 3.1;
    if (boot.frightened) return 0.85;
    return Math.min(2.0, 1.28 + (state.level - 1) * 0.1);
  }

  function frightenedMs() {
    return Math.max(3200, 6800 - (state.level - 1) * 700);
  }

  function startGame(fromTitle) {
    state.score = fromTitle ? 0 : state.score;
    state.lives = fromTitle ? 3 : state.lives;
    state.level = fromTitle ? 1 : state.level;
    state.phase = "play";
    state.startedAt = performance.now();
    state.floaters = [];
    rebuildGrid();
    resetActors();
    titleScreen.classList.add("hidden");
    messageScreen.classList.add("hidden");
    syncHud();
    ensureAudio();
    tone(440, 0.08, "triangle", 0.05);
    setTimeout(() => tone(660, 0.12, "triangle", 0.05), 90);
  }

  function nextLevel() {
    state.level += 1;
    state.startedAt = performance.now();
    rebuildGrid();
    resetActors();
    state.phase = "play";
    messageScreen.classList.add("hidden");
    syncHud();
    tone(520, 0.1, "sine", 0.06);
  }

  function syncHud() {
    scoreEl.textContent = String(state.score);
    levelEl.textContent = String(state.level);
    livesEl.textContent = "🥥".repeat(Math.max(0, state.lives)) || "—";
  }

  function addScore(n, x, y) {
    state.score += n;
    if (state.score > state.high) {
      state.high = state.score;
      localStorage.setItem("coco-world-high", String(state.high));
    }
    if (x != null) {
      state.floaters.push({ x, y, text: `+${n}`, born: performance.now() });
    }
    syncHud();
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function tone(freq, dur, type, vol) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.value = vol || 0.06;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  }

  function canStep(c, r, walkFn) {
    return walkFn(mazeAt(c, r));
  }

  function actorTile(actor) {
    return { c: Math.floor(actor.x / TILE), r: Math.floor(actor.y / TILE) };
  }

  function nearCenter(actor) {
    const { x, y } = tileCenter(Math.round((actor.x - TILE / 2) / TILE), Math.round((actor.y - TILE / 2) / TILE));
    const c = Math.round((actor.x - TILE / 2) / TILE);
    const r = Math.round((actor.y - TILE / 2) / TILE);
    const mid = tileCenter(c, r);
    return Math.abs(actor.x - mid.x) <= actor.speed + 0.05 && Math.abs(actor.y - mid.y) <= actor.speed + 0.05;
  }

  function snapCenter(actor) {
    const c = Math.round((actor.x - TILE / 2) / TILE);
    const r = Math.round((actor.y - TILE / 2) / TILE);
    const mid = tileCenter(c, r);
    actor.c = c;
    actor.r = r;
    actor.x = mid.x;
    actor.y = mid.y;
  }

  function tryDir(actor, dir, walkFn) {
    if (dir == null || dir < 0) return false;
    const c = Math.round((actor.x - TILE / 2) / TILE) + DIRS[dir].x;
    const r = Math.round((actor.y - TILE / 2) / TILE) + DIRS[dir].y;
    return canStep(c, r, walkFn);
  }

  function moveActor(actor, walkFn, chooser) {
    if (nearCenter(actor)) {
      snapCenter(actor);
      if (chooser) chooser(actor);
      if (tryDir(actor, actor.nextDir, walkFn)) actor.dir = actor.nextDir;
      if (!tryDir(actor, actor.dir, walkFn)) {
        actor.dir = -1;
        return;
      }
    }
    if (actor.dir < 0) return;
    actor.x += DIRS[actor.dir].x * actor.speed;
    actor.y += DIRS[actor.dir].y * actor.speed;
    if (DIRS[actor.dir].x !== 0) {
      const r = Math.round((actor.y - TILE / 2) / TILE);
      actor.y = tileCenter(0, r).y;
    } else {
      const c = Math.round((actor.x - TILE / 2) / TILE);
      actor.x = tileCenter(c, 0).x;
    }
    actor.c = Math.floor(actor.x / TILE);
    actor.r = Math.floor(actor.y / TILE);
  }

  function dist2(a, b) {
    const dc = a.c - b.c;
    const dr = a.r - b.r;
    return dc * dc + dr * dr;
  }

  function bootTarget(boot) {
    const p = state.player;
    if (boot.eaten) return HOUSE;
    if (boot.mode === "house") return { c: boot.c, r: boot.r };
    if (boot.mode === "leave") return EXIT_TILE;
    if (boot.frightened) return boot.spec.scatter;
    if (state.mode === "scatter") return boot.spec.scatter;

    const ahead = 4;
    const facing = p.dir < 0 ? 3 : p.dir;
    if (boot.spec.personality === "chase") return { c: p.c, r: p.r };
    if (boot.spec.personality === "ambush") {
      let ac = p.c + DIRS[facing].x * ahead;
      let ar = p.r + DIRS[facing].y * ahead;
      if (facing === 3) ac -= ahead;
      return { c: ac, r: ar };
    }
    if (boot.spec.personality === "flank") {
      const amber = state.boots[0];
      const pivot = {
        c: p.c + DIRS[facing].x * 2,
        r: p.r + DIRS[facing].y * 2,
      };
      return { c: pivot.c * 2 - amber.c, r: pivot.r * 2 - amber.r };
    }
    if (Math.sqrt(dist2(boot, p)) > 8) return { c: p.c, r: p.r };
    return boot.spec.scatter;
  }

  function chooseBootDir(boot) {
    if (boot.mode === "house") {
      boot.dir = -1;
      boot.nextDir = -1;
      return;
    }
    const walkFn = bootWalkable;
    const target = bootTarget(boot);
    const options = [];
    for (let d = 0; d < 4; d++) {
      if (d === OPPOSITE[boot.dir] && boot.dir >= 0) continue;
      if (tryDir(boot, d, walkFn)) options.push(d);
    }
    if (!options.length) {
      for (let d = 0; d < 4; d++) {
        if (tryDir(boot, d, walkFn)) options.push(d);
      }
    }
    if (!options.length) {
      boot.nextDir = -1;
      return;
    }
    if (boot.frightened && !boot.eaten) {
      boot.nextDir = options[Math.floor(Math.random() * options.length)];
      return;
    }
    let best = options[0];
    let bestScore = Infinity;
    for (const d of options) {
      const nc = boot.c + DIRS[d].x;
      const nr = boot.r + DIRS[d].y;
      const score = (nc - target.c) ** 2 + (nr - target.r) ** 2;
      if (score < bestScore || (score === bestScore && d < best)) {
        best = d;
        bestScore = score;
      }
    }
    boot.nextDir = best;
  }

  function updateModes(now) {
    if (now < state.readyUntil) return;
    for (const boot of state.boots) {
      if (boot.mode === "house" && now >= boot.releaseAt) boot.mode = "leave";
      if (boot.mode === "leave" && boot.c === EXIT_TILE.c && boot.r === EXIT_TILE.r && nearCenter(boot)) {
        boot.mode = "roam";
      }
      if (boot.eaten && boot.c === HOUSE.c && boot.r === HOUSE.r && nearCenter(boot)) {
        boot.eaten = false;
        boot.frightened = false;
        boot.mode = "leave";
      }
      boot.frightened = !boot.eaten && now < state.frightenedUntil;
      boot.speed = bootSpeed(boot);
    }
    if (now >= state.frightenedUntil && now >= state.modeUntil) {
      state.mode = state.mode === "scatter" ? "chase" : "scatter";
      state.modeUntil = now + (state.mode === "scatter" ? 5000 : 16000);
      for (const boot of state.boots) {
        if (boot.mode === "roam" && boot.dir >= 0) boot.dir = OPPOSITE[boot.dir];
      }
    }
  }

  function eatTile() {
    const p = state.player;
    const ch = mazeAt(p.c, p.r);
    if (ch === ".") {
      state.grid[p.r][p.c] = "_";
      state.pelletsLeft--;
      addScore(10);
      tone(620 + Math.random() * 40, 0.04, "square", 0.03);
    } else if (ch === "o") {
      state.grid[p.r][p.c] = "_";
      state.pelletsLeft--;
      addScore(50, p.x, p.y - 10);
      state.frightenedUntil = performance.now() + frightenedMs();
      state.combo = 0;
      for (const boot of state.boots) {
        if (boot.mode === "roam" && !boot.eaten) {
          boot.frightened = true;
          if (boot.dir >= 0) boot.dir = OPPOSITE[boot.dir];
        }
      }
      tone(240, 0.16, "sawtooth", 0.05);
      setTimeout(() => tone(180, 0.18, "sawtooth", 0.04), 80);
    }
    if (state.pelletsLeft <= 0) levelCleared();
  }

  function collide() {
    if (performance.now() < state.invulnUntil) return;
    const p = state.player;
    for (const boot of state.boots) {
      const dx = boot.x - p.x;
      const dy = boot.y - p.y;
      if (dx * dx + dy * dy > (TILE * 0.48) ** 2) continue;
      if (boot.eaten) continue;
      if (boot.frightened) {
        boot.eaten = true;
        boot.frightened = false;
        boot.mode = "roam";
        state.combo += 1;
        const pts = 200 * 2 ** (state.combo - 1);
        addScore(pts, boot.x, boot.y);
        tone(880, 0.08, "triangle", 0.06);
        setTimeout(() => tone(1180, 0.1, "triangle", 0.05), 70);
      } else {
        loseLife();
        return;
      }
    }
  }

  function loseLife() {
    state.lives -= 1;
    syncHud();
    tone(160, 0.28, "sine", 0.07);
    setTimeout(() => tone(110, 0.35, "sine", 0.06), 120);
    if (state.lives <= 0) {
      state.phase = "over";
      showMessage("Game over", `Boot caught the coconut. Score ${state.score}. Best ${state.high}.`, "Play again", () => {
        startGame(true);
      });
      return;
    }
    state.phase = "life";
    showMessage("Oh no!", `${BOOTS[0].name} and the flock got a nibble. ${state.lives} left.`, "Keep going", () => {
      state.startedAt = performance.now();
      resetActors();
      state.phase = "play";
      messageScreen.classList.add("hidden");
    });
  }

  function levelCleared() {
    state.phase = "win";
    tone(523, 0.12, "triangle", 0.06);
    setTimeout(() => tone(659, 0.12, "triangle", 0.06), 110);
    setTimeout(() => tone(784, 0.22, "triangle", 0.07), 220);
    showMessage(
      "Beach cleared!",
      `Level ${state.level} snack sweep complete. Score ${state.score}. Ready for a faster flock?`,
      "Next level",
      () => nextLevel()
    );
  }

  function showMessage(title, body, btn, action) {
    messageTitle.textContent = title;
    messageBody.textContent = body;
    messageBtn.textContent = btn;
    state.messageAction = action;
    messageScreen.classList.remove("hidden");
  }

  function update(now) {
    state.anim = now;
    if (state.phase !== "play") return;
    updateModes(now);
    if (now < state.readyUntil) return;

    state.player.nextDir = state.nextDir;
    state.player.speed = playerSpeed();
    moveActor(state.player, playerWalkable);
    eatTile();

    for (const boot of state.boots) {
      boot.speed = bootSpeed(boot);
      moveActor(boot, bootWalkable, chooseBootDir);
    }
    collide();
    state.floaters = state.floaters.filter((f) => now - f.born < 700);
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#2eb7c9");
    g.addColorStop(1, "#0e6b7a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const y = 40 + i * 90 + Math.sin(state.anim / 700 + i) * 6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= canvas.width; x += 12) {
        ctx.lineTo(x, y + Math.sin(x / 28 + i) * 5);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawMaze() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = mazeAt(c, r);
        const x = c * TILE;
        const y = r * TILE;
        if (ch === "#") {
          ctx.fillStyle = "#117888";
          roundRect(x + 1, y + 1, TILE - 2, TILE - 2, 7);
          ctx.fill();
          ctx.fillStyle = "#2aa4b3";
          roundRect(x + 3, y + 3, TILE - 8, TILE / 2 - 2, 5);
          ctx.fill();
          ctx.fillStyle = "#e07a5f";
          ctx.fillRect(x + TILE / 2 - 2, y + 4, 4, 5);
        } else if (ch === "H" || ch === "-") {
          ctx.fillStyle = "#e8c27a";
          ctx.fillRect(x, y, TILE, TILE);
          if (ch === "-") {
            ctx.fillStyle = "#8d5a2b";
            ctx.fillRect(x + 2, y + TILE / 2 - 2, TILE - 4, 4);
          }
        } else {
          ctx.fillStyle = "#f6e2b3";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = "rgba(210, 170, 90, 0.18)";
          ctx.fillRect(x + 2, y + 2, 3, 3);
        }
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = mazeAt(c, r);
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        if (ch === ".") drawSnack(c, r, x, y);
        if (ch === "o") drawPower(x, y);
      }
    }
  }

  function drawSnack(c, r, x, y) {
    const kind = (c * 13 + r * 7) % 4;
    if (kind === 0) {
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 1) {
      ctx.fillStyle = "#40916c";
      ctx.beginPath();
      ctx.ellipse(x, y, 3.4, 2.1, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 2) {
      ctx.fillStyle = "#f4a261";
      ctx.beginPath();
      ctx.arc(x, y + 0.4, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#d07a3a";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    } else {
      ctx.fillStyle = "#7b2cbf";
      ctx.beginPath();
      ctx.arc(x, y, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPower(x, y) {
    const pulse = 1 + Math.sin(state.anim / 160) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(state.anim / 500);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#ff9f1c";
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const b = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5);
      ctx.lineTo(Math.cos(b) * 3.4, Math.sin(b) * 3.4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCoconut(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 9, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createRadialGradient(-3, -4, 2, 0, 0, 11);
    body.addColorStop(0, "#e6c89a");
    body.addColorStop(0.55, "#c6904d");
    body.addColorStop(1, "#7a4a1e");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 1, 9.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3d8b4a";
    ctx.beginPath();
    ctx.ellipse(-1, -10, 4.2, 5.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#16343a";
    ctx.beginPath();
    ctx.arc(-3.2, -0.2, 1.35, 0, Math.PI * 2);
    ctx.arc(3.2, -0.2, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-3.6, -0.6, 0.45, 0, Math.PI * 2);
    ctx.arc(2.8, -0.6, 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#16343a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 2.2, 3.2, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.restore();
  }

  function drawBoot(boot) {
    ctx.save();
    ctx.translate(boot.x, boot.y);
    const flash = boot.frightened && state.frightenedUntil - state.anim < 1600 && Math.floor(state.anim / 120) % 2 === 0;
    const color = boot.eaten ? "transparent" : boot.frightened ? (flash ? "#f8f9fa" : "#4361ee") : boot.spec.color;
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(0, 9, 7, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!boot.eaten) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 1, 8.2, 7.4, 0, 0, Math.PI * 2);
      ctx.fill();
      const wing = Math.sin(state.anim / 90 + boot.flap) * 5;
      ctx.beginPath();
      ctx.ellipse(-8, wing * 0.15, 5, 3.2, -0.4, 0, Math.PI * 2);
      ctx.ellipse(8, -wing * 0.15, 5, 3.2, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffb703";
      ctx.beginPath();
      ctx.moveTo(7.5, 1);
      ctx.lineTo(13, 3);
      ctx.lineTo(7.2, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = boot.frightened ? "#222" : "#fff";
      ctx.beginPath();
      ctx.arc(-2.5, -1.5, 2.1, 0, Math.PI * 2);
      ctx.arc(2.2, -1.5, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      if (boot.frightened) {
        ctx.font = "6px Nunito, sans-serif";
        ctx.fillText("x", -4.4, 0.6);
        ctx.fillText("x", 0.4, 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(-2.1, -1.3, 0.9, 0, Math.PI * 2);
        ctx.arc(2.6, -1.3, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-2.4, -1, 2, 0, Math.PI * 2);
      ctx.arc(2.4, -1, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(-2.1, -1, 0.8, 0, Math.PI * 2);
      ctx.arc(2.7, -1, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHudBits() {
    if (state.phase === "play" && state.anim < state.readyUntil) {
      ctx.fillStyle = "rgba(14, 70, 80, 0.45)";
      ctx.fillRect(0, canvas.height / 2 - 28, canvas.width, 56);
      ctx.fillStyle = "#fff8e8";
      ctx.font = "700 28px Fredoka, Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Ready!", canvas.width / 2, canvas.height / 2 + 10);
    }
    ctx.textAlign = "left";
    ctx.font = "700 11px Nunito, sans-serif";
    for (const f of state.floaters) {
      const t = (state.anim - f.born) / 700;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = "#fff8e8";
      ctx.fillText(f.text, f.x - 8, f.y - t * 18);
      ctx.globalAlpha = 1;
    }
    if (state.phase === "title") return;
    ctx.fillStyle = "rgba(255,248,232,0.88)";
    ctx.font = "700 10px Nunito, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`Best ${state.high}`, canvas.width - 8, 14);
  }

  function draw() {
    drawBackground();
    if (state.phase === "title") {
      drawTitlePreview();
      return;
    }
    drawMaze();
    for (const boot of state.boots) drawBoot(boot);
    drawCoconut(state.player);
    drawHudBits();
  }

  function drawTitlePreview() {
    drawMaze();
    const mid = tileCenter(PLAYER_START.c, PLAYER_START.r);
    drawCoconut({ x: mid.x, y: mid.y });
    drawBoot({
      x: tileCenter(10, 7).x,
      y: tileCenter(10, 7).y,
      spec: BOOTS[0],
      frightened: false,
      eaten: false,
      flap: 0,
    });
  }

  function loop(now) {
    if (!state.lastStamp) state.lastStamp = now;
    const dt = Math.min(32, now - state.lastStamp);
    state.lastStamp = now;
    const steps = dt > 20 ? 2 : 1;
    for (let i = 0; i < steps; i++) update(now);
    draw();
    requestAnimationFrame(loop);
  }

  function setDir(name) {
    if (DIR_FROM_NAME[name] != null) state.nextDir = DIR_FROM_NAME[name];
  }

  const KEY_DIRS = {
    ArrowRight: "right",
    ArrowLeft: "left",
    ArrowUp: "up",
    ArrowDown: "down",
    d: "right",
    a: "left",
    w: "up",
    s: "down",
    D: "right",
    A: "left",
    W: "up",
    S: "down",
  };

  window.addEventListener("keydown", (e) => {
    if (KEY_DIRS[e.key]) {
      e.preventDefault();
      setDir(KEY_DIRS[e.key]);
      if (state.phase === "title") startGame(true);
    }
    if (e.key === "Enter" && !messageScreen.classList.contains("hidden")) {
      messageBtn.click();
    }
  });

  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  canvas.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.hypot(dx, dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? "right" : "left");
    else setDir(dy > 0 ? "down" : "up");
  }, { passive: true });

  document.getElementById("dpad").addEventListener("pointerdown", (e) => {
    const btn = e.target.closest("[data-dir]");
    if (!btn) return;
    e.preventDefault();
    setDir(btn.dataset.dir);
  });

  startBtn.addEventListener("click", () => {
    ensureAudio();
    startGame(true);
  });

  messageBtn.addEventListener("click", () => {
    ensureAudio();
    if (state.messageAction) state.messageAction();
  });

  rebuildGrid();
  state.player = makeActor(PLAYER_START.c, PLAYER_START.r, 2);
  state.boots = [];
  requestAnimationFrame(loop);
})();
