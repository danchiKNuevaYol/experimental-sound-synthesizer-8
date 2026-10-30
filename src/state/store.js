// Минимальное хранилище состояния: одно дерево, подписка на изменения.
// Параметры адресуются строкой-путём: 'a.tune', 'fx.b.delay', 'mix.master'.

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    update(fn) {
      const next = fn(state);
      if (next === state) return;
      state = next;
      subs.forEach((s) => s(state));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export const getPath = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);

export function setPath(obj, path, value) {
  const [k, ...rest] = path.split('.');
  return { ...obj, [k]: rest.length ? setPath(obj[k], rest.join('.'), value) : value };
}

// Микшер не «ломает» сцену, а правка звука (волна, ручки голосов, эффекты, сетка) — снимает подсветку сцены
const KEEPS_SCENE = ['mix.', 'pan.', 'tone', 'fxTarget'];

/** Меняет параметр по пути. Звёздочка в пути — текущая цепочка эффектов (fxTarget). */
export function setParam(state, path, value) {
  const real = path.replace('*', state.fxTarget);
  const next = setPath(state, real, value);
  return KEEPS_SCENE.some((p) => real.startsWith(p)) ? next : { ...next, scene: null };
}

export const readParam = (state, path) => getPath(state, path.replace('*', state.fxTarget));
