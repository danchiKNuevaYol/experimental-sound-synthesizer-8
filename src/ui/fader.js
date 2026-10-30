// Блок .fader — вертикальный фейдер канала.
// Разметка: <div class="fader" data-param="mix.a" data-label="A"></div>
// Тянуть ползунок или кликнуть по дорожке; колесо и стрелки ↑↓ тоже работают.

import { readParam, setParam } from '../state/store.js';
import { clamp01 } from './format.js';

export function mountFader(el, store) {
  const d = el.dataset;
  el.innerHTML = `
    <div class="fader__track" role="slider" tabindex="0" aria-orientation="vertical"
         aria-label="Громкость: ${d.label}" title="Громкость: ${d.label}" aria-valuemin="0" aria-valuemax="100">
      <div class="fader__ticks"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="fader__thumb"></div>
    </div>
    <span class="fader__label">${d.label}</span>`;

  const track = el.querySelector('.fader__track');
  const thumb = el.querySelector('.fader__thumb');
  let value = 0;
  let dragging = false;

  const set = (v) => store.update((s) => setParam(s, d.param, clamp01(v)));
  const fromY = (e) => {
    const r = track.getBoundingClientRect();
    set(1 - (e.clientY - r.top) / r.height);
  };

  track.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    track.focus();
    track.setPointerCapture(e.pointerId);
    dragging = true;
    fromY(e);
  });
  track.addEventListener('pointermove', (e) => dragging && fromY(e));
  track.addEventListener('pointerup', () => { dragging = false; });
  track.addEventListener('pointercancel', () => { dragging = false; });
  track.addEventListener('wheel', (e) => { e.preventDefault(); set(value - Math.sign(e.deltaY) * 0.04); }, { passive: false });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); set(value + 0.04); }
    if (e.key === 'ArrowDown') { e.preventDefault(); set(value - 0.04); }
  });

  return function update(state) {
    value = readParam(state, d.param);
    thumb.style.top = `${(1 - value) * 100}%`;
    track.setAttribute('aria-valuenow', Math.round(value * 100));
  };
}
