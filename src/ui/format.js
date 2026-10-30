// Как показывать значение регулятора во всплывающей подсказке (атрибут data-format).
export const FORMATS = {
  percent: (v) => `${Math.round(v * 100)}%`,
  'hz-a': (v) => `${Math.round(40 * Math.pow(32, v))} Гц`,
  'hz-b': (v) => `${Math.round(60 * Math.pow(40, v))} Гц`,
  pan: (v) => {
    const p = Math.round((v - 0.5) * 200);
    return p === 0 ? 'ЦЕНТР' : p < 0 ? `Л ${-p}` : `П ${p}`;
  },
};

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
