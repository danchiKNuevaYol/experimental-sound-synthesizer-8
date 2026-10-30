// Блок .display — окно в «несуществующее место», рисуется p5.js (instance mode).
// Небо и свет зависят от времени суток, горы — от зерна места (place.seed), погода красит всю сцену.
// Звук управляет картинкой: голос A — ветер в траве, голос B — тонкая светящаяся линия «свиста»,
// частицы приходят из engine.onTrigger (капля, светлячок, искры, молния), «ДАЛЬ» — туман от реверберации,
// «ЖАР» — марево от драйва. Данные берёт из объекта live (его обновляет main.js).

import p5 from 'p5';
import { engine } from '../audio/engine.js';

const W = 424, H = 224, STEP = 4, COLS = Math.ceil(W / STEP) + 1;
const MAX_PARTS = 120;
const SKY_BASE = 128;                                         // линия, за которую заходит дуга светил, и низ градиента неба
const ARC_BASE = 118, ARC_RISE = 96;                          // дуга солнца и луны: от горизонта до верхней точки
const DEFAULT_PLACE = { name: 'Без названия', time: '12:00', minutes: 720, weather: 'wind', seed: 1, night: false };
const WEATHER_RU = { wind: 'ВЕТЕР', rain: 'ДОЖДЬ', storm: 'ГРОЗА', forest: 'ЛЕС', alien: 'ЧУЖОЕ НЕБО' };
const CLOUDS = { wind: 0.35, rain: 0.65, storm: 1, forest: 0.25, alien: 0.15 };   // сколько облаков
const RAIN_RATE = { rain: 0.9, storm: 1.7 };                                    // капель дождя за кадр
const BLUE = [117, 168, 219], ORANGE = [237, 132, 69], YELLOW = [227, 179, 76];

// --- мелкие помощники
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const lum = (c) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Своё зерно случайных чисел (mulberry32): раскладка звёзд и травы повторяется для одного места. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Опорные точки суток: минута, верх неба, низ неба (у горизонта), земля, видимость звёзд
const DAY = [
  [0, [5, 7, 16], [14, 20, 36], [7, 9, 15], 1],
  [285, [6, 8, 20], [18, 24, 42], [8, 10, 16], 1],           // ночь
  [345, [26, 26, 56], [120, 78, 86], [30, 26, 38], 0.7],      // предрассветный сумрак
  [400, [72, 70, 112], [232, 156, 104], [52, 44, 58], 0.1],   // рассвет: пыльный оранжевый → фиолетовый
  [500, [112, 134, 162], [190, 204, 212], [66, 78, 88], 0],   // день: бледный серо-голубой
  [960, [116, 136, 160], [200, 204, 204], [64, 74, 82], 0],
  [1060, [88, 72, 116], [232, 160, 88], [56, 42, 62], 0.1],   // закат: фиолетовый → янтарь
  [1130, [38, 32, 70], [150, 82, 90], [28, 22, 40], 0.6],
  [1200, [10, 12, 28], [30, 32, 56], [10, 11, 20], 1],
  [1440, [5, 7, 16], [14, 20, 36], [7, 9, 15], 1],
];

/** Краски сцены для минуты суток и погоды: плавная интерполяция между опорными точками. */
function sceneColors(minutes, weather) {
  let i = 1;
  while (i < DAY.length - 1 && DAY[i][0] < minutes) i++;
  const [m0, ...k0] = DAY[i - 1], [m1, ...k1] = DAY[i];
  const t = smooth(clamp((minutes - m0) / (m1 - m0)));
  let top = mix(k0[0], k1[0], t), hor = mix(k0[1], k1[1], t), land = mix(k0[2], k1[2], t);
  let stars = k0[3] + (k1[3] - k0[3]) * t;

  const grey = (c, d, k) => mix(c, [lum(c) * 255, lum(c) * 255, lum(c) * 255], d).map((v) => v * k);
  if (weather === 'storm') { top = grey(top, 0.6, 0.62); hor = grey(hor, 0.6, 0.66); land = grey(land, 0.4, 0.8); stars *= 0.25; }
  else if (weather === 'rain') { top = grey(top, 0.4, 0.8); hor = grey(hor, 0.4, 0.85); land = grey(land, 0.25, 0.9); stars *= 0.5; }
  else if (weather === 'forest') { land = mix(land, [28, 52, 38], 0.35); hor = mix(hor, [120, 150, 120], 0.12); }
  else if (weather === 'alien') {                          // чужие оттенки: бирюзовый верх, пурпурный низ
    const k = (c) => 40 + 300 * lum(c);
    top = mix(top, scale([0.2, 0.75, 0.7], k(top)), 0.55);
    hor = mix(hor, scale([0.8, 0.25, 0.6], k(hor)), 0.55);
    land = mix(land, [30, 18, 48], 0.5);
    stars = Math.max(stars, 0.25);
  }
  return { top, hor, land, stars };
}

/** Рельеф места: три хребта, рельеф земли, звёзды, облака, трава и деревья — всё из зерна. */
function buildTerrain(p, seed) {
  const rnd = rng(seed);
  p.noiseSeed(seed);
  const spec = [                                              // дальний, средний, ближний
    { base: 112, amp: 48, freq: 0.045, rough: 0.1 },
    { base: 127, amp: 40, freq: 0.07, rough: 0.2 },
    { base: 144, amp: 32, freq: 0.1, rough: 0.3 },
  ];
  const ridges = spec.map((L) => {
    const off = rnd() * 900, f = L.freq * (0.8 + rnd() * 0.5), amp = L.amp * (0.8 + rnd() * 0.4);
    return Array.from({ length: COLS }, (_, i) => {
      const n = p.noise(off + i * f) + (p.noise(off + 70 + i * f * 3.4) - 0.5) * L.rough;
      return L.base - amp * Math.pow(p.map(n, 0.22, 0.78, 0, 1, true), 1.15);
    });
  });
  const gOff = rnd() * 900;
  const ground = Array.from({ length: COLS }, (_, i) => 176 + (p.noise(gOff + i * 0.06) - 0.5) * 16);
  const groundAt = (x) => ground[Math.min(COLS - 1, Math.max(0, Math.round(x / STEP)))];

  const stars = Array.from({ length: 80 }, () => ({ x: rnd() * W, y: Math.pow(rnd(), 1.4) * 105, r: 0.5 + rnd() * 0.8, ph: rnd() * 6.28, sp: 0.8 + rnd() * 2.2 }));
  const clouds = Array.from({ length: 10 }, () => ({ x: rnd() * (W + 160) - 80, y: 16 + rnd() * 54, w: 50 + rnd() * 90, h: 7 + rnd() * 9, a: 0.25 + rnd() * 0.3, v: 0.6 + rnd() * 0.8 }));
  const planet = { x: 70 + rnd() * 220, y: 44 + rnd() * 34 };   // чужая планета с кольцом
  const craters = Array.from({ length: 3 }, () => ({ x: (rnd() - 0.5) * 8, y: (rnd() - 0.5) * 8, r: 1 + rnd() * 1.6 }));

  const blades = Array.from({ length: 140 }, () => {
    const x = rnd() * W;
    return { x, y: groundAt(x) + 3, h: 12 + rnd() * rnd() * 34 + 4, w: 1.6 + rnd() * 1.8, lean: (rnd() - 0.5) * 5, ph: rnd() * 6.28, shade: 0.75 + rnd() * 0.5, glow: rnd() < 0.22 };
  }).sort((a, b) => a.h - b.h);

  // сосна: контур задан относительно основания (x = 0, y = 0 — земля), вершина вверху
  const pine = (h, hw) => {
    const T = 5, th = (h * 0.88) / T, right = [], left = [];
    for (let t = 0; t < T; t++) {
      const y0 = -h + t * th * 0.8, yb = y0 + th * 1.2, w = hw * (t + 1) / T;
      right.push([w * 0.4, y0 + th * 0.3], [w, yb]);
      left.unshift([-w, yb], [-w * 0.4, y0 + th * 0.3]);
    }
    const yl = right[right.length - 1][1];
    return [[0, -h], ...right, [2, yl], [2, 0], [-2, 0], [-2, yl], ...left];
  };
  const treesBack = Array.from({ length: 12 }, (_, i) => { const h = 46 + rnd() * 34; return { x: (i + 0.2 + rnd() * 0.6) * (W / 12), y: 172 + rnd() * 6, h, pts: pine(h, h * 0.2) }; });
  const treesFront = Array.from({ length: 5 }, (_, i) => { const h = 105 + rnd() * 35; return { x: [14, 70, 205, 352, 408][i] + (rnd() - 0.5) * 24, y: 214, h, pts: pine(h, h * 0.2) }; });

  return { seed, ridges, ground, groundAt, stars, clouds, planet, craters, blades, treesBack, treesFront };
}

function sketch(live) {
  return (p) => {
    let terrain = null, unsubscribe = null;
    let clock = 0, ease = 0, lastMs = 0, rainAcc = 0;          // ease: 0 — прибор стоит, 1 — звучит
    let flashAt = -1e9, bolt = null;
    const lv = { a: 0, b: 0, p: 0 };                          // сглаженные уровни каналов 0…1
    const parts = [];
    const fitCache = new Map();

    const ctx = () => p.drawingContext;
    const F = (c, a = 255) => p.fill(c[0], c[1], c[2], a);
    const S = (c, a = 255) => p.stroke(c[0], c[1], c[2], a);
    const add = (o) => { if (parts.length < MAX_PARTS) parts.push(o); };

    // Градиенты рисуем напрямую в 2D-контексте внутри push/pop, чтобы не сбить кэш цвета p5
    function vGradient(y, h, stops) {
      p.push();
      const g = ctx().createLinearGradient(0, y, 0, y + h);
      stops.forEach(([t, c, a]) => g.addColorStop(t, css(c, a)));
      ctx().fillStyle = g;
      ctx().fillRect(0, y, W, h);
      p.pop();
    }
    function glow(x, y, r, c, a) {
      p.push();
      const g = ctx().createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, css(c, a));
      g.addColorStop(1, css(c, 0));
      ctx().fillStyle = g;
      ctx().fillRect(x - r, y - r, r * 2, r * 2);
      p.pop();
    }

    // --- частицы: приходят от движка в момент, когда звук слышен
    function spawn(id) {
      if (!live.playing || !terrain) return;
      const weather = (live.state.place || DEFAULT_PLACE).weather;
      if (id === 'drop') {
        const gy = p.random(172, 210);
        add({ k: 'drop', x: p.random(24, W - 24), y: gy - p.random(36, 58), vy: 7, gy });
      } else if (id === 'click') {
        add({ k: 'fly', x: p.random(30, W - 30), y: p.random(100, 188), vx: p.random(-0.4, 0.4), vy: p.random(-0.5, 0.1), age: 0, life: p.random(36, 62) });
      } else if (id === 'crackle') {
        const x = p.random(30, W - 30), y = p.random(186, 208);
        for (let i = 0; i < Math.floor(p.random(4, 7)); i++) add({ k: 'spark', x, y, vx: p.random(-1.6, 1.6), vy: p.random(-3.2, -1), age: 0, life: p.random(12, 22) });
      } else if (id === 'boom') {
        flashAt = p.millis();
        bolt = null;
        if (weather === 'storm' || weather === 'rain') {          // зубчатая молния сверху до хребта
          let x = p.random(60, W - 60), y = -4;
          const pts = [[x, y]];
          while (y < 118) { y += p.random(9, 17); x += p.random(-9, 9); pts.push([x, y]); }
          bolt = pts;
        }
      }
    }

    function updateParts(k, weather, playing) {
      if (playing && RAIN_RATE[weather] && parts.length < MAX_PARTS - 25) {   // фоновый дождь
        rainAcc += RAIN_RATE[weather] * k;
        while (rainAcc >= 1) { rainAcc -= 1; add({ k: 'rain', x: p.random(-10, W + 20), y: -8, vx: -1.8, vy: p.random(9, 13), gy: p.random(125, 214) }); }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const o = parts[i];
        if (o.k === 'drop' || o.k === 'rain') {
          o.x += (o.vx || 0) * k; o.y += o.vy * k;
          if (o.y >= o.gy) {
            parts.splice(i, 1);
            if (o.k === 'drop') add({ k: 'ripple', x: o.x, y: o.gy, age: 0, life: 30, r: 20 });
            else if (Math.random() < 0.3) add({ k: 'ripple', x: o.x, y: o.gy, age: 0, life: 14, r: 7 });
          }
        } else {
          o.age += k;
          o.x += (o.vx || 0) * k; o.y += (o.vy || 0) * k;
          if (o.k === 'spark') o.vy += 0.25 * k;
          if (o.age >= o.life) parts.splice(i, 1);
        }
      }
    }

    function drawParts(sc) {
      p.noFill();
      const pale = mix([205, 222, 236], sc.hor, 0.15);
      for (const o of parts) {
        if (o.k === 'drop') { S(pale, 215); p.strokeWeight(1.3); p.line(o.x, o.y - 7, o.x, o.y); }
        else if (o.k === 'rain') { S(pale, 90); p.strokeWeight(1); p.line(o.x, o.y, o.x + o.vx * 0.9, o.y - o.vy * 0.9); }
        else if (o.k === 'ripple') {
          const t = o.age / o.life, r = 2 + t * o.r;
          p.noFill(); S(pale, Math.pow(1 - t, 1.5) * 170); p.strokeWeight(1);
          p.ellipse(o.x, o.y, r * 2, r * 0.6);
        } else if (o.k === 'fly') {
          const a = Math.sin(Math.PI * o.age / o.life);
          const tw = 0.75 + 0.25 * Math.sin(clock * 9 + o.x);
          glow(o.x, o.y, 9, YELLOW, 0.5 * a * tw);
          p.noStroke(); F([255, 232, 160], 255 * a * tw); p.circle(o.x, o.y, 2.2);
        } else if (o.k === 'spark') {
          p.noStroke(); F(o.age < o.life * 0.4 ? [255, 214, 130] : ORANGE, 255 * (1 - o.age / o.life));
          p.circle(o.x, o.y, 1.8);
        }
      }
      p.noStroke();
    }

    // --- небо
    function drawSky(sc, place, weather) {
      vGradient(0, SKY_BASE + 20, [[0, sc.top], [1, sc.hor]]);
      p.noStroke();
      F(sc.hor); p.rect(0, SKY_BASE + 20, W, H);               // всё, что ниже неба, залито цветом горизонта

      // звёзды мерцают только на ночном небе
      if (sc.stars > 0.02) {
        for (const s of terrain.stars) {
          const tw = 0.55 + 0.45 * Math.sin(clock * s.sp + s.ph);
          F([232, 236, 255], 255 * sc.stars * tw * (1 - s.y / 118));
          p.circle(s.x, s.y, s.r * 2);
        }
      }

      // солнце (с 6:00 до 18:00) и луна (с 18:00 до 6:00) идут по дуге
      const vis = weather === 'storm' ? 0.3 : weather === 'rain' ? 0.5 : 1;
      const arc = (t) => ({ x: p.lerp(34, W - 34, t), y: ARC_BASE - Math.sin(Math.PI * t) * ARC_RISE, k: Math.sin(Math.PI * t) });
      const m = place.minutes;
      const ts = (m - 360) / 720, tm = (((m - 1080) % 1440 + 1440) % 1440) / 720;
      if (ts >= 0 && ts <= 1) {
        const s = arc(ts), c = mix([255, 150, 84], [255, 238, 205], Math.pow(s.k, 0.6));
        const col = weather === 'alien' ? mix(c, [255, 190, 230], 0.5) : c;
        glow(s.x, s.y, 46 + (1 - s.k) * 40, col, 0.42 * vis);
        F(col, 255 * vis); p.circle(s.x, s.y, 20);
      }
      if (tm >= 0 && tm <= 1) {
        const s = arc(tm), alien = weather === 'alien';
        const col = alien ? [150, 235, 225] : [228, 228, 214];
        glow(s.x, s.y, 34, alien ? [120, 220, 210] : [150, 175, 230], 0.28 * vis);
        F(col, 255 * vis); p.circle(s.x, s.y, 18);
        F(mix(col, sc.top, 0.4), 150 * vis);
        for (const c of terrain.craters) p.circle(s.x + c.x, s.y + c.y, c.r * 2);
      }
      if (weather === 'alien') {                               // вторая «луна» — планета с кольцом
        const { x: px, y: py } = terrain.planet, a = 0.6 + 0.4 * sc.stars;
        p.push();
        p.translate(px, py); p.rotate(-0.35);
        F([196, 96, 164], 150 * a); p.circle(0, 0, 30);
        F([120, 40, 110], 90 * a); p.circle(5, 4, 20);
        p.noFill(); S([240, 210, 236], 130 * a); p.strokeWeight(1.2); p.ellipse(0, 0, 58, 10);
        p.pop();
        p.noStroke();
      }
    }

    function drawClouds(sc, weather, windAmp) {
      const n = Math.round((CLOUDS[weather] ?? 0.3) * 9) + 1;
      const col = weather === 'storm' ? mix(sc.top, [40, 44, 52], 0.5) : mix(sc.hor, sc.top, 0.35);
      p.noStroke();
      terrain.clouds.slice(0, n).forEach((c) => {
        const x = ((c.x + clock * c.v * (3 + windAmp * 14) + 80) % (W + 160)) - 80;
        const a = c.a * (weather === 'storm' ? 1.6 : 1);
        for (let j = 0; j < 5; j++) {
          F(col, 255 * a * 0.45);
          p.ellipse(x + (j - 2) * c.w * 0.22, c.y + Math.sin(j * 1.7) * c.h * 0.25, c.w * (0.5 - Math.abs(j - 2) * 0.1), c.h * (1 - Math.abs(j - 2) * 0.15));
        }
      });
    }

    function drawRidge(h, col) {
      p.noStroke(); F(col);
      p.beginShape();
      p.vertex(0, H);
      for (let i = 0; i < COLS; i++) p.vertex(i * STEP, h[i]);
      p.vertex(W, H);
      p.endShape(p.CLOSE);
    }

    // --- марево над горизонтом: горизонтальные полоски холста смещаются волной
    function drawHeat(amount, d) {
      if (amount < 0.02) return;
      vGradient(88, 90, [[0, ORANGE, 0], [0.5, ORANGE, 0.1 * amount], [1, ORANGE, 0]]);
      const cnv = ctx().canvas;
      for (let y = 66; y < 180; y += 2) {
        const w = 1 - Math.abs(y - 128) / 64;
        if (w <= 0) continue;
        const dx = Math.sin(y * 0.45 + clock * 9) * (0.6 + 0.4 * Math.sin(y * 0.11 + clock * 2.3)) * amount * 5 * w;
        ctx().drawImage(cnv, 0, y * d, W * d, 2 * d, dx, y, W, 2);
      }
    }

    // --- передний план: трава и тростник (или лес)
    function drawGround(col) {
      p.noStroke(); F(col);
      p.beginShape();
      p.vertex(0, H);
      for (let i = 0; i < COLS; i++) p.vertex(i * STEP, terrain.ground[i]);
      p.vertex(W, H);
      p.endShape(p.CLOSE);
    }
    const sway = (x, ph) => Math.sin(clock * 1.7 + x * 0.022 + ph) * 0.7 + Math.sin(clock * 3.3 + x * 0.05) * 0.3;

    function drawBlades(col, windAmp, weather, count) {
      const tint = clamp(lv.a * 0.9) * 0.42;
      const hot = scale(ORANGE, 0.55);
      p.noStroke();
      for (let i = 0; i < count; i++) {
        const b = terrain.blades[terrain.blades.length - 1 - i];
        const c = mix(scale(col, b.shade), hot, tint * (0.4 + 0.6 * b.h / 50));
        const dxTip = b.lean + sway(b.x, b.ph) * windAmp * b.h * 0.7, dxMid = dxTip * 0.3;
        F(c);
        p.beginShape();
        p.vertex(b.x - b.w / 2, b.y);
        p.vertex(b.x - b.w * 0.35 + dxMid, b.y - b.h * 0.55);
        p.vertex(b.x + dxTip, b.y - b.h);
        p.vertex(b.x + b.w * 0.35 + dxMid, b.y - b.h * 0.55);
        p.vertex(b.x + b.w / 2, b.y);
        p.endShape(p.CLOSE);
        if (weather === 'alien' && b.glow) {                    // светящиеся кончики чужого тростника
          const a = 0.5 + 0.5 * Math.sin(clock * 2 + b.ph);
          F([120, 255, 230], 40 * a); p.circle(b.x + dxTip, b.y - b.h, 8);
          F([170, 255, 240], 190 * a); p.circle(b.x + dxTip, b.y - b.h, 2.4);
        }
      }
    }

    function drawTrees(list, col, windAmp) {
      p.noStroke(); F(col);
      for (const t of list) {
        const s = sway(t.x, 0) * windAmp * t.h * 0.1;
        p.beginShape();
        for (const [px, py] of t.pts) p.vertex(t.x + px + s * Math.pow(-py / t.h, 1.6), t.y + py);
        p.endShape(p.CLOSE);
      }
    }

    // --- подписи: тень + текст
    function label(str, x, y, c, a) {
      F([0, 0, 0], 130 * a); p.text(str, x + 0.5, y + 1);
      F(c, 255 * a); p.text(str, x, y);
    }
    function fitText(str, maxW) {                               // обрезаем по ширине с многоточием
      const key = `${str}|${maxW}`;
      if (fitCache.has(key)) return fitCache.get(key);
      let s = str;
      if (p.textWidth(s) > maxW) {
        while (s.length > 1 && p.textWidth(`${s}…`) > maxW) s = s.slice(0, -1);
        s = `${s.trimEnd()}…`;
      }
      fitCache.set(key, s);
      return s;
    }

    function drawHud({ place, weather, state, step, playing, recording, far, heat }) {
      const a = 0.55 + 0.45 * ease;
      p.noStroke();
      vGradient(0, 50, [[0, [4, 6, 10], 0.55], [1, [4, 6, 10], 0]]);
      vGradient(H - 54, 54, [[0, [4, 6, 10], 0], [1, [4, 6, 10], 0.6]]);
      p.rectMode(p.CORNER);
      if ('letterSpacing' in ctx()) ctx().letterSpacing = '0.6px';
      p.textAlign(p.LEFT, p.CENTER);

      // слева сверху: название места, время и погода
      p.textStyle(p.BOLD); p.textSize(11);
      label(fitText(String(place.name).toUpperCase(), 215), 14, 15, [238, 238, 232], a);
      p.textStyle(p.NORMAL); p.textSize(10);
      label(`${place.time} · ${WEATHER_RU[weather]}`, 14, 29, [200, 202, 200], a * 0.8);

      // справа сверху: запись и две «ручки» картинки
      p.textAlign(p.RIGHT, p.CENTER);
      if (recording) {
        const t = `ЗАП ${mmss(engine.recElapsed())}`;
        p.textStyle(p.BOLD); p.textSize(11);
        label(t, W - 14, 15, [238, 238, 232], 1);
        if (p.millis() % 1000 < 650) { F([224, 72, 56]); p.circle(W - 14 - p.textWidth(t) - 9, 15, 7); }
      }
      p.textStyle(p.NORMAL); p.textSize(10);
      label(`ДАЛЬ ${Math.round(far * 100)}%`, W - 14, 30, [190, 196, 202], a * 0.75);
      label(`ЖАР ${Math.round(heat * 100)}%`, W - 14, 42, heat > 0.3 ? [255, 168, 104] : [190, 196, 202], a * (heat > 0.3 ? 1 : 0.75));

      // слева снизу: 16 шагов и номер текущего
      for (let i = 0; i < 16; i++) {
        const now = step === i, has = state.steps.some((row) => row[i]);
        const h = now ? 12 : has ? 8 : i % 4 === 0 ? 5 : 3;
        if (now) F([255, 205, 130]); else if (has) F([214, 216, 212], 200); else F([214, 216, 212], 75);
        p.rect(14 + i * 8.5, H - 10 - h, 4, h);
      }
      p.textAlign(p.LEFT, p.CENTER); p.textSize(10);
      label(`ШАГ ${step >= 0 ? String(step + 1).padStart(2, '0') : '--'}/16`, 14 + 16 * 8.5 + 10, H - 16, [222, 224, 220], a * 0.85);

      // в покое — подсказка по центру
      if (!playing) {
        const pulse = 0.55 + 0.4 * Math.sin(p.millis() / 1000 * 2.4);
        p.textAlign(p.CENTER, p.CENTER); p.textStyle(p.BOLD); p.textSize(11);
        label('ПРОБЕЛ — НАСТРОИТЬСЯ НА МЕСТО', W / 2, 108, [244, 242, 234], pulse * (1 - ease));
      }
      if ('letterSpacing' in ctx()) ctx().letterSpacing = '0px';
    }

    // ------------------------------------------------------------------------------------------
    p.setup = () => {
      p.createCanvas(W, H);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.frameRate(30);
      const font = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
      if (font) p.textFont(font);
      lastMs = p.millis();
      unsubscribe = engine.onTrigger(spawn);
    };
    const remove = p.remove;
    p.remove = () => { unsubscribe && unsubscribe(); remove.call(p); };

    p.draw = () => {
      const { state, step, playing, recording } = live;
      const place = state.place || DEFAULT_PLACE;
      const weather = WEATHER_RU[place.weather] ? place.weather : 'wind';
      const seed = (Number(place.seed) >>> 0) || 1;
      if (!terrain || terrain.seed !== seed) { terrain = buildTerrain(p, seed); parts.length = 0; }
      const minutes = Number.isFinite(place.minutes) ? ((place.minutes % 1440) + 1440) % 1440 : 720;

      // время сцены: идёт, только пока прибор звучит
      const now = p.millis(), dt = Math.min(0.1, (now - lastMs) / 1000), k = dt * 30;
      lastMs = now;
      ease += ((playing ? 1 : 0) - ease) * Math.min(1, dt * 3);
      clock += dt * ease;
      const m = playing ? engine.meters() : null;
      for (const id of ['a', 'b', 'p']) lv[id] += ((m ? clamp(m[id] * 3.2) : 0) - lv[id]) * 0.2;

      const fx = state.fx || {};
      const far = clamp(fx.a ? fx.a.reverb : 0);
      const heat = clamp(fx[state.fxTarget] ? fx[state.fxTarget].drive : 0);
      const aMod = state.a ? state.a.mod : 0;
      const windAmp = clamp(0.1 + lv.a * (0.5 + aMod * 1.2) + (weather === 'storm' ? 0.3 : weather === 'wind' ? 0.12 : 0), 0, 1.5);

      const sc = sceneColors(minutes, weather);
      const farCol = mix(sc.hor, sc.land, 0.3), midCol = mix(sc.hor, sc.land, 0.58), nearCol = mix(sc.hor, sc.land, 0.85);
      const groundCol = scale(sc.land, 0.55);

      drawSky(sc, { minutes }, weather);
      drawClouds(sc, weather, windAmp);
      if (bolt && p.millis() - flashAt < 160) {                  // молния за хребтами
        p.noFill(); S([235, 240, 255], 90); p.strokeWeight(5);
        p.beginShape(); bolt.forEach(([x, y]) => p.vertex(x, y)); p.endShape();
        S([255, 255, 255], 240); p.strokeWeight(1.4);
        p.beginShape(); bolt.forEach(([x, y]) => p.vertex(x, y)); p.endShape();
        p.noStroke();
      }
      drawRidge(terrain.ridges[0], farCol);
      drawRidge(terrain.ridges[1], midCol);

      // «ДАЛЬ»: полоса тумана между средним и ближним хребтом
      const fogY = 100 + Math.sin(clock * 0.25) * 3, fogCol = mix(sc.hor, [255, 255, 255], 0.14);
      vGradient(fogY, 90, [[0, fogCol, 0], [0.5, fogCol, far * 0.8], [1, fogCol, far * 0.15]]);

      drawRidge(terrain.ridges[2], nearCol);
      drawHeat(clamp((heat - 0.3) / 0.7) * ease, p.pixelDensity());

      // вспышка молнии: тают ~300 мс
      const fl = 1 - (p.millis() - flashAt) / 300;
      const flashCol = weather === 'alien' ? [210, 255, 244] : [226, 233, 246];
      if (fl > 0) { F(flashCol, fl * fl * (weather === 'storm' ? 190 : 140)); p.rect(0, 0, W, H); }

      // передний план
      if (weather === 'forest') {
        drawTrees(terrain.treesBack, mix(nearCol, sc.land, 0.6), windAmp);
        drawGround(groundCol);
        drawTrees(terrain.treesFront, scale(sc.land, 0.4), windAmp);
        drawBlades(groundCol, windAmp, weather, 50);
      } else {
        drawGround(groundCol);
        drawBlades(groundCol, windAmp, weather, 140);
      }

      // голос B: тонкая светящаяся линия над горизонтом
      const cy = 62 + Math.sin(clock * 0.3) * 4, amp = lv.b * 24, cyc = p.lerp(1.5, 11, state.b ? state.b.tune : 0.5);
      p.noFill();
      const line = (wgt, col, al) => {
        S(col, al * (0.35 + 0.65 * ease)); p.strokeWeight(wgt);
        p.beginShape();
        for (let x = 0; x <= W; x += 4) {
          const u = x / W, env = Math.pow(Math.sin(Math.PI * u), 1.2);
          p.vertex(x, cy + (Math.sin(u * cyc * 6.283 + clock * 3) + 0.25 * Math.sin(u * cyc * 31 - clock * 2)) * amp * env);
        }
        p.endShape();
      };
      line(6, BLUE, 26); line(2.8, BLUE, 70); line(1, mix(BLUE, [235, 245, 255], 0.65), 235);

      updateParts(k, weather, playing);
      drawParts(sc);
      if (fl > 0) { p.noStroke(); F(flashCol, fl * fl * 55); p.rect(0, 0, W, H); }

      // в покое всё приглушено
      p.noStroke(); F([4, 6, 10], (1 - ease) * 105); p.rect(0, 0, W, H);
      drawHud({ place, weather, state, step, playing, recording, far, heat });
      if (p.frameCount % 90 === 0) fitCache.clear();             // шрифт мог догрузиться
    };
  };
}

export function mountDisplay(el, store, live) {
  el.innerHTML = `
    <div class="display__screen"></div>
    <div class="display__tempo">
      <span>ТЕМП</span>
      <button type="button" class="display__btn" data-bpm="-2" aria-label="Медленнее">−</button>
      <b class="display__bpm"></b>
      <button type="button" class="display__btn" data-bpm="2" aria-label="Быстрее">+</button>
    </div>`;
  const bpm = el.querySelector('.display__bpm');
  el.querySelectorAll('[data-bpm]').forEach((b) => b.addEventListener('click', () => {
    const d = +b.dataset.bpm;
    store.update((s) => ({ ...s, bpm: Math.min(200, Math.max(40, s.bpm + d)) }));
  }));
  new p5(sketch(live), el.querySelector('.display__screen'));
  return function update(state) {
    bpm.textContent = state.bpm;
  };
}
