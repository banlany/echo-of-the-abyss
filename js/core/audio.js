/* ==========================================================
   audio.js — 纯合成音效（零资源依赖）
   ----------------------------------------------------------
   用 WebAudio 的振荡器 + 噪声实时合成。避免加载任何外
   部音频文件，保证双击 index.html 就能完整运行。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  const Audio = {
    ctx: null,
    master: null,
    muted: false,
    ready: false,
    _noiseBuf: null,
    _budget: 0,      // 每帧最多发声次数，防爆音
    _lastTick: 0,

    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);

      // 预生成 1s 白噪声
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
      this.ready = true;
    },

    resume() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
      return this.muted;
    },

    _ok() {
      if (!this.ready || this.muted) return false;
      const now = performance.now();
      if (now - this._lastTick > 16) { this._lastTick = now; this._budget = 6; }
      if (this._budget-- <= 0) return false;
      return this.ctx.state === 'running';
    },

    /** 基础音：振荡器 + 包络 */
    tone(freq, dur, type, vol, slideTo, delay) {
      if (!this._ok()) return;
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol || 0.2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },

    /** 噪声爆发：打击感 */
    noise(dur, vol, filterFreq, type) {
      if (!this._ok() || !this._noiseBuf) return;
      const c = this.ctx, t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = this._noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type || 'bandpass';
      f.frequency.value = filterFreq || 1200;
      f.Q.value = 1.1;
      const g = c.createGain();
      g.gain.setValueAtTime(vol || 0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.02);
    },

    // ---------- 语义化音效 ----------
    hit() { this.noise(0.055, 0.09, 2400, 'highpass'); },
    slash() { this.noise(0.085, 0.1, 900, 'bandpass'); this.tone(340, 0.06, 'sawtooth', 0.05, 180); },
    shoot() { this.tone(720, 0.05, 'square', 0.05, 420); },
    magic() { this.tone(520, 0.14, 'triangle', 0.09, 980); },
    kill() { this.noise(0.075, 0.1, 500, 'lowpass'); this.tone(150, 0.09, 'sine', 0.09, 70); },
    explode() { this.noise(0.3, 0.2, 260, 'lowpass'); this.tone(90, 0.3, 'sine', 0.14, 40); },
    pickup() { this.tone(1180, 0.055, 'sine', 0.07, 1650); },
    coin() { this.tone(1560, 0.045, 'square', 0.045, 2100); },
    heal() { this.tone(520, 0.16, 'sine', 0.1, 880); this.tone(780, 0.2, 'sine', 0.06, 1180, 0.06); },
    levelup() {
      const n = [523, 659, 784, 1046];
      n.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.1, f * 1.01, i * 0.065));
    },
    buy() { this.tone(880, 0.07, 'square', 0.07, 1320); this.tone(1320, 0.1, 'sine', 0.05, 1760, 0.06); },
    deny() { this.tone(220, 0.14, 'sawtooth', 0.08, 110); },
    dash() { this.noise(0.16, 0.12, 700, 'bandpass'); this.tone(300, 0.12, 'sine', 0.05, 700); },
    hurt() { this.tone(190, 0.16, 'sawtooth', 0.13, 90); this.noise(0.1, 0.1, 300, 'lowpass'); },
    wave() { this.tone(160, 0.5, 'sine', 0.1, 220); this.tone(320, 0.5, 'triangle', 0.05, 440, 0.05); },
    death() {
      [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.11, f * 0.98, i * 0.16));
    },
    bond() { this.tone(660, 0.3, 'sine', 0.09, 990); this.tone(990, 0.34, 'sine', 0.06, 1320, 0.08); },
  };

  RG.Audio = Audio;
})(window);
