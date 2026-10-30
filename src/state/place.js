// Место → звук. Пользователь вводит «Озеро Тишины, 4:12» — а мы детерминированно «настраиваемся» на это место.
// Идея в три шага: строка → зерно (seed) → место (название, время, погода) → полное состояние инструмента.
// Одна и та же строка всегда даёт один и тот же звук: вся «случайность» берётся из PRNG с этим зерном.

import { ARCHETYPES, TRACKS } from './scenes.js';

// Готовые места для быстрого выбора
export const PRESETS = [
  { query: 'Ветреный перевал, 06:40', label: 'ПЕРЕВАЛ' },
  { query: 'Дождливый сад, 14:10', label: 'САД' },
  { query: 'Гроза над полем, 19:30', label: 'ГРОЗА' },
  { query: 'Ночной лес, 02:15', label: 'ЛЕС' },
  { query: 'Кристальная планета, 00:00', label: 'ПЛАНЕТА' },
];

const MAX_LEN = 60;

// Обрезаем пробелы, схлопываем повторы, ограничиваем длину
export function normalizeQuery(q) {
  return String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN).trim();
}

// FNV-1a, 32 бита: строка → беззнаковое целое. Регистр не важен — хешируем строчные буквы.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — маленький быстрый PRNG: зерно → последовательность чисел [0, 1)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Слова времени суток → «HH:MM» (проверяются по порядку: «полночь» раньше «ночи»)
const TIME_WORDS = [
  ['рассвет', '05:30'],
  ['утр', '08:00'],
  ['полд', '12:00'],
  ['ден', '14:00'],
  ['закат', '20:30'],
  ['вечер', '19:00'],
  ['полноч', '00:00'],
  ['ноч', '02:00'],
];

// Ключевые слова погоды; порядок = приоритет (гроза важнее дождя и т. д.)
const WEATHER_WORDS = [
  ['storm', ['гроз', 'шторм', 'гром', 'бур', 'молни', 'ураган']],
  ['rain', ['дожд', 'ливн', 'ливен', 'морос', 'луж', 'капел']],
  ['alien', ['планет', 'кристал', 'луна', 'лунн', 'марс', 'кеплер', 'космос', 'неземн', 'сон', 'сновид']],
  ['forest', ['лес', 'рощ', 'чащ', 'болот', 'сад', 'тайг', 'джунгл']],
  ['wind', ['ветер', 'ветр', 'перевал', 'степ', 'пустын', 'берег', 'мор', 'скал', 'гор', 'поле']],
];

const pad2 = (n) => String(n).padStart(2, '0');
const fmtTime = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
const TIME_RE = /(\d{1,2})[:.](\d{2})/g;

// Строка → Place: название, время суток, тип погоды. Недостающее добираем из PRNG.
export function parsePlace(query) {
  const q = normalizeQuery(query) || PRESETS[0].query;
  const low = q.toLowerCase();
  const seed = hash32(low);
  const rnd = mulberry32(seed);

  // Время: сначала «ЧЧ:ММ», потом слова, потом случайное
  let minutes = null;
  let timeMatch = null;
  for (const m of q.matchAll(TIME_RE)) {
    const h = +m[1];
    const mi = +m[2];
    if (h <= 23 && mi <= 59) {
      minutes = h * 60 + mi;
      timeMatch = m[0];
      break;
    }
  }
  if (minutes === null) {
    const hit = TIME_WORDS.find(([w]) => low.includes(w));
    if (hit) {
      const [h, mi] = hit[1].split(':').map(Number);
      minutes = h * 60 + mi;
    } else {
      minutes = Math.floor(rnd() * 1440);
    }
  }

  // Название: до первой запятой; без запятой — вся строка без времени
  let name;
  const comma = q.indexOf(',');
  if (comma >= 0) name = q.slice(0, comma).trim();
  else name = (timeMatch ? q.replace(timeMatch, '') : q).replace(/[\s,;.\-–—]+$/, '').trim();
  if (!name) name = q;
  name = name.charAt(0).toUpperCase() + name.slice(1);

  // Погода: по ключевым словам, иначе по зерну
  const found = WEATHER_WORDS.find(([, words]) => words.some((w) => low.includes(w)));
  const weather = found ? found[0] : WEATHER_WORDS[Math.floor(rnd() * WEATHER_WORDS.length)][0];

  return {
    query: q,
    name,
    time: fmtTime(minutes),
    minutes,
    weather,
    seed,
    night: minutes < 330 || minutes >= 1290,
  };
}

const WAVES = ['sine', 'triangle', 'square', 'noise'];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// Состояние инструмента для места: архетип погоды + сдвиг по зерну + поправка на время суток
export function placeToState(query, fxTarget = 'a') {
  const place = parsePlace(query);
  const rnd = mulberry32((place.seed ^ 0x9e3779b9) >>> 0);
  const jit = (v, amp) => clamp(v + (rnd() * 2 - 1) * amp);
  const st = JSON.parse(JSON.stringify(ARCHETYPES[place.weather]));

  // Лёгкий разброс всех ручек, чтобы два «ветреных» места не звучали одинаково
  for (const voice of [st.a, st.b]) {
    for (const k of Object.keys(voice)) if (k !== 'wave') voice[k] = jit(voice[k], 0.12);
  }
  for (const ch of Object.values(st.fx)) {
    for (const k of Object.keys(ch)) ch[k] = jit(ch[k], 0.12);
  }
  for (const k of ['a', 'b', 'p']) st.mix[k] = jit(st.mix[k], 0.08);
  for (const k of Object.keys(st.pan)) st.pan[k] = jit(st.pan[k], 0.15);
  st.bpm = clamp(Math.round(st.bpm * (1 + (rnd() * 2 - 1) * 0.1)), 40, 200);

  // Иногда голос B (а в лесу и «неземном» — и A) берёт другую форму волны.
  // Ветер, дождь и гроза держат A шумом.
  const reroll = (voice) => {
    const change = rnd() < 0.25;
    const pick = rnd();
    if (!change) return;
    const others = WAVES.filter((w) => w !== voice.wave);
    voice.wave = others[Math.floor(pick * others.length)];
  };
  if (place.weather === 'forest' || place.weather === 'alien') reroll(st.a);
  reroll(st.b);

  // Ритм: плотность дорожки сохраняется (±2 удара), а расставляются удары по зерну
  st.steps = st.steps.map((track, i) => {
    const base = track.filter(Boolean).length;
    const max = TRACKS[i].id === 'boom' ? 3 : 12;
    const n = clamp(base + Math.floor(rnd() * 5) - 2, 0, max);
    return scatter(rnd, n);
  });

  // Время суток
  if (place.night) {
    st.tone = clamp(st.tone - 0.15);
    for (const ch of Object.values(st.fx)) ch.reverb = clamp(ch.reverb + 0.1);
    st.bpm = clamp(st.bpm - 6, 40, 200);
    // Ночью в лесу и на ветру дорожка «Щелчок» читается как сверчки
    if (place.weather === 'forest' || place.weather === 'wind') {
      st.steps[1] = fillTo(rnd, st.steps[1], 6);
    }
  }
  const m = place.minutes;
  if ((m >= 300 && m < 480) || (m >= 1110 && m < 1290)) st.b.mod = clamp(st.b.mod + 0.1);

  return { ...st, scene: null, fxTarget, place };
}

// n ударов на 16 шагах в случайных местах (тасование Фишера — Йетса)
function scatter(rnd, n) {
  const idx = Array.from({ length: 16 }, (_, i) => i);
  for (let i = 15; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const on = new Set(idx.slice(0, n));
  return Array.from({ length: 16 }, (_, i) => on.has(i));
}

// Добавляет удары в свободные шаги, пока их не станет хотя бы min
function fillTo(rnd, track, min) {
  const out = track.slice();
  const free = out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  let need = min - out.length + free.length;
  while (need-- > 0 && free.length) out[free.splice(Math.floor(rnd() * free.length), 1)[0]] = true;
  return out;
}
