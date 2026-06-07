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
    // Audio goes through VDO.ninja — no fake tones needed
  }

  /**
   * Busy tone — короткие гудки "занято"
   * Стандарт: 425 Hz, 0.35с звук / 0.35с пауза
   */
  startBusy() {
    // Audio goes through VDO.ninja — no fake tones needed
  }

  /**
   * Incoming call ring — мелодия входящего звонка
   * Двухтоновый сигнал с паузами
   */
  startIncomingRing() {
    // Audio goes through VDO.ninja — no fake tones needed
  }

  /**
   * Dial tone — непрерывный тон при снятии трубки
   * 425 Hz continuous
   */
  startDialTone() {
    // Audio goes through VDO.ninja
  }

  /**
   * Call connected beep — короткий звук при соединении
   */
  playConnected() {
    // Audio goes through VDO.ninja
  }

  /**
   * Call end — два коротких тона при завершении
   */
  playCallEnd() {
    // Audio goes through VDO.ninja
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
