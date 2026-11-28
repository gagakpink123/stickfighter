import { SoundCue } from './combat';

/**
 * CinemaAudioEngine (keeps RetroAudioEngine export name for drop-in compatibility).
 * 100% procedural Web Audio synthesis modeled after modern action-movie soundtracks
 * and dramatic layered foley (orchestral brass/strings, Taiko trailer drums, hall reverb,
 * sub-bass impacts, whip/wind whooshes, and bullet-time bass warp).
 */
export class RetroAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private slowMoFactor = 1;

  private masterGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private gestureBound = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.88, this.ctx.currentTime, 0.02);
    }
    if (muted) {
      this.stopBgm();
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Adjusts master acoustic warmth & lowpass sweep during Bullet Time slow-motion.
   */
  public setSlowMoFactor(scale: number): void {
    const clamped = Math.max(0.15, Math.min(1, scale));
    if (Math.abs(clamped - this.slowMoFactor) < 0.02) return;
    this.slowMoFactor = clamped;
    if (this.ctx && this.masterFilter) {
      const targetHz = clamped < 0.7 ? 750 + clamped * 2200 : 18500;
      this.masterFilter.frequency.setTargetAtTime(targetHz, this.ctx.currentTime, 0.04);
    }
  }

  private ensureGestureUnlock(): void {
    if (typeof window === 'undefined' || this.gestureBound) return;
    this.gestureBound = true;
    const onGesture = () => {
      this.unlock(true);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture, { passive: true });
  }

  public unlock(fromGesture = false): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      if (
        !fromGesture &&
        !(navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation
          ?.hasBeenActive
      ) {
        this.ensureGestureUnlock();
        return;
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.buildAudioBus();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private buildAudioBus(): void {
    if (!this.ctx) return;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4.5;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.16;

    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 18500;
    this.masterFilter.Q.value = 0.85;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.88;

    // Procedural stereo cinema hall impulse response (~1.45s tail)
    const sr = this.ctx.sampleRate;
    const irLen = Math.floor(sr * 1.45);
    const irBuf = this.ctx.createBuffer(2, irLen, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen;
        const env = Math.pow(1 - t, 2.8);
        data[i] = (Math.random() * 2 - 1) * env * (0.65 + 0.35 * Math.sin(i * 0.002 + ch));
      }
    }
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = irBuf;

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.28;

    this.compressor.connect(this.masterFilter);
    this.masterFilter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.compressor);

    const nLen = Math.floor(sr * 1.5);
    const nBuf = this.ctx.createBuffer(1, nLen, sr);
    const nData = nBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < nLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      nData[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.1848) * 0.22));
    }
    this.noiseBuffer = nBuf;
  }

  private connectOutput(node: AudioNode, wetAmount = 0.32): void {
    if (!this.compressor) return;
    node.connect(this.compressor);
    if (this.reverbNode && this.ctx && wetAmount > 0.01) {
      const wet = this.ctx.createGain();
      wet.gain.value = wetAmount;
      node.connect(wet);
      wet.connect(this.reverbNode);
    }
  }

  public startBgm(): void {
    if (this.muted || this.bgmTimer !== null) return;
    if (typeof window === 'undefined') return;
    this.unlock(false);

    // Action movie orchestral score in D Minor (epic brass/string chord progression + Taiko ostinato)
    const chords = [
      { root: 73.42, tones: [146.83, 220.0, 261.63, 349.23] },
      { root: 58.27, tones: [116.54, 174.61, 220.0, 293.66] },
      { root: 65.41, tones: [130.81, 196.0, 246.94, 329.63] },
      { root: 55.0, tones: [110.0, 164.81, 220.0, 277.18] },
    ];
    const stringMotif = [
      587.33, 0, 523.25, 440.0,
      587.33, 0, 659.25, 698.46,
      523.25, 0, 440.0, 392.0,
      440.0, 493.88, 523.25, 554.37,
    ];

    this.bgmTimer = window.setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const step = this.bgmStep % 16;
      const chordIdx = Math.floor(step / 4) % chords.length;
      const chord = chords[chordIdx];

      const slowScale = this.slowMoFactor < 0.7 ? 0.55 : 1;

      if (step % 4 === 0) {
        for (const f of chord.tones) {
          this.playEnsembleVoice(f, 0.78, 0.022 * slowScale, 1450);
        }
        this.playEnsembleVoice(chord.root, 0.72, 0.048, 360);
      }

      if (step % 2 === 0) {
        this.playFilteredTone(
          chord.root * 2,
          'sawtooth',
          0.16,
          0.03,
          chord.root * 1.98,
          620,
          0.2
        );
      }

      if (step === 0 || step === 6 || step === 10) {
        this.playDrumHit(76, 32, 0.24, 0.14);
      }
      if (step === 4 || step === 12) {
        this.playNoiseBurst(0.16, 0.045 * slowScale, 1550, 900, 1.2, 0.48);
        this.playDrumHit(140, 58, 0.12, 0.06);
      } else if (step % 2 === 1) {
        this.playNoiseBurst(0.05, 0.014 * slowScale, 3200, 2600, 1.4, 0.12);
      }

      const melody = stringMotif[step];
      if (melody > 0 && slowScale > 0.7) {
        this.playEnsembleVoice(melody, 0.34, 0.02, 2200);
      }

      this.bgmStep += 1;
    }, 185);
  }

  public stopBgm(): void {
    if (this.bgmTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  public playUiClick(confirm = false): void {
    if (this.muted) return;
    this.unlock();
    if (confirm) {
      this.playFilteredTone(440, 'triangle', 0.14, 0.08, 440, 2400, 0.35);
      this.playFilteredTone(659.25, 'sine', 0.18, 0.07, 659.25, 3200, 0.4);
      this.playNoiseBurst(0.045, 0.035, 2200, 1200, 1.2, 0.2);
    } else {
      this.playFilteredTone(320, 'sine', 0.06, 0.045, 240, 1600, 0.15);
      this.playNoiseBurst(0.025, 0.025, 2600, 1800, 1.5, 0.1);
    }
  }

  public playCue(cue: SoundCue): void {
    if (this.muted) return;
    this.unlock();
    const jitter = 0.94 + Math.random() * 0.12;

    switch (cue) {
      case 'punch_swing':
        this.playNoiseBurst(0.11, 0.075, 1300 * jitter, 420 * jitter, 1.5, 0.22);
        this.playFilteredTone(150 * jitter, 'sine', 0.08, 0.03, 75, 420, 0.1);
        break;

      case 'kick_swing':
        this.playNoiseBurst(0.15, 0.095, 920 * jitter, 280 * jitter, 1.35, 0.28);
        this.playFilteredTone(130 * jitter, 'triangle', 0.11, 0.04, 58, 360, 0.15);
        break;

      case 'hit_light':
        this.playDrumHit(165 * jitter, 52, 0.12, 0.17);
        this.playNoiseBurst(0.085, 0.14, 1900 * jitter, 550, 1.1, 0.32);
        break;

      case 'hit_heavy':
        this.playDrumHit(150 * jitter, 34, 0.24, 0.26);
        this.playNoiseBurst(0.16, 0.2, 1600 * jitter, 340, 0.9, 0.48);
        this.playFilteredTone(240 * jitter, 'sawtooth', 0.11, 0.09, 68, 950, 0.35);
        break;

      case 'block':
        this.playDrumHit(260 * jitter, 110, 0.09, 0.12);
        this.playFilteredTone(780 * jitter, 'triangle', 0.11, 0.075, 420, 1900, 0.35);
        this.playNoiseBurst(0.07, 0.09, 2600, 900, 1.8, 0.28);
        break;

      case 'parry':
        this.playFilteredTone(1180 * jitter, 'triangle', 0.15, 0.12, 1760, 4800, 0.42);
        this.playFilteredTone(1960 * jitter, 'sine', 0.18, 0.09, 2640, 6200, 0.45);
        this.playNoiseBurst(0.06, 0.08, 3600, 1800, 2.0, 0.3);
        break;

      case 'dash':
        this.playNoiseBurst(0.09, 0.06, 800 * jitter, 2200, 1.4, 0.18);
        break;

      case 'throw_grab':
        this.playDrumHit(140 * jitter, 46, 0.14, 0.16);
        this.playNoiseBurst(0.09, 0.08, 1200, 460, 1.3, 0.24);
        break;

      case 'tantrum_cry':
        this.playFilteredTone(660 * jitter, 'sawtooth', 0.28, 0.09, 980, 2800, 0.45);
        this.playFilteredTone(520 * jitter, 'triangle', 0.34, 0.08, 410, 2200, 0.4);
        this.playNoiseBurst(0.24, 0.09, 1800, 650, 1.1, 0.35);
        break;

      case 'jump':
        this.playNoiseBurst(0.12, 0.06, 480, 1450 * jitter, 1.6, 0.22);
        this.playFilteredTone(135, 'sine', 0.11, 0.045, 260, 700, 0.18);
        break;

      case 'land':
        this.playDrumHit(98 * jitter, 38, 0.11, 0.095);
        this.playNoiseBurst(0.07, 0.045, 420, 160, 1.0, 0.18);
        break;

      case 'body_slam':
        this.playDrumHit(92 * jitter, 26, 0.36, 0.28);
        this.playNoiseBurst(0.24, 0.16, 720, 160, 0.85, 0.52);
        break;

      case 'bullet_time':
        this.playDrumHit(130, 26, 0.72, 0.32);
        this.playFilteredTone(320, 'sawtooth', 0.65, 0.085, 48, 820, 0.6);
        this.playNoiseBurst(0.55, 0.12, 2400, 220, 1.4, 0.58);
        break;

      case 'sp_sapu':
        this.playNoiseBurst(0.2, 0.11, 1850, 700, 1.6, 0.36);
        this.playFilteredTone(260, 'triangle', 0.18, 0.07, 420, 1400, 0.3);
        break;

      case 'sp_serbet':
        this.playNoiseBurst(0.08, 0.11, 650, 4200, 2.2, 0.38);
        if (this.ctx) {
          window.setTimeout(() => {
            this.playNoiseBurst(0.06, 0.18, 4600, 1400, 1.8, 0.45);
            this.playFilteredTone(980, 'sawtooth', 0.055, 0.07, 260, 3400, 0.32);
          }, 35);
        }
        break;

      case 'sp_buku':
        this.playNoiseBurst(0.15, 0.09, 2600, 1100, 2.0, 0.3);
        this.playDrumHit(175, 78, 0.14, 0.11);
        break;

      case 'sp_kelereng':
        this.playFilteredTone(2150 * jitter, 'sine', 0.14, 0.095, 1680, 5200, 0.45);
        this.playFilteredTone(3420 * jitter, 'triangle', 0.09, 0.05, 2900, 6200, 0.42);
        this.playNoiseBurst(0.06, 0.055, 3800, 1800, 2.4, 0.25);
        break;

      case 'super_activate':
        this.playDrumHit(110, 28, 0.52, 0.3);
        this.playEnsembleVoice(110, 0.55, 0.09, 1800);
        this.playEnsembleVoice(164.81, 0.55, 0.075, 2100);
        this.playEnsembleVoice(220, 0.55, 0.07, 2400);
        this.playNoiseBurst(0.45, 0.13, 360, 2600, 1.3, 0.55);
        break;

      case 'round_call':
        this.playDrumHit(98, 42, 0.38, 0.18);
        this.playEnsembleVoice(146.83, 0.42, 0.065, 1600);
        this.playEnsembleVoice(220.0, 0.42, 0.055, 1800);
        break;

      case 'countdown_tick':
        this.playDrumHit(145, 62, 0.16, 0.14);
        this.playFilteredTone(587.33, 'triangle', 0.18, 0.065, 587.33, 2800, 0.35);
        this.playFilteredTone(880.0, 'sine', 0.12, 0.035, 880.0, 3200, 0.3);
        break;

      case 'fight_call':
        this.playDrumHit(130, 40, 0.32, 0.24);
        this.playEnsembleVoice(293.66, 0.36, 0.075, 2400);
        this.playEnsembleVoice(440.0, 0.36, 0.065, 2800);
        this.playNoiseBurst(0.35, 0.11, 3400, 1400, 0.9, 0.52);
        break;

      case 'ko_call':
        this.playDrumHit(125, 24, 0.78, 0.34);
        this.playEnsembleVoice(146.83, 0.72, 0.08, 1200);
        this.playEnsembleVoice(155.56, 0.72, 0.06, 1100);
        this.playNoiseBurst(0.62, 0.18, 1800, 260, 0.8, 0.65);
        break;

      case 'victory_call':
        this.playDrumHit(98, 36, 0.34, 0.18);
        this.playEnsembleVoice(261.63, 0.35, 0.065, 2200);
        this.playEnsembleVoice(329.63, 0.35, 0.055, 2400);
        window.setTimeout(() => {
          this.playEnsembleVoice(293.66, 0.35, 0.065, 2400);
          this.playEnsembleVoice(392.0, 0.35, 0.06, 2600);
        }, 160);
        window.setTimeout(() => {
          this.playDrumHit(110, 34, 0.48, 0.22);
          this.playEnsembleVoice(293.66, 0.85, 0.075, 2500);
          this.playEnsembleVoice(440.0, 0.85, 0.07, 2800);
          this.playEnsembleVoice(587.33, 0.85, 0.065, 3200);
        }, 330);
        break;
    }
  }

  private playDrumHit(
    startFreq: number,
    endFreq: number,
    duration: number,
    gainLevel: number
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(Math.max(24, startFreq), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration * 0.55);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainLevel, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    this.connectOutput(gain, 0.28);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playEnsembleVoice(
    freq: number,
    duration: number,
    gainLevel: number,
    cutoffHz: number
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'sawtooth';
    oscA.frequency.setValueAtTime(freq * 0.996, now);
    oscB.frequency.setValueAtTime(freq * 1.004, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz * 0.45, now);
    filter.frequency.linearRampToValueAtTime(cutoffHz, now + Math.min(0.12, duration * 0.3));
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(180, cutoffHz * 0.4),
      now + duration
    );

    const gain = this.ctx.createGain();
    const attack = Math.min(0.09, duration * 0.22);
    gain.gain.setValueAtTime(0.0005, now);
    gain.gain.linearRampToValueAtTime(gainLevel, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    this.connectOutput(gain, 0.45);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + duration + 0.02);
    oscB.stop(now + duration + 0.02);
  }

  private playFilteredTone(
    startFreq: number,
    type: OscillatorType,
    duration: number,
    gainLevel: number,
    endFreq: number,
    filterHz: number,
    wetAmount = 0.25
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(25, startFreq), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25, endFreq), now + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterHz, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainLevel, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    this.connectOutput(gain, wetAmount);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoiseBurst(
    duration: number,
    gainLevel: number,
    startFilterHz: number,
    endFilterHz: number,
    q: number,
    wetAmount = 0.3
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(60, startFilterHz), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, endFilterHz), now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainLevel, now + Math.min(0.014, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    src.connect(filter);
    filter.connect(gain);
    this.connectOutput(gain, wetAmount);
    src.start(now);
    src.stop(now + duration + 0.02);
  }
}
