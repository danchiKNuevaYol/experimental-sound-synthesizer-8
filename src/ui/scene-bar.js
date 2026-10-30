// Блок .scene-bar — готовые звуковые сцены в шапке прибора (клавиши 1–5).

import { SCENES, fromScene } from '../state/scenes.js';

export function mountSceneBar(el, store) {
  el.innerHTML = `<span class="scene-bar__label">СЦЕНЫ</span>${SCENES.map((s, i) => `
    <button type="button" class="scene-bar__chip" data-scene="${s.id}" title="${s.name} — клавиша ${i + 1}">${s.name.toUpperCase()}</button>`).join('')}`;
  const chips = [...el.querySelectorAll('.scene-bar__chip')];
  chips.forEach((c) => c.addEventListener('click', () => applyScene(store, c.dataset.scene)));

  return function update(state) {
    chips.forEach((c) => c.classList.toggle('is-on', c.dataset.scene === state.scene));
  };
}

export function applyScene(store, id) {
  const scene = SCENES.find((s) => s.id === id);
  if (scene) store.update((s) => fromScene(scene, s.fxTarget));
}
