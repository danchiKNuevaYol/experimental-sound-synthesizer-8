// Блок .fx-rack — цепочка эффектов выбранного канала: ДРАЙВ → МОДУЛЯЦИЯ → ЭХО → РЕВЕРБ.
// Вкладки A / B / Ч переключают, чью цепочку показывают ручки (fxTarget в состоянии).
// Сами ручки — обычные .knob с data-param="fx.*.drive": звёздочку подставляет store.

import { setParam } from '../state/store.js';

const TARGETS = ['a', 'b', 'p'];

export function mountFxRack(el, store) {
  const tabs = [...el.querySelectorAll('.fx-rack__tab')];
  tabs.forEach((t) => t.addEventListener('click', () => store.update((s) => setParam(s, 'fxTarget', t.dataset.target))));

  return function update(state) {
    TARGETS.forEach((id) => el.classList.toggle(`fx-rack--${id}`, state.fxTarget === id));
    tabs.forEach((t) => {
      const on = t.dataset.target === state.fxTarget;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', on);
    });
  };
}
