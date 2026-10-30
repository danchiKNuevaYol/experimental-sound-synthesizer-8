// Архетипы погоды — «сырые» заготовки звука.
// Из них place.js строит звук конкретного места: берёт архетип по ключевым словам и слегка сдвигает его по зерну (seed).
// Все значения регуляторов — числа 0…1; перевод в герцы, секунды и т. п. делает audio/engine.js.

export const WAVES = ['sine', 'triangle', 'square', 'noise'];
export const WAVE_TITLES = { sine: 'Синус', triangle: 'Треугольник', square: 'Прямоугольник', noise: 'Шум' };

// Как дисплей называет звук голоса в зависимости от формы волны
export const NAMES_A = { sine: 'ГУЛ', triangle: 'ШЕЛЕСТ', square: 'ДРОЖЬ', noise: 'ВЕТЕР' };
export const NAMES_B = { sine: 'СВИСТ', triangle: 'ВОЛНА', square: 'ВИБРАЦИЯ', noise: 'РАСКАТ' };

// Каналы микшера: a — голос A, b — голос B, p — частицы, master — общий
export const CHANNELS = { a: 'A', b: 'B', p: 'ЧАСТИЦЫ', master: 'ОБЩИЙ' };

// Дорожки частиц на 16-шаговой сетке
export const TRACKS = [
  { id: 'drop', name: 'Капля' },
  { id: 'click', name: 'Щелчок' },
  { id: 'crackle', name: 'Треск' },
  { id: 'boom', name: 'Раскат' },
];

const row = (...on) => Array.from({ length: 16 }, (_, i) => on.includes(i + 1));
const fx = (drive, mod, delay, reverb) => ({ drive, mod, delay, reverb });

// Ключи — тип погоды: wind, rain, storm, forest, alien
export const ARCHETYPES = {
  wind: {
    bpm: 78, tone: 0.7,
    a: { wave: 'noise', tune: 0.38, shape: 0.55, mod: 0.6, level: 0.8 },
    b: { wave: 'sine', tune: 0.7, texture: 0.5, mod: 0.45, level: 0.4 },
    fx: { a: fx(0, 0.3, 0.15, 0.6), b: fx(0, 0.2, 0.4, 0.55), p: fx(0, 0, 0.3, 0.4) },
    mix: { a: 0.75, b: 0.5, p: 0.3, master: 0.8 },
    pan: { a: 0.4, b: 0.65, p: 0.5 },
    steps: [row(3, 12), row(), row(7, 15), row()],
  },
  rain: {
    bpm: 110, tone: 0.8,
    a: { wave: 'noise', tune: 0.78, shape: 0.25, mod: 0.2, level: 0.7 },
    b: { wave: 'sine', tune: 0.3, texture: 0.2, mod: 0.2, level: 0.15 },
    fx: { a: fx(0, 0.1, 0, 0.45), b: fx(0, 0, 0.2, 0.5), p: fx(0, 0.15, 0.25, 0.5) },
    mix: { a: 0.7, b: 0.3, p: 0.65, master: 0.8 },
    pan: { a: 0.5, b: 0.5, p: 0.45 },
    steps: [row(1, 4, 7, 10, 12, 15), row(3, 6, 9, 13, 16), row(2, 5, 8, 11, 14), row()],
  },
  storm: {
    bpm: 70, tone: 0.6,
    a: { wave: 'noise', tune: 0.12, shape: 0.35, mod: 0.45, level: 0.85 },
    b: { wave: 'noise', tune: 0.08, texture: 0.8, mod: 0.5, level: 0.7 },
    fx: { a: fx(0.2, 0.1, 0.1, 0.7), b: fx(0.35, 0, 0.3, 0.85), p: fx(0.15, 0, 0.2, 0.75) },
    mix: { a: 0.8, b: 0.65, p: 0.55, master: 0.8 },
    pan: { a: 0.5, b: 0.35, p: 0.6 },
    steps: [row(6, 14), row(), row(3, 4, 11), row(1, 9)],
  },
  forest: {
    bpm: 92, tone: 0.75,
    a: { wave: 'triangle', tune: 0.45, shape: 0.45, mod: 0.55, level: 0.6 },
    b: { wave: 'sine', tune: 0.85, texture: 0.25, mod: 0.8, level: 0.35 },
    fx: { a: fx(0, 0.35, 0.1, 0.6), b: fx(0, 0.2, 0.5, 0.6), p: fx(0, 0.1, 0.35, 0.45) },
    mix: { a: 0.65, b: 0.5, p: 0.45, master: 0.8 },
    pan: { a: 0.45, b: 0.7, p: 0.3 },
    steps: [row(5, 13), row(2, 4, 6, 8, 10, 12, 14, 16), row(7), row()],
  },
  alien: {
    bpm: 96, tone: 0.65,
    a: { wave: 'square', tune: 0.22, shape: 0.85, mod: 0.85, level: 0.55 },
    b: { wave: 'square', tune: 0.55, texture: 0.9, mod: 0.95, level: 0.5 },
    fx: { a: fx(0.3, 0.8, 0.3, 0.7), b: fx(0.45, 0.6, 0.65, 0.6), p: fx(0.2, 0.4, 0.5, 0.5) },
    mix: { a: 0.6, b: 0.55, p: 0.5, master: 0.8 },
    pan: { a: 0.3, b: 0.7, p: 0.5 },
    steps: [row(1, 4, 7, 10, 13), row(3, 8, 14), row(2, 5, 9, 16), row(1, 11)],
  },
};
