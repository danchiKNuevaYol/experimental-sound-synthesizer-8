// Блок .display — цифровой дисплей прибора, рисуется p5.js (instance mode).
// Показывает: что звучит в голосах A и B, уровни трёх каналов, спектр выхода, 16 шагов, темп, запись.
// Данные берёт из объекта live (его обновляет main.js) и из engine.

import p5 from 'p5';
import { engine } from '../audio/engine.js';
import { NAMES_A, NAMES_B, TRACKS } from '../state/scenes.js';

const W = 424, H = 224, BARS = 30;
const RGB = {
  a: [237, 132, 69], b: [117, 168, 219], p: [227, 179, 76],
  drop: [237, 132, 69], click: [117, 168, 219], crackle: [227, 179, 76], boom: [176, 174, 170],
};
const FFT_BINS = [0, 1, 2, 3, 4, 6, 8, 10, 13, 17, 22, 28];
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function sketch(live) {
  return (p) => {
    const hist = { a: new Array(BARS).fill(0), b: new Array(BARS).fill(0), p: new Array(BARS).fill(0) };

    p.setup = () => {
      p.createCanvas(W, H);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.frameRate(30);
      const font = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
      if (font) p.textFont(font);
    };

    p.draw = () => {
      const { state, step, playing, recording } = live;
      const m = playing ? engine.meters() : null;
      const fft = playing ? engine.spectrum() : null;
      p.background(6, 7, 9);

      // шапка: что звучит
      p.noStroke();
      p.textStyle(p.BOLD);
      p.textSize(12);
      p.textAlign(p.LEFT, p.CENTER);
      p.fill(playing ? 255 : 110);
      p.triangle(14, 18, 14, 32, 26, 25);
      p.fill(...RGB.a); p.text(`A: ${NAMES_A[state.a.wave]}`, 38, 25);
      p.fill(...RGB.b); p.text(`B: ${NAMES_B[state.b.wave]}`, 136, 25);
      p.fill(...RGB.p); p.text('ЧАСТИЦЫ', 236, 25);
      if (recording) {
        if (p.frameCount % 30 < 20) { p.fill(224, 72, 56); p.circle(W - 104, 25, 10); }
        p.fill(235); p.text(`ЗАП ${mmss(engine.recElapsed())}`, W - 94, 25);
      }

      // три канала: история уровня столбиками, свой цвет у каждого
      p.rectMode(p.CENTER);
      ['a', 'b', 'p'].forEach((id, k) => {
        hist[id].push(m ? Math.min(1, m[id] * 3) : 0); hist[id].shift();
        const x0 = 16 + k * (BARS * 3.6 + 6);
        for (let i = 0; i < BARS; i++) {
          const wob = Math.sin(i * 1.7 + p.frameCount * 0.35) * 0.15 + 0.85;
          p.fill(...RGB[id]);
          p.rect(x0 + i * 3.6, 98, 2, 3 + hist[id][i] * 84 * wob);
        }
      });
      // спектр общего выхода
      FFT_BINS.forEach((bin, i) => {
        const v = fft ? Math.min(1, Math.max(0, (fft[bin] + 95) / 65)) : 0;
        p.fill(i >= FFT_BINS.length - 2 ? 227 : 232, i >= FFT_BINS.length - 2 ? 179 : 232, i >= FFT_BINS.length - 2 ? 76 : 232);
        p.rect(344 + i * 6.4, 140 - (3 + v * 84) / 2, 4.5, 3 + v * 84);
      });

      // 16 шагов: цвет — первая сработавшая дорожка, текущий шаг подсвечен
      p.rectMode(p.CORNER);
      for (let i = 0; i < 16; i++) {
        const r = state.steps.findIndex((row) => row[i]);
        const x = 16 + i * 23, now = step === i;
        if (r < 0) p.fill(now ? 120 : 42, now ? 124 : 48, now ? 128 : 52);
        else p.fill(...RGB[TRACKS[r].id].map((c) => (now ? 255 : c * 0.62)));
        p.rect(x, 164, 17, 12, 2);
        if (now) { p.stroke(255, 165, 95); p.strokeWeight(1.5); p.line(x + 8.5, 152, x + 8.5, 188); p.noStroke(); }
      }

      // подвал: шаг и цепочка эффектов, которую сейчас крутят
      p.textStyle(p.NORMAL); p.textSize(11); p.textAlign(p.LEFT, p.CENTER);
      p.fill(130); p.text('ШАГ', 16, 205);
      p.fill(235); p.text(step >= 0 ? `${String(step + 1).padStart(2, '0')}/16` : '--/16', 46, 205);
      p.fill(130); p.text('ЦЕПЬ', 102, 205);
      p.fill(...RGB[state.fxTarget]); p.text(state.fxTarget === 'p' ? 'Ч' : state.fxTarget.toUpperCase(), 140, 205);
      if (!playing) {
        p.textAlign(p.CENTER, p.CENTER); p.textSize(12);
        p.fill(255, 255, 255, 90 + 90 * Math.sin(p.frameCount * 0.12));
        p.text('▶ ИЛИ ПРОБЕЛ — ЗАПУСК', W / 2, 122);
      }
    };
  };
}

export function mountDisplay(el, store, live) {
  el.innerHTML = `
    <div class="display__screen"></div>
    <div class="display__tempo">
      <span>ТЕМП</span>
      <button type="button" class="display__btn" data-bpm="-2" aria-label="Медленнее">−</button>
      <b class="display__bpm"></b>
      <button type="button" class="display__btn" data-bpm="2" aria-label="Быстрее">+</button>
    </div>`;
  const bpm = el.querySelector('.display__bpm');
  el.querySelectorAll('[data-bpm]').forEach((b) => b.addEventListener('click', () => {
    const d = +b.dataset.bpm;
    store.update((s) => ({ ...s, bpm: Math.min(200, Math.max(40, s.bpm + d)) }));
  }));
  new p5(sketch(live), el.querySelector('.display__screen'));
  return function update(state) {
    bpm.textContent = state.bpm;
  };
}
