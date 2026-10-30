// Блок .step-grid — 16-шаговая сетка частиц и кнопки справа:
// случайный узор, сдвиг влево/вправо, сброс.

import { TRACKS } from '../state/scenes.js';

const randomRow = (p) => Array.from({ length: 16 }, () => Math.random() < p);
const withSteps = (s, steps) => ({ ...s, scene: null, steps });

export function mountStepGrid(el, store) {
  const nums = Array.from({ length: 16 }, (_, i) => `<span class="step-grid__num">${i + 1}</span>`).join('');
  const rows = TRACKS.map((t, r) => `
    <div class="step-grid__row">
      <span class="step-grid__name"><i class="dot dot--${t.id}"></i>${t.name}</span>
      ${Array.from({ length: 16 }, (_, i) => `
        <button type="button" class="step-grid__cell step-grid__cell--${t.id}${i % 4 === 0 ? ' step-grid__cell--beat' : ''}"
          data-row="${r}" data-step="${i}" aria-label="${t.name}, шаг ${i + 1}"></button>`).join('')}
    </div>`).join('');

  el.innerHTML = `
    <div class="step-grid__rows">
      <div class="step-grid__row step-grid__row--nums"><span></span>${nums}</div>
      ${rows}
    </div>
    <div class="step-grid__side">
      <button type="button" class="key key--small" data-action="random" title="Случайный узор">•••</button>
      <button type="button" class="key key--small" data-action="left" title="Сдвинуть влево">‹</button>
      <button type="button" class="key key--small" data-action="right" title="Сдвинуть вправо">›</button>
      <button type="button" class="key key--small" data-action="clear" title="Очистить сетку">СБРОС</button>
    </div>`;

  const cells = [...el.querySelectorAll('.step-grid__cell')];
  const numEls = [...el.querySelectorAll('.step-grid__num')];

  el.addEventListener('click', (e) => {
    const cell = e.target.closest('.step-grid__cell');
    if (cell) {
      const r = +cell.dataset.row, i = +cell.dataset.step;
      store.update((s) => withSteps(s, s.steps.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === i ? !v : v)) : row))));
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    const shift = (d) => (s) => withSteps(s, s.steps.map((row) => row.map((_, i) => row[(i - d + 16) % 16])));
    if (action === 'random') store.update((s) => withSteps(s, [0.32, 0.3, 0.26, 0.1].map(randomRow)));
    if (action === 'left') store.update(shift(-1));
    if (action === 'right') store.update(shift(1));
    if (action === 'clear') store.update((s) => withSteps(s, s.steps.map((row) => row.map(() => false))));
  });

  let now = -1;
  return {
    update(state) {
      cells.forEach((c) => {
        const on = state.steps[+c.dataset.row][+c.dataset.step];
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on);
      });
    },
    setStep(i) {
      if (i === now) return;
      now = i;
      cells.forEach((c) => c.classList.toggle('is-now', +c.dataset.step === i));
      numEls.forEach((n, k) => n.classList.toggle('is-now', k === i));
    },
  };
}
