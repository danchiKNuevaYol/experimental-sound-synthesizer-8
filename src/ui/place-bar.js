// Блок .place-bar — строка «Куда отправимся?»: место и время, пресеты-места (клавиши 1–5), ссылка.
// Одна и та же строка всегда настраивает один и тот же звук, поэтому ссылкой можно поделиться.

import { PRESETS, placeToState, normalizeQuery } from '../state/place.js';

/** Настроить прибор на место и записать его в адрес страницы (?place=…). */
export function tuneTo(store, query) {
  const q = normalizeQuery(query);
  if (!q) return;
  store.update((s) => placeToState(q, s.fxTarget));
  try {
    history.replaceState(null, '', `${location.pathname}?place=${encodeURIComponent(q)}${location.hash}`);
  } catch { /* адрес менять нельзя (например, во встроенном окне) — не страшно */ }
}

function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* нет доступа к буферу */ }
  area.remove();
  return ok;
}

export function mountPlaceBar(el, store) {
  el.innerHTML = `
    <input class="place-bar__input" type="text" spellcheck="false" autocomplete="off" maxlength="60"
      placeholder="Куда отправимся? Место и время…" aria-label="Место и время, например: Озеро Тишины, 4:12">
    <button type="submit" class="key place-bar__go" title="Настроить прибор на это место — Enter">НАСТРОИТЬ ↵</button>
    <i class="place-bar__sep" aria-hidden="true"></i>
    ${PRESETS.map((p, i) => `
    <button type="button" class="place-bar__chip" data-index="${i}" title="${p.query} — клавиша ${i + 1}">${p.label}</button>`).join('')}
    <i class="place-bar__sep" aria-hidden="true"></i>
    <button type="button" class="key place-bar__link" title="Скопировать ссылку на это место">ССЫЛКА</button>`;

  const input = el.querySelector('.place-bar__input');
  const chips = [...el.querySelectorAll('.place-bar__chip')];
  const link = el.querySelector('.place-bar__link');
  let current = '';

  // форма: Enter и кнопка «Настроить»
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = normalizeQuery(input.value);
    input.blur();
    if (q) tuneTo(store, q);
    else input.value = current;
  });

  chips.forEach((chip) => chip.addEventListener('click', () => {
    const { query } = PRESETS[Number(chip.dataset.index)];
    input.value = query;
    input.blur();
    tuneTo(store, query);
  }));

  // недописанный текст не остаётся в поле: после ухода фокуса снова видно, где мы сейчас
  input.addEventListener('blur', () => { input.value = current; });

  let timer = 0;
  link.addEventListener('click', async () => {
    const url = new URL(location.href);
    if (current) url.searchParams.set('place', current);
    const ok = await copyText(url.toString());
    link.textContent = ok ? 'СКОПИРОВАНО' : 'НЕ ВЫШЛО';
    link.classList.toggle('is-done', ok !== false);
    clearTimeout(timer);
    timer = setTimeout(() => { link.textContent = 'ССЫЛКА'; link.classList.remove('is-done'); }, 1600);
  });

  return function update(state) {
    current = state.place?.query ?? '';
    chips.forEach((c, i) => c.classList.toggle('is-on', current === PRESETS[i].query));
    if (document.activeElement !== input) input.value = current;
  };
}
