/**
 * ck-sound.js — Sound design for session temporal modes.
 *
 * Per RetentionMechanics §6: sound shapes cognitive state during sessions.
 * Uses Tone.js (loaded from CDN) for audio synthesis.
 *
 * Temporal mode soundscapes:
 *   rapid_fire:   ticking urgency, countdown beeps, alert on time expiry
 *   deliberation: ambient drone, soft chime on vote, no pressure
 *   arena:        competitive pulse, impact on elimination, crowd energy
 *
 * Usage:
 *   import { CKSound } from '/ck.lib/ck-sound.js';
 *   const sound = new CKSound('rapid_fire');
 *   sound.start();
 *   sound.onVote();      // play vote feedback
 *   sound.onAdvance();   // play question advance
 *   sound.onComplete();  // play session seal
 *   sound.stop();
 */

export class CKSound {
  constructor(temporalMode = 'deliberation') {
    this.mode = temporalMode;
    this._started = false;
    this._synths = {};
    this._intervals = [];
  }

  async _ensureTone() {
    if (typeof Tone !== 'undefined') return true;
    try {
      // Dynamic import from CDN
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tone@14/build/Tone.js';
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        setTimeout(reject, 5000);
      });
      return typeof Tone !== 'undefined';
    } catch {
      console.warn('[ck-sound] Tone.js not available');
      return false;
    }
  }

  async start() {
    if (this._started) return;
    const ok = await this._ensureTone();
    if (!ok) return;

    await Tone.start();
    this._started = true;

    // Create synths based on mode
    if (this.mode === 'rapid_fire') {
      this._synths.tick = new Tone.MembraneSynth({
        pitchDecay: 0.01, octaves: 4, volume: -20,
      }).toDestination();
      this._synths.alert = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
        volume: -15,
      }).toDestination();
      // Tick every second
      const tick = setInterval(() => {
        if (this._started) this._synths.tick.triggerAttackRelease('C2', '16n');
      }, 1000);
      this._intervals.push(tick);

    } else if (this.mode === 'deliberation') {
      this._synths.ambient = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 2, decay: 1, sustain: 0.3, release: 2 },
        volume: -30,
      }).toDestination();
      this._synths.chime = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.5 },
        volume: -20,
      }).toDestination();

    } else if (this.mode === 'arena') {
      this._synths.pulse = new Tone.MembraneSynth({
        pitchDecay: 0.05, octaves: 6, volume: -18,
      }).toDestination();
      this._synths.impact = new Tone.NoiseSynth({
        noise: { type: 'brown' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 },
        volume: -15,
      }).toDestination();
      // Pulse every 2 beats
      const pulse = setInterval(() => {
        if (this._started) this._synths.pulse.triggerAttackRelease('E1', '8n');
      }, 2000);
      this._intervals.push(pulse);
    }
  }

  onVote() {
    if (!this._started) return;
    if (this.mode === 'rapid_fire') {
      this._synths.alert?.triggerAttackRelease('G4', '32n');
    } else if (this.mode === 'deliberation') {
      this._synths.chime?.triggerAttackRelease('E5', '8n');
    } else if (this.mode === 'arena') {
      this._synths.impact?.triggerAttackRelease('4n');
    }
  }

  onAdvance() {
    if (!this._started) return;
    if (this.mode === 'rapid_fire') {
      this._synths.alert?.triggerAttackRelease('C5', '16n');
      setTimeout(() => this._synths.alert?.triggerAttackRelease('E5', '16n'), 100);
    } else if (this.mode === 'deliberation') {
      this._synths.chime?.triggerAttackRelease('G5', '4n');
    } else if (this.mode === 'arena') {
      this._synths.pulse?.triggerAttackRelease('C2', '4n');
    }
  }

  onComplete() {
    if (!this._started) return;
    // Completion fanfare — same for all modes
    const synth = this._synths.chime || this._synths.alert || this._synths.pulse;
    if (synth?.triggerAttackRelease) {
      synth.triggerAttackRelease('C5', '8n');
      setTimeout(() => synth.triggerAttackRelease('E5', '8n'), 150);
      setTimeout(() => synth.triggerAttackRelease('G5', '4n'), 300);
    }
  }

  onTimeout() {
    if (!this._started) return;
    if (this.mode === 'rapid_fire') {
      // Urgent descending tone
      this._synths.alert?.triggerAttackRelease('A4', '16n');
      setTimeout(() => this._synths.alert?.triggerAttackRelease('F4', '16n'), 80);
      setTimeout(() => this._synths.alert?.triggerAttackRelease('D4', '8n'), 160);
    }
  }

  stop() {
    this._started = false;
    this._intervals.forEach(i => clearInterval(i));
    this._intervals = [];
    Object.values(this._synths).forEach(s => {
      try { s.dispose(); } catch {}
    });
    this._synths = {};
  }

  setMode(mode) {
    const wasStarted = this._started;
    this.stop();
    this.mode = mode;
    if (wasStarted) this.start();
  }
}

export default CKSound;
