// Every sound in DUSTLINE is synthesised with WebAudio: no audio
// files are shipped. Short noise bursts make gunshots, filtered
// oscillators make beeps and stings, and a reusable noise buffer keeps
// the hot path free of allocations.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.lastStep = 0;
  }

  // Created lazily on the first user gesture; browsers block audio
  // before that. Safe to call repeatedly.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 0.5);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  ready() {
    return this.ctx !== null && this.enabled;
  }

  // A burst of filtered noise, the building block of shots and booms.
  noiseBurst({ duration = 0.12, frequency = 1800, type = 'lowpass', gain = 0.5, when = 0 }) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + when;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  // A short oscillator blip with a pitch slide.
  blip({ from = 440, to = 220, duration = 0.08, type = 'sine', gain = 0.25, when = 0 }) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  shot(weaponId) {
    if (!this.ready()) return;
    switch (weaponId) {
      case 'longshot':
        this.noiseBurst({ duration: 0.35, frequency: 900, gain: 0.8 });
        this.blip({ from: 220, to: 50, duration: 0.25, type: 'sawtooth', gain: 0.3 });
        break;
      case 'vulcan':
        this.noiseBurst({ duration: 0.08, frequency: 2400, gain: 0.4 });
        break;
      case 'ar77':
        this.noiseBurst({ duration: 0.14, frequency: 1600, gain: 0.55 });
        break;
      default:
        this.noiseBurst({ duration: 0.1, frequency: 2000, gain: 0.45 });
    }
  }

  distantShot() {
    this.noiseBurst({ duration: 0.18, frequency: 700, gain: 0.16 });
  }

  reload() {
    this.blip({ from: 900, to: 500, duration: 0.05, type: 'square', gain: 0.12 });
    this.blip({ from: 500, to: 900, duration: 0.05, type: 'square', gain: 0.12, when: 0.18 });
    this.noiseBurst({ duration: 0.05, frequency: 3000, type: 'highpass', gain: 0.1, when: 0.32 });
  }

  dryFire() {
    this.blip({ from: 1200, to: 900, duration: 0.04, type: 'square', gain: 0.12 });
  }

  hit(headshot) {
    this.blip({ from: headshot ? 1800 : 1200, to: headshot ? 1400 : 900, duration: 0.06, type: 'sine', gain: 0.3 });
  }

  hurt() {
    this.blip({ from: 180, to: 90, duration: 0.18, type: 'sawtooth', gain: 0.3 });
    this.noiseBurst({ duration: 0.1, frequency: 500, gain: 0.2 });
  }

  explosion() {
    this.noiseBurst({ duration: 1.1, frequency: 320, gain: 0.9 });
    this.blip({ from: 120, to: 30, duration: 0.9, type: 'sine', gain: 0.5 });
  }

  beep(planted) {
    this.blip({ from: planted ? 1400 : 1000, to: planted ? 1400 : 1000, duration: 0.07, type: 'square', gain: 0.18 });
  }

  plantTick() {
    this.blip({ from: 700, to: 700, duration: 0.05, type: 'square', gain: 0.14 });
  }

  roundSting(win) {
    const notes = win ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((freq, i) => this.blip({ from: freq, to: freq, duration: 0.22, type: 'triangle', gain: 0.22, when: i * 0.14 }));
  }

  buyDeny() {
    this.blip({ from: 220, to: 160, duration: 0.12, type: 'square', gain: 0.2 });
  }

  buyOk() {
    this.blip({ from: 660, to: 880, duration: 0.09, type: 'triangle', gain: 0.2 });
  }

  footstep(running) {
    if (!this.ready()) return;
    const now = performance.now();
    if (now - this.lastStep < (running ? 300 : 420)) return;
    this.lastStep = now;
    this.noiseBurst({ duration: 0.06, frequency: 400, gain: 0.08 });
  }

  grenadePin() {
    this.blip({ from: 1500, to: 1100, duration: 0.05, type: 'square', gain: 0.12 });
  }
}
