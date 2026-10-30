// Точка входа: собирает прибор из разметки index.html.
// Каждый блок интерфейса — модуль в src/ui/ с тем же именем, что и CSS-класс блока.

import { createStore } from './state/store.js';
import { PRESETS, placeToState, normalizeQuery } from './state/place.js';
import { engine } from './audio/engine.js';
import { mountKnob } from './ui/knob.js';
import { mountFader } from './ui/fader.js';
import { mountMeter } from './ui/meter.js';
import { mountWaveSwitch } from './ui/wave-switch.js';
import { mountStepGrid } from './ui/step-grid.js';
import { mountFxRack } from './ui/fx-rack.js';
import { mountPlaceBar, tuneTo } from './ui/place-bar.js';
import { mountRecorder } from './ui/recorder.js';
import { mountDisplay } from './ui/display.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// Место берётся из адреса (?place=Озеро Тишины, 4:12) — так прибором делятся ссылкой
const startQuery = normalizeQuery(new URLSearchParams(location.search).get('place') || '') || PRESETS[0].query;
const store = createStore(placeToState(startQuery));
const live = { state: store.get(), step: -1, playing: false, recording: false };   // для дисплея (p5)

// --- блоки, которые перерисовываются от состояния
const grid = mountStepGrid($('.step-grid'), store);
const views = [
  ...$$('.knob').map((el) => mountKnob(el, store)),
  ...$$('.fader').map((el) => mountFader(el, store)),
  ...$$('.wave-switch').map((el) => mountWaveSwitch(el, store)),
  mountFxRack($('.fx-rack'), store),
  mountPlaceBar($('.place-bar'), store),
  mountDisplay($('.display'), store, live),
  grid.update,
];
const meters = $$('[data-meter]').map((el) => ({ id: el.dataset.meter, update: mountMeter(el) }));

function render(state) {
  live.state = state;
  views.forEach((update) => update(state));
  engine.apply(state);
}
store.subscribe(render);
render(store.get());

engine.onStep((i) => { live.step = i; grid.setStep(i); });

// --- транспорт и запись
const ui = { playing: false, rec: 'idle', hasTake: false };
const recorder = mountRecorder($('.recorder'), {
  play, stop, toggleRec, save,
});
function setUi(patch) {
  Object.assign(ui, patch);
  live.playing = ui.playing;
  live.recording = ui.rec === 'recording';
  recorder.update(ui);
}
setUi({});

async function play() {
  await engine.play();
  setUi({ playing: true });
}
async function finishRec() {
  setUi({ rec: 'saving' });
  await engine.stopRec();
  setUi({ rec: 'idle', hasTake: true });
}
async function stop() {
  if (ui.rec === 'recording') await finishRec();
  engine.stop();
  setUi({ playing: false });
}
async function toggleRec() {
  if (ui.rec === 'recording') return finishRec();
  if (ui.rec !== 'idle') return;
  await play();
  if (engine.startRec()) {
    recorder.tick(0);
    setUi({ rec: 'recording', hasTake: false });
  }
}
// «Озеро Тишины 04-12 — ESS.wav»: без символов, которые нельзя в имени файла
function takeFileName(place) {
  const clean = (t) => String(t).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = place ? `${clean(place.name)} ${clean(String(place.time).replace(':', '-'))}`.trim() : '';
  return `${base || 'Место'} — ESS.wav`;
}
function save() {
  if (!engine.take) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(engine.take);
  a.download = takeFileName(store.get().place);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// --- индикаторы уровня и таймер записи
(function loop() {
  const m = engine.meters();
  meters.forEach((x) => x.update(m && ui.playing ? m[x.id] : 0));
  if (ui.rec === 'recording') recorder.tick(engine.recElapsed());
  requestAnimationFrame(loop);
})();

// --- горячие клавиши для живого исполнения
const FX_KEYS = { KeyQ: 'a', KeyW: 'b', KeyE: 'p' };
const typing = (t) => t instanceof Element && t.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
window.addEventListener('keydown', (e) => {
  // в поле ввода клавиши — это текст («Ветер 1»), а не команды прибора; Escape возвращает управление
  if (typing(e.target)) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); ui.playing ? stop() : play(); return; }
  if (e.code === 'KeyR') { toggleRec(); return; }
  if (FX_KEYS[e.code]) { store.update((s) => ({ ...s, fxTarget: FX_KEYS[e.code] })); return; }
  if (e.key === '/' || e.code === 'Slash') {
    e.preventDefault();
    const input = $('.place-bar__input');
    input.focus();
    input.select();
    return;
  }
  const n = Number(e.key);
  if (n >= 1 && n <= PRESETS.length) tuneTo(store, PRESETS[n - 1].query);
});
// пробел не должен «нажимать» кнопку, на которой остался фокус
window.addEventListener('keyup', (e) => { if (e.code === 'Space' && !typing(e.target)) e.preventDefault(); });

// --- прибор нарисован в размере 1490 × 608 и масштабируется под окно целиком
const DEVICE = { w: 1490, h: 608 };
function fit() {
  const k = Math.min(1.6, (innerWidth - 24) / DEVICE.w, (innerHeight - 24) / DEVICE.h);
  const box = $('.stage__fit');
  box.style.width = `${DEVICE.w * k}px`;
  box.style.height = `${DEVICE.h * k}px`;
  $('.device').style.transform = `scale(${k})`;
}
fit();
window.addEventListener('resize', fit);
