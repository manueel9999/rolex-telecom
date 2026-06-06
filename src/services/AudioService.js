/**
 * Audio Service — Telephony tones
 * 
 * - DTMF tones for dialpad key presses
 * - Dial tone (длинные гудки при вызове)
 * - Busy tone (короткие гудки — занято)
 * - Ringback tone (гудки ожидания)
 * - Call end beep
 * - Incoming ring
 */

class AudioService {
  constructor() {
    this.ctx = null;
    this.activeTones = []; // track running oscillators to stop them

    // DTMF frequency pairs (ITU-T standard)
    this.dtmfFreqs = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
    };

    this._ringbackInterval = null;
    this._busyInterval = null;
    this._incomingInterval = null;
  }

  _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Play a DTMF tone when a dialpad key is pressed
   */
  playDTMF(key, duration = 180) {
    this._ensureContext();
    const freqs = this.dtmfFreqs[key];
    if (!freqs) return;

    const [f1, f2] = freqs;
    const now = this.ctx.currentTime;
    const end = now + duration / 1000;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = f1;
    osc2.frequency.value = f2;

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, end + 0.05);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(end + 0.06);
    osc2.stop(end + 0.06);
  }

  /**
   * Ringback tone — длинные гудки ожидания ответа
   * Стандарт РФ: 425 Hz, 1с звук / 4с пауза
   */
  startRingback() {
    this.stopAllTones();
    this._ensureContext();

    const playBeep = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = 425; // Russian standard

      // Smooth envelope: fade in 30ms, sustain, fade out 30ms
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
      gain.gain.setValueAtTime(0.15, now + 0.97);
      gain.gain.linearRampToValueAtTime(0, now + 1.0);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 1.05);

      this.activeTones.push({ osc, gain });

      // Clean up after beep ends
      osc.onended = () => {
        this.activeTones = this.activeTones.filter(t => t.osc !== osc);
      };
    };

    // First beep immediately
    playBeep();

    // Repeat: 1s beep + 4s pause = 5s cycle
    this._ringbackInterval = setInterval(playBeep, 5000);
  }

  /**
   * Busy tone — короткие гудки "занято"
   * Стандарт: 425 Hz, 0.35с звук / 0.35с пауза
   */
  startBusy() {
    this.stopAllTones();
    this._ensureContext();

    const playBeep = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = 425;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.setValueAtTime(0.15, now + 0.33);
      gain.gain.linearRampToValueAtTime(0, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);

      this.activeTones.push({ osc, gain });
      osc.onended = () => {
        this.activeTones = this.activeTones.filter(t => t.osc !== osc);
      };
    };

    playBeep();
    this._busyInterval = setInterval(playBeep, 700); // 0.35s on + 0.35s off
  }

  /**
   * Incoming call ring — мелодия входящего звонка
   * Двухтоновый сигнал с паузами
   */
  startIncomingRing() {
    this.stopAllTones();
    this._ensureContext();

    const playRing = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Ring pattern: two quick bursts
      for (let i = 0; i < 2; i++) {
        const offset = i * 0.25;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.value = 440;
        osc2.frequency.value = 480;

        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.02);
        gain.gain.setValueAtTime(0.12, now + offset + 0.18);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.2);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now + offset);
        osc2.start(now + offset);
        osc1.stop(now + offset + 0.25);
        osc2.stop(now + offset + 0.25);

        this.activeTones.push({ osc: osc1, gain }, { osc: osc2, gain });
      }
    };

    playRing();
    // Ring pattern: 0.5s ring + 3s pause
    this._incomingInterval = setInterval(playRing, 3500);
  }

  /**
   * Dial tone — непрерывный тон при снятии трубки
   * 425 Hz continuous
   */
  startDialTone() {
    this.stopAllTones();
    this._ensureContext();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 425;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);

    this.activeTones.push({ osc, gain });
  }

  /**
   * Call connected beep — короткий звук при соединении
   */
  playConnected() {
    this._ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 600;

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Call end — два коротких тона при завершении
   */
  playCallEnd() {
    this.stopAllTones();
    this._ensureContext();
    const now = this.ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 480;

      const start = now + i * 0.15;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.setValueAtTime(0.12, start + 0.08);
      gain.gain.linearRampToValueAtTime(0, start + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    }
  }

  /**
   * Stop all active tones and intervals
   */
  stopAllTones() {
    // Stop intervals
    if (this._ringbackInterval) {
      clearInterval(this._ringbackInterval);
      this._ringbackInterval = null;
    }
    if (this._busyInterval) {
      clearInterval(this._busyInterval);
      this._busyInterval = null;
    }
    if (this._incomingInterval) {
      clearInterval(this._incomingInterval);
      this._incomingInterval = null;
    }

    // Stop all active oscillators
    this.activeTones.forEach(({ osc, gain }) => {
      try {
        gain.gain.cancelScheduledValues(this.ctx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.05);
        setTimeout(() => {
          try { osc.stop(); } catch { /* already stopped */ }
        }, 60);
      } catch { /* ignore */ }
    });
    this.activeTones = [];
  }
}

export const audio = new AudioService();
