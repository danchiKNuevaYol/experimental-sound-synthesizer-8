// Звуковой движок на Tone.js. Никаких записей и сэмплов: всё собирается из шума и простых волн.
//
//   ГОЛОС A (атмосфера) : шум / волна → фильтр (+LFO «дрейф») ───────────► КАНАЛ A ─┐
//   ГОЛОС B (элементы)  : волна + шум → фильтр → вибрато / тремоло ──────► КАНАЛ B ─┤
//   ЧАСТИЦЫ             : капля, щелчок, треск, раскат ──────────────────► КАНАЛ Ч ─┤
//                                                                                   ▼
//   каждый КАНАЛ: Драйв → Модуляция → Эхо → Реверб → громкость → панорама   ОБЩИЙ КАНАЛ:
//   (у каждого канала своя цепочка эффектов и свой индикатор уровня)        яркость → громкость →
//                                                                           лимитер → выход / запись

import * as Tone from 'tone';
import { encodeWav } from './wav.js';

const expo = (a, b, t) => a * Math.pow(b / a, t);
const fader = (v) => v * v * 1.4;                    // положение фейдера → усиление
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const DROP_NOTES = ['G4', 'A4', 'C5', 'D5', 'E5', 'G5'];

// Характер «пространства» у каждого канала свой: длина хвоста реверберации и доля эхо
const SPACE = {
  a: { decay: 6, echo: 0.75 },   // атмосфера — длинный хвост, эхо на пунктирную восьмую
  b: { decay: 4, echo: 0.5 },    // элементы — эхо на восьмую
  p: { decay: 2.5, echo: 0.375 } // частицы — короткое пространство
};

/** Канал микшера со своей цепочкой эффектов. */
class Channel {
  constructor(id, destination) {
    this.id = id;
    this.input = new Tone.Gain(1);
    this.drive = new Tone.Distortion({ distortion: 0.6, wet: 0 });
    this.mod = new Tone.Chorus({ frequency: 1.4, delayTime: 3.5, depth: 0.7, wet: 0 }).start();
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.42, wet: 0 });
    this.reverb = new Tone.Reverb({ decay: SPACE[id].decay, wet: 0 });
    this.level = new Tone.Gain(0);
    this.pan = new Tone.Panner(0);
    this.meter = new Tone.Meter({ normalRange: true, smoothing: 0.85 });
    this.input.chain(this.drive, this.mod, this.delay, this.reverb, this.level, this.pan, destination);
    this.pan.connect(this.meter);
  }

  ready() {
    return this.reverb.generate();
  }

  /** fx — {drive, mod, delay, reverb} от 0 до 1; level и pan — положения фейдера и ручки панорамы. */
  apply(fx, level, pan, bpm) {
    this.drive.wet.rampTo(fx.drive, 0.1);
    this.mod.wet.rampTo(fx.mod, 0.1);
    this.delay.wet.rampTo(fx.delay * 0.7, 0.1);
    this.delay.delayTime.rampTo((60 / bpm) * SPACE[this.id].echo, 0.2);
    this.reverb.wet.rampTo(fx.reverb * 0.9, 0.1);
    this.level.gain.rampTo(fader(level), 0.08);
    this.pan.pan.rampTo(pan * 2 - 1, 0.1);
  }
}

class Engine {
  ready = false;
  playing = false;
  recording = false;
  take = null;                // последняя запись (WAV Blob)
  state = null;
  stepIndex = 0;
  stepListeners = new Set();
  recStartedAt = 0;
  initPromise = null;
  bBase = 440;
  bRange = 0.4;

  /** Создаёт аудиограф. Вызывать из обработчика клика (политика автовоспроизведения браузера). */
  init() {
    this.initPromise ||= this.#build();
    return this.initPromise;
  }

  async #build() {
    await Tone.start();

    // --- общий канал: яркость → громкость → плавный старт/стоп → лимитер → выход и запись
    this.masterTone = new Tone.Filter({ type: 'lowpass', frequency: 12000, rolloff: -12 });
    this.masterLevel = new Tone.Gain(1);
    this.fade = new Tone.Gain(0);
    this.limiter = new Tone.Limiter(-1);
    this.masterMeter = new Tone.Meter({ normalRange: true, smoothing: 0.85 });
    this.recorder = new Tone.Recorder();
    this.fft = new Tone.FFT(32);
    this.masterTone.chain(this.masterLevel, this.fade, this.limiter);
    this.limiter.toDestination();
    this.limiter.connect(this.recorder);
    this.limiter.connect(this.fft);
    this.limiter.connect(this.masterMeter);

    // --- три канала, у каждого своя цепочка эффектов
    this.ch = {
      a: new Channel('a', this.masterTone),
      b: new Channel('b', this.masterTone),
      p: new Channel('p', this.masterTone),
    };
    await Promise.all(Object.values(this.ch).map((c) => c.ready()));

    this.#buildVoiceA();
    this.#buildVoiceB();
    this.#buildParticles();

    // --- секвенсор: 16 шагов по 1/16
    Tone.getTransport().scheduleRepeat((time) => this.#tick(time), '16n');

    this.ready = true;
    if (this.state) this.apply(this.state);
  }

  // Голос A · Атмосфера: розовый шум или волна через фильтр, который медленно «дышит»
  #buildVoiceA() {
    const A = (this.A = {});
    A.noise = new Tone.Noise('pink').start();
    A.osc = new Tone.Oscillator({ type: 'sine', frequency: 120 }).start();
    A.noiseGain = new Tone.Gain(1);
    A.oscGain = new Tone.Gain(0);
    A.filter = new Tone.Filter({ type: 'bandpass', frequency: 600, Q: 1 });
    A.level = new Tone.Gain(0);
    A.lfo = new Tone.LFO({ frequency: 0.2, min: -1200, max: 1200, amplitude: 0.5 }).start();
    A.noise.connect(A.noiseGain);
    A.osc.connect(A.oscGain);
    A.noiseGain.connect(A.filter);
    A.oscGain.connect(A.filter);
    A.filter.chain(A.level, this.ch.a.input);
    A.lfo.connect(A.filter.detune);
  }

  // Голос B · Элементы: волна + белый шум, высота сама блуждает (свисты, порывы)
  #buildVoiceB() {
    const B = (this.B = {});
    B.osc = new Tone.Oscillator({ type: 'sine', frequency: 440 }).start();
    B.noise = new Tone.Noise('white').start();
    B.oscGain = new Tone.Gain(1);
    B.noiseGain = new Tone.Gain(0);
    B.filter = new Tone.Filter({ type: 'lowpass', frequency: 1800, Q: 1 });
    B.trem = new Tone.Gain(0);
    B.level = new Tone.Gain(0);
    B.vib = new Tone.LFO({ frequency: 5, min: -100, max: 100, amplitude: 0 }).start();
    B.tremLfo = new Tone.LFO({ frequency: 4, min: 0, max: 1.2, amplitude: 0 }).start();
    B.osc.connect(B.oscGain);
    B.noise.connect(B.noiseGain);
    B.oscGain.connect(B.filter);
    B.noiseGain.connect(B.filter);
    B.filter.chain(B.trem, B.level, this.ch.b.input);
    B.vib.connect(B.osc.detune);
    B.tremLfo.connect(B.trem.gain);
    this.driftTimer = setInterval(() => {
      if (!this.playing) return;
      const f = Math.min(8000, Math.max(30, this.bBase * Math.pow(2, (Math.random() * 2 - 1) * this.bRange)));
      B.osc.frequency.rampTo(f, 1.2 + Math.random());
      if (B.filter.type === 'bandpass') B.filter.frequency.rampTo(f, 1.2);
    }, 2200);
  }

  // Частицы: короткие звуки из мембраны и шума
  #buildParticles() {
    const P = (this.P = {});
    const out = this.ch.p.input;
    P.drop = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 3, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 } });
    P.click = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.025, sustain: 0 } });
    P.clickHp = new Tone.Filter(2600, 'highpass');
    P.crackle = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0 } });
    P.crackleHp = new Tone.Filter(4500, 'highpass');
    P.boom = new Tone.MembraneSynth({ pitchDecay: 0.35, octaves: 2, envelope: { attack: 0.01, decay: 1.3, sustain: 0, release: 0.4 } });
    P.drop.volume.value = -6;
    P.click.volume.value = -12;
    P.crackle.volume.value = -14;
    P.boom.volume.value = -2;
    P.drop.connect(out);
    P.click.chain(P.clickHp, out);
    P.crackle.chain(P.crackleHp, out);
    P.boom.connect(out);
  }

  #tick(time) {
    const i = this.stepIndex;
    this.stepIndex = (i + 1) % 16;
    const s = this.state && this.state.steps;
    if (s) {
      const v = () => 0.5 + Math.random() * 0.5;
      if (s[0][i]) this.P.drop.triggerAttackRelease(pick(DROP_NOTES), '16n', time, v());
      if (s[1][i]) this.P.click.triggerAttackRelease('64n', time, v());
      if (s[2][i]) {
        this.P.crackle.triggerAttackRelease('64n', time, v());
        this.P.crackle.triggerAttackRelease('64n', time + 0.03 + Math.random() * 0.05, v() * 0.7);
      }
      if (s[3][i]) this.P.boom.triggerAttackRelease('A1', '8n', time, v());
    }
    Tone.getDraw().schedule(() => this.stepListeners.forEach((fn) => fn(i)), time);
  }

  /** Применяет состояние интерфейса к звуку. Можно вызывать до init() — значения запомнятся. */
  apply(st) {
    this.state = st;
    if (!this.ready) return;
    const { a, b, fx, mix, pan, bpm, tone } = st;
    const { A, B } = this;
    Tone.getTransport().bpm.rampTo(bpm, 0.2);

    // Голос A: ТОН → частота; ФОРМА → резонанс/яркость; ДРЕЙФ → скорость и глубина LFO фильтра
    const fA = expo(40, 1280, a.tune);
    const noiseA = a.wave === 'noise';
    if (!noiseA) A.osc.type = a.wave;
    A.osc.frequency.rampTo(fA, 0.15);
    A.oscGain.gain.rampTo(noiseA ? 0 : 0.55, 0.15);
    A.noiseGain.gain.rampTo(noiseA ? 1 : 0, 0.15);
    A.filter.type = noiseA ? 'bandpass' : 'lowpass';
    A.filter.frequency.rampTo(noiseA ? fA * 2.5 : Math.min(9000, fA * (2 + a.shape * 10)), 0.15);
    A.filter.Q.rampTo(noiseA ? 0.6 + a.shape * 14 : 0.7 + a.shape * 6, 0.15);
    A.lfo.amplitude.rampTo(a.mod, 0.2);
    A.lfo.frequency.rampTo(0.07 + a.mod * 2.2, 0.2);
    A.level.gain.rampTo(a.level * a.level * (noiseA ? 1 + a.shape * 2.5 : 1) * 0.9, 0.08);

    // Голос B: ТОН → высота; ФАКТУРА → шум и резонанс; ВИБРО → вибрато и тремоло
    this.bBase = expo(60, 2400, b.tune);
    this.bRange = 0.12 + b.texture * 0.8;
    const noiseB = b.wave === 'noise';
    if (!noiseB) B.osc.type = b.wave;
    B.osc.frequency.rampTo(this.bBase, 0.2);
    B.oscGain.gain.rampTo(noiseB ? 0 : 1, 0.15);
    B.noiseGain.gain.rampTo(noiseB ? 1 : b.texture * 0.5, 0.15);
    B.filter.type = noiseB ? 'bandpass' : 'lowpass';
    B.filter.frequency.rampTo(noiseB ? this.bBase : Math.min(9000, this.bBase * (3 + b.texture * 6)), 0.2);
    B.filter.Q.rampTo(noiseB ? 1 + b.texture * 12 : 0.7 + b.texture * 8, 0.2);
    B.vib.amplitude.rampTo(b.mod, 0.2);
    B.vib.frequency.rampTo(2 + b.mod * 8, 0.2);
    B.tremLfo.amplitude.rampTo(b.mod * 0.8, 0.2);
    B.tremLfo.frequency.rampTo(1.5 + b.mod * 9, 0.2);
    B.level.gain.rampTo(b.level * b.level * 1.5 * (noiseB ? 1 + b.texture * 2 : 1) * 0.9, 0.08);

    // Каналы со своими цепочками
    for (const id of ['a', 'b', 'p']) this.ch[id].apply(fx[id], mix[id], pan[id], bpm);

    // Общий канал
    this.masterTone.frequency.rampTo(expo(1200, 18000, tone), 0.1);
    this.masterLevel.gain.rampTo(fader(mix.master), 0.08);
  }

  async play() {
    await this.init();
    if (this.playing) return;
    this.stepIndex = 0;
    Tone.getTransport().start('+0.05');
    this.fade.gain.rampTo(1, 1.2);
    this.playing = true;
  }

  stop() {
    if (!this.ready || !this.playing) return;
    this.fade.gain.rampTo(0, 0.4);
    Tone.getTransport().stop();
    this.playing = false;
    this.stepListeners.forEach((fn) => fn(-1));
  }

  onStep(fn) {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  // --- запись
  startRec() {
    if (!this.ready || this.recording) return false;
    this.recorder.start();
    this.recording = true;
    this.take = null;
    this.recStartedAt = performance.now();
    return true;
  }

  /** Останавливает запись и возвращает WAV Blob. */
  async stopRec() {
    if (!this.recording) return null;
    this.recording = false;
    const blob = await this.recorder.stop();
    const buffer = await Tone.getContext().decodeAudioData(await blob.arrayBuffer());
    this.take = encodeWav(buffer);
    return this.take;
  }

  recElapsed() {
    return this.recording ? (performance.now() - this.recStartedAt) / 1000 : 0;
  }

  /** Уровни каналов 0…1 для индикаторов микшера и дисплея. */
  meters() {
    if (!this.ready) return null;
    const val = (m) => Math.min(1, Number(m.getValue()) || 0);
    return { a: val(this.ch.a.meter), b: val(this.ch.b.meter), p: val(this.ch.p.meter), master: val(this.masterMeter) };
  }

  /** Спектр общего выхода (дБ) для дисплея. */
  spectrum() {
    return this.ready ? this.fft.getValue() : null;
  }
}

export const engine = new Engine();
