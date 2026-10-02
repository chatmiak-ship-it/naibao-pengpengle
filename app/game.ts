export const characters = [
  ["小奶瓶", "1F37C", 18, "#ddecf7"],
  ["咕咕奶", "1F95B", 24, "#e1ede8"],
  ["破壳宝", "1F423", 31, "#fff0a6"],
  ["小啾宝", "1F424", 39, "#ffe789"],
  ["啾啾宝", "1F425", 47, "#fbd79e"],
  ["小奶娃", "1F476", 56, "#ffd4c3"],
  ["天使宝", "1F47C", 66, "#d9ddff"],
  ["奶兔宝", "1F430", 77, "#f4d0e7"],
  ["奶熊宝", "1F43B", 90, "#e2b89e"],
  ["神奶蛙", "1F438", 106, "#b4e884"]
].map(([name, code, r, color]) => ({
  name: String(name),
  src: `/characters/${code}.svg`,
  r: Number(r),
  color: String(color)
}));

type Status = { score: number; next: number; coins: number; over: boolean };
type Ball = { x: number; y: number; vx: number; vy: number; t: number; age: number; angle: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export type GameHandle = {
  reset: () => void;
  revive: () => void;
  setMuted: (value: boolean) => void;
  destroy: () => void;
  drop: (x?: number) => boolean;
  getState: () => Status & { balls: number };
};

export function createGame(canvas: HTMLCanvasElement, onChange: (s: Status) => void): GameHandle {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const ctx = context;

  const W = 420;
  const H = 620;
  const floor = H - 12;
  const line = 105;

  let balls: Ball[] = [];
  let sparks: Spark[] = [];
  let score = 0;
  let next = 0;
  let current = 0;
  let coins = 0;
  let over = false;
  let aim = W / 2;
  let cooldown = 0;
  let danger = 0;
  let muted = false;
  let raf = 0;
  let disposed = false;
  let touch = false;
  let audio: AudioContext | null = null;

  // 离屏 Canvas：缓存背景点阵
  let bgCanvas: HTMLCanvasElement | null = null;
  function initBackground() {
    bgCanvas = document.createElement("canvas");
    bgCanvas.width = W;
    bgCanvas.height = H;
    const bgCtx = bgCanvas.getContext("2d");
    if (!bgCtx) return;
    bgCtx.fillStyle = "#fbfdf8";
    bgCtx.fillRect(0, 0, W, H);
    bgCtx.fillStyle = "#e4efe5";
    for (let x = 20; x < W; x += 24) {
      for (let y = 20; y < H; y += 24) {
        bgCtx.beginPath();
        bgCtx.arc(x, y, 1, 0, Math.PI * 2);
        bgCtx.fill();
      }
    }
  }

  const sprites = characters.map(c => {
    const im = new Image();
    im.src = c.src;
    return im;
  });

  const random = () => {
    const n = Math.random();
    return n < 0.36 ? 0 : n < 0.66 ? 1 : n < 0.88 ? 2 : 3;
  };

  const status = () => ({ score, next, coins, over });
  const publish = () => onChange(status());
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

  function tone(freq: number, duration = 0.12) {
    if (muted || disposed) return;
    try {
      audio ??= new AudioContext();
      if (audio.state === "suspended") void audio.resume();
      const o = audio.createOscillator();
      const g = audio.createGain();
      const now = audio.currentTime;
      o.type = "sine";
      o.frequency.setValueAtTime(freq, now);
      o.frequency.exponentialRampToValueAtTime(freq * 1.35, now + duration);
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      o.connect(g);
      g.connect(audio.destination);
      o.start(now);
      o.stop(now + duration);
    } catch {}
  }

  function addScore(points: number) {
    const before = Math.floor(score / 2000);
    score += points;
    coins += Math.floor(score / 2000) - before;
    publish();
  }

  function drop(x = aim) {
    if (over || cooldown > 0 || disposed) return false;
    const r = characters[current].r;
    aim = clamp(x, r + 10, W - r - 10);
    balls.push({
      x: aim,
      y: 46,
      vx: 0,
      vy: 50,
      t: current,
      age: 0,
      angle: 0
    });
    current = next;
    next = random();
    cooldown = 0.38;
    tone(200, 0.07);
    publish();
    return true;
  }

  function reset() {
    balls = [];
    sparks = [];
    score = 0;
    coins = 0;
    over = false;
    aim = W / 2;
    cooldown = 0;
    danger = 0;
    current = random();
    next = random();
    publish();
  }

  function revive() {
    if (!over || coins < 1) return;
    coins--;
    balls = balls.filter(b => b.y - characters[b.t].r > line + 25);
    over = false;
    danger = 0;
    cooldown = 0.5;
    publish();
    tone(650, 0.2);
  }

  function merge(a: Ball, b: Ball) {
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const t = a.t;
    balls = balls.filter(v => v !== a && v !== b);

    if (t === 9) {
      coins++;
      addScore(500);
    } else {
      const nextLevel = t + 1;
      const r = characters[nextLevel].r;
      balls.push({
        x: clamp(x, r + 10, W - r - 10),
        y: clamp(y, r, floor - r),
        vx: (a.vx + b.vx) * 0.25,
        vy: -65,
        t: nextLevel,
        age: 0,
        angle: (a.angle + b.angle) / 2
      });
      addScore(((nextLevel + 1) * (nextLevel + 2)) / 2);
    }

    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 50 + Math.random() * 170;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 0.7,
        color: characters[t].color
      });
    }
    tone(300 + t * 70);
  }

  function physics(dt: number) {
    for (const b of balls) {
      b.age += dt;
      b.vy += 1600 * dt;
      b.vx *= Math.pow(0.994, dt * 60);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.vx * dt * 0.006;
    }

    for (let iteration = 0; iteration < 7; iteration++) {
      for (const b of balls) {
        const r = characters[b.t].r;
        if (b.x < r + 10) {
          b.x = r + 10;
          b.vx = Math.abs(b.vx) * 0.25;
        }
        if (b.x > W - r - 10) {
          b.x = W - r - 10;
          b.vx = -Math.abs(b.vx) * 0.25;
        }
        if (b.y > floor - r) {
          b.y = floor - r;
          b.vy = b.vy > 65 ? -b.vy * 0.2 : 0;
          b.vx *= 0.95;
        }
        if (b.y < r) {
          b.y = r;
          if (b.vy < 0) b.vy = 0;
        }
      }

      let merged = false;
      collision: for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i];
          const b = balls[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const target = characters[a.t].r + characters[b.t].r;

          if (dist > target + 0.25) continue;
          if (a.t === b.t) {
            merge(a, b);
            merged = true;
            break collision;
          }

          const nx = dist < 0.001 ? 1 : dx / dist;
          const ny = dist < 0.001 ? 0 : dy / dist;
          const overlap = Math.max(0, target - dist);
          const ma = characters[a.t].r ** 2;
          const mb = characters[b.t].r ** 2;
          const wa = mb / (ma + mb);
          const wb = ma / (ma + mb);

          a.x -= nx * overlap * wa;
          a.y -= ny * overlap * wa;
          b.x += nx * overlap * wb;
          b.y += ny * overlap * wb;

          const speed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (speed < 0) {
            const impulse = -speed * (speed < -80 ? 1.25 : 1);
            a.vx -= impulse * nx * wa;
            a.vy -= impulse * ny * wa;
            b.vx += impulse * nx * wb;
            b.vy += impulse * ny * wb;
            const tangent = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
            a.vx += -ny * tangent * 0.02 * wa;
            a.vy += nx * tangent * 0.02 * wa;
            b.vx -= -ny * tangent * 0.02 * wb;
            b.vy -= nx * tangent * 0.02 * wb;
          }
        }
      }
      if (merged) continue;
    }

    for (const b of balls) {
      const r = characters[b.t].r;
      b.x = clamp(b.x, r + 10, W - r - 10);
      if (b.y > floor - r) {
        b.y = floor - r;
        if (b.vy > 0) b.vy = 0;
      }
      if (b.y < r) {
        b.y = r;
        if (b.vy < 0) b.vy = 0;
      }
    }
  }

  function paintCharacter(x: number, y: number, t: number, r: number, angle = 0, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = characters[t].color;
    ctx.strokeStyle = "#183c30";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const img = sprites[t];
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, -r * 0.83, -r * 0.83, r * 1.66, r * 1.66);
    } else {
      ctx.fillStyle = "#183c30";
      ctx.font = `700 ${r * 0.65}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(t + 1), 0, 0);
    }
    ctx.restore();
  }

  function render(dt: number) {
    const scale = canvas.width / W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (bgCanvas) {
      ctx.drawImage(bgCanvas, 0, 0);
    } else {
      ctx.fillStyle = "#fbfdf8";
      ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    ctx.strokeStyle = danger > 0 ? "#dc534e" : "#a8bca7";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(12, line);
    ctx.lineTo(W - 12, line);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = danger > 0 ? "#c14a43" : "#788e79";
    ctx.font = "12px sans-serif";
    ctx.fillText(danger > 0 ? "快满啦！找机会合成" : "满满警戒线", 18, line - 10);
    ctx.restore();

    for (const b of balls) {
      paintCharacter(b.x, b.y, b.t, characters[b.t].r, b.angle);
    }

    if (!over) {
      const r = characters[current].r;
      aim = clamp(aim, r + 10, W - r - 10);
      ctx.save();
      ctx.strokeStyle = "#83a977";
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.moveTo(aim, 46 + r + 8);

      let endCenterY = floor - r;
      for (const b of balls) {
        const reach = r + characters[b.t].r;
        const dx = b.x - aim;
        if (Math.abs(dx) < reach) {
          endCenterY = Math.min(endCenterY, b.y - Math.sqrt(reach ** 2 - dx ** 2));
        }
      }
      ctx.lineTo(aim, endCenterY);
      ctx.stroke();
      ctx.restore();

      paintCharacter(aim, 46, current, r, 0, cooldown > 0 ? 0.4 : 1);
    }

    sparks = sparks.filter(s => s.life > 0);
    for (const s of sparks) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 250 * dt;
      ctx.globalAlpha = Math.max(0, s.life / 0.7);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let last = performance.now();
  let acc = 0;

  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;

    while (acc >= 1 / 60) {
      if (!over) {
        cooldown = Math.max(0, cooldown - 1 / 60);
        for (let s = 0; s < 3; s++) physics(1 / 180);

        const blocked = balls.some(
          b => b.age > 1.5 && b.y - characters[b.t].r < line && Math.abs(b.vy) < 120
        );
        danger = blocked ? danger + 1 / 60 : Math.max(0, danger - 1 / 30);
        if (danger > 2) {
          over = true;
          publish();
          tone(100, 0.5);
        }
      }
      acc -= 1 / 60;
    }

    render(dt);
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    const width = canvas.getBoundingClientRect().width || 420;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round((width * H / W) * dpr);
  }

  function pointerX(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) * W) / rect.width;
  }

  const move = (e: PointerEvent) => {
    if (!over && (e.pointerType !== "touch" || touch)) aim = pointerX(e);
  };

  const down = (e: PointerEvent) => {
    if (over) return;
    e.preventDefault();
    aim = pointerX(e);
    canvas.focus({ preventScroll: true });
    if (audio && audio.state === "suspended") void audio.resume();
    if (e.pointerType === "touch") {
      touch = true;
      canvas.setPointerCapture(e.pointerId);
    } else {
      drop();
    }
  };

  const up = (e: PointerEvent) => {
    if (e.pointerType === "touch" && touch) {
      touch = false;
      drop(pointerX(e));
    }
  };

  const cancel = () => {
    touch = false;
  };

  const keys = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      aim += e.key === "ArrowLeft" ? -16 : 16;
    } else if (e.code === "Space" || e.key === "Enter") {
      e.preventDefault();
      drop();
    }
  };

  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("keydown", keys);

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  initBackground();
  resize();
  reset();
  raf = requestAnimationFrame(frame);

  const handle: GameHandle = {
    reset,
    revive,
    drop,
    setMuted: (v: boolean) => {
      muted = v;
    },
    getState: () => ({ ...status(), balls: balls.length }),
    destroy: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("keydown", keys);
      if (audio) void audio.close();
    }
  };

  if (document.modelContext?.registerTool) {
    const life = new AbortController();
    for (const tool of [
      {
        name: "read_game",
        description: "Read the current milk baby game score and state.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => handle.getState()
      },
      {
        name: "drop_milk_baby",
        description: "Drop the current milk baby at a horizontal position between 0 and 420.",
        inputSchema: {
          type: "object",
          properties: { x: { type: "number", minimum: 0, maximum: 420 } },
          required: ["x"],
          additionalProperties: false
        },
        annotations: { readOnlyHint: false },
        execute: (input: unknown) => {
          const x = (input as { x?: unknown })?.x;
          if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 420) {
            throw new Error("x must be between 0 and 420");
          }
          if (!drop(x)) {
            throw new Error("The game has ended or the drop is cooling down");
          }
          return handle.getState();
        }
      }
    ]) {
      try {
        void Promise.resolve(document.modelContext.registerTool(tool, { signal: life.signal })).catch(() => {});
      } catch {}
    }
    const originalDestroy = handle.destroy;
    handle.destroy = () => {
      life.abort();
      originalDestroy();
    };
  }

  return handle;
}

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => unknown;
    };
  }
}
