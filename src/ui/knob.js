// Блок .knob — тактильный регулятор.
// Разметка: <div class="knob" data-param="a.tune" data-label="ТОН" data-channel="a" data-default="0.4"></div>
//   data-param   — путь параметра в состоянии ('*' — текущая цепочка эффектов)
//   data-channel — цвет колпачка: a | b | p | master | * (цвет текущей цепочки); без него — светлый
//   data-color   — цвет без привязки к каналу: light | dark
//   data-size, data-default, data-format, data-hint — размер, значение по двойному клику, формат, подсказка
//
// Управление: зажать и вести курсор вокруг ручки — стрелка смотрит на курсор
// (чем дальше от ручки, тем точнее). Колесо, стрелки клавиатуры, двойной клик — сброс.

import { readParam, setParam } from '../state/store.js';
import { FORMATS, clamp01 } from './format.js';

const START = -135;  // угол минимума: 0° — вверх, по часовой стрелке
const SWEEP = 270;
const COLORS = ['a', 'b', 'p', 'master', 'light', 'dark'];

export function mountKnob(el, store) {
  const d = el.dataset;
  const fmt = FORMATS[d.format] || FORMATS.percent;
  const def = d.default != null ? Number(d.default) : 0.5;
  const name = d.hint || d.label || '';
  el.style.setProperty('--knob-size', `${d.size || 56}px`);
  el.innerHTML = `
    <div class="knob__dial" role="slider" tabindex="0" aria-label="${name}" title="${name}" aria-valuemin="0" aria-valuemax="100">
      <div class="knob__cap"></div>
      <div class="knob__tick"></div>
      <span class="knob__bubble" hidden></span>
    </div>
    ${d.label ? `<span class="knob__label">${d.label}</span>` : ''}`;

  const dial = el.querySelector('.knob__dial');
  const tick = el.querySelector('.knob__tick');
  const bubble = el.querySelector('.knob__bubble');
  let value = 0;
  let dragging = false;

  const set = (v) => store.update((s) => setParam(s, d.param, clamp01(v)));

  const pointAt = (e, first) => {
    const r = dial.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.08) return;           // у самого центра угол «дрожит»
    const a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (a >= START && a <= START + SWEEP) set((a - START) / SWEEP);
    else if (!first) set(value >= 0.5 ? 1 : 0);                // «пустой» сектор снизу — упор в край
  };

  dial.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dial.focus();
    dial.setPointerCapture(e.pointerId);
    dragging = true;
    el.classList.add('is-drag');
    bubble.hidden = false;
    pointAt(e, true);
  });
  dial.addEventListener('pointermove', (e) => dragging && pointAt(e, false));
  const end = () => {
    dragging = false;
    el.classList.remove('is-drag');
    bubble.hidden = true;
  };
  dial.addEventListener('pointerup', end);
  dial.addEventListener('pointercancel', end);
  dial.addEventListener('wheel', (e) => { e.preventDefault(); set(value - Math.sign(e.deltaY) * 0.03); }, { passive: false });
  dial.addEventListener('dblclick', () => set(def));
  dial.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02 }[e.key];
    if (step) { e.preventDefault(); set(value + step); }
    if (e.key === 'Home') set(0);
    if (e.key === 'End') set(1);
  });

  return function update(state) {
    value = readParam(state, d.param);
    tick.style.transform = `rotate(${START + SWEEP * value}deg)`;
    dial.setAttribute('aria-valuenow', Math.round(value * 100));
    dial.setAttribute('aria-valuetext', fmt(value));
    bubble.textContent = fmt(value);
    const color = d.channel === '*' ? state.fxTarget : d.channel || d.color || 'light';
    COLORS.forEach((c) => el.classList.toggle(`knob--${c}`, c === color));
  };
}
