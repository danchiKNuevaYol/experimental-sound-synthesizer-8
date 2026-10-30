// Блок .wave-switch — четыре объёмные кнопки выбора формы волны голоса.
// Разметка: <div class="wave-switch" data-param="a.wave" data-channel="a"></div>

import { WAVES, WAVE_TITLES } from '../state/scenes.js';
import { readParam, setParam } from '../state/store.js';

const ICONS = {
  sine: 'M3 13 C 9 -1, 15 -1, 20 13 S 31 27, 37 13',
  triangle: 'M4 20 L14 6 L26 20 L36 6',
  square: 'M4 19V7h14v12h14V7',
  noise: 'M3 13l3-5 3 10 3-13 3 17 3-15 3 13 3-11 3 12 3-8 3 6',
};

export function mountWaveSwitch(el, store) {
  const { param, channel } = el.dataset;
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', 'Форма волны');
  el.innerHTML = WAVES.map((w) => `
    <button type="button" class="key wave-switch__key" role="radio" data-wave="${w}" title="${WAVE_TITLES[w]}" aria-label="${WAVE_TITLES[w]}">
      <svg viewBox="0 0 40 26" aria-hidden="true"><path d="${ICONS[w]}"/></svg>
    </button>`).join('');
  const keys = [...el.querySelectorAll('.wave-switch__key')];
  keys.forEach((k) => k.addEventListener('click', () => store.update((s) => setParam(s, param, k.dataset.wave))));

  return function update(state) {
    const current = readParam(state, param);
    keys.forEach((k) => {
      const on = k.dataset.wave === current;
      k.classList.toggle('is-on', on);
      k.classList.toggle(`key--${channel}`, on);
      k.setAttribute('aria-checked', on);
    });
  };
}
