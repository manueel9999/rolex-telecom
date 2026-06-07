/**
 * Phone Page — 2-column layout: Phone Screen | Audio Panel (WebRTC)
 * Full audio controls: mic/speaker selection, testing, volume meters
 */

import { icons } from '../utils/icons.js';
import { webrtc } from '../services/WebRTCService.js';
import { ws } from '../services/WsService.js';
import { audio } from '../services/AudioService.js';

export class PhonePage {
  constructor({ state }) {
    this.state = state;
    this.audioStarted = false;
    this.bridgeOnline = false;
    this.rtcConnected = false;
    this.inputDevices = [];
    this.outputDevices = [];
    this.isMuted = false;
    this.inputNumber = '';
    this._micTestStream = null;
    this._micTestAnalyser = null;
    this._micTestAnimFrame = null;
    this._micTestAudioCtx = null;
    this._speakerTestOsc = null;
    this._micLevelAnimFrame = null;
    this._liveMicAnalyser = null;
    this._liveMicAudioCtx = null;
    this._bridgeStatusHandler = null;
    this._destroyed = false;
  }

  render() {
    const device = this.state.device || {};

    return `
      <div class="phone-layout">
        <!-- LEFT: Dialpad -->
        <div class="phone-screen-panel" id="phone-screen-panel">
          <div class="panel-header">
            <span class="panel-header__title">${icons.dialpad} Набор номера</span>
            <span class="panel-header__status" id="phone-screen-status">
              <span class="dot ${this.state.agentOnline ? 'online' : 'offline'}"></span>
              ${this.state.agentOnline ? 'Готов' : 'Не подключен'}
            </span>
          </div>
          <div class="phone-screen-area" id="phone-screen-area">
            <div class="dialpad-container">
              <!-- Number display -->
              <div class="phone-display">
                <div class="phone-display__number ${this.inputNumber ? 'has-number' : ''}" id="phone-number-display">
                  ${this.inputNumber || 'Введите номер'}
                </div>
                <div class="phone-display__actions" id="display-actions" style="display:${this.inputNumber ? 'flex' : 'none'}">
                  <button class="phone-display__clear" id="btn-clear-number" title="Очистить">✕</button>
                </div>
              </div>

              <!-- Dialpad grid -->
              <div class="dialpad" id="dialpad">
                <button class="dialpad__key" data-key="1"><span class="dialpad__digit">1</span></button>
                <button class="dialpad__key" data-key="2"><span class="dialpad__digit">2</span><span class="dialpad__letters">ABC</span></button>
                <button class="dialpad__key" data-key="3"><span class="dialpad__digit">3</span><span class="dialpad__letters">DEF</span></button>
                <button class="dialpad__key" data-key="4"><span class="dialpad__digit">4</span><span class="dialpad__letters">GHI</span></button>
                <button class="dialpad__key" data-key="5"><span class="dialpad__digit">5</span><span class="dialpad__letters">JKL</span></button>
                <button class="dialpad__key" data-key="6"><span class="dialpad__digit">6</span><span class="dialpad__letters">MNO</span></button>
                <button class="dialpad__key" data-key="7"><span class="dialpad__digit">7</span><span class="dialpad__letters">PQRS</span></button>
                <button class="dialpad__key" data-key="8"><span class="dialpad__digit">8</span><span class="dialpad__letters">TUV</span></button>
                <button class="dialpad__key" data-key="9"><span class="dialpad__digit">9</span><span class="dialpad__letters">WXYZ</span></button>
                <button class="dialpad__key" data-key="*"><span class="dialpad__digit">✱</span></button>
                <button class="dialpad__key" data-key="0"><span class="dialpad__digit">0</span><span class="dialpad__letters">+</span></button>
                <button class="dialpad__key" data-key="#"><span class="dialpad__digit">#</span></button>
              </div>

              <!-- Action buttons -->
              <div class="dialpad-actions">
                <button class="dialpad-action__backspace" id="btn-backspace" title="Удалить">
                  ⌫
                </button>
                <button class="dialpad-action__call" id="btn-call" title="Позвонить">
                  ${icons.phone}
                </button>
                <button class="dialpad-action__paste" id="btn-paste" title="Вставить">
                  📋
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Audio Panel (WebRTC) -->
        <div class="conference-panel" id="conference-panel">
          <div class="panel-header">
            <span class="panel-header__title">${icons.headphones} Аудио связь</span>
            <span class="panel-header__room" id="audio-bridge-status">
              <span class="dot ${this.bridgeOnline ? 'online' : 'offline'}"></span>
              <span>Мост: <strong>${this.bridgeOnline ? 'Онлайн' : 'Оффлайн'}</strong></span>
            </span>
          </div>
          <div class="audio-panel" id="audio-panel">
            ${this._renderAudioPanel(device)}
          </div>
        </div>
      </div>
    `;
  }

  _renderAudioPanel(device) {
    if (this.rtcConnected) {
      return this._renderConnectedPanel();
    }
    if (this.audioStarted) {
      return this._renderConnectingPanel();
    }
    return this._renderIdlePanel();
  }

  _renderConnectedPanel() {
    return `
      <div class="audio-panel__connected">
        <div class="audio-status-icon connected">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div class="audio-status-text">Аудио подключено</div>
        <div class="audio-status-hint">Голосовая связь с мостом активна</div>

        <!-- Live mic level -->
        <div class="audio-level-section">
          <div class="audio-level-row">
            <span class="audio-level-label">🎤 Микрофон</span>
            <div class="audio-level-bar-bg">
              <div class="audio-level-bar" id="mic-level-bar"></div>
            </div>
          </div>
        </div>

        <!-- Device selectors -->
        <div class="audio-device-section">
          <div class="audio-device-row">
            <label>🎤 Микрофон:</label>
            <select id="audio-mic-select-connected" class="audio-device-select">
              <option value="">По умолчанию</option>
            </select>
          </div>
          <div class="audio-device-row">
            <label>🔊 Динамик:</label>
            <select id="audio-speaker-select-connected" class="audio-device-select">
              <option value="">По умолчанию</option>
            </select>
          </div>
        </div>

        <div class="audio-controls">
          <button class="audio-control-btn ${this.isMuted ? 'active' : ''}" id="btn-mute-mic" title="Мут микрофона">
            ${this.isMuted ? icons.micOff : icons.mic}
            <span>${this.isMuted ? 'Вкл. микрофон' : 'Выкл. микрофон'}</span>
          </button>
          <button class="audio-control-btn danger" id="btn-stop-audio" title="Отключить">
            ${icons.phoneOff}
            <span>Отключить</span>
          </button>
        </div>
      </div>
    `;
  }

  _renderConnectingPanel() {
    return `
      <div class="audio-panel__connecting">
        <div class="audio-status-icon connecting">
          <div class="audio-pulse-ring"></div>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          </svg>
        </div>
        <div class="audio-status-text">Ожидание моста...</div>
        <div class="audio-status-hint">Откройте страницу моста на Windows ПК</div>
        <div class="audio-bridge-link">
          <code id="bridge-url">${window.location.origin}/bridge.html</code>
          <button class="audio-copy-btn" id="btn-copy-bridge" title="Копировать">📋</button>
        </div>
      </div>
    `;
  }

  _renderIdlePanel() {
    return `
      <div class="audio-panel__idle">
        <div class="audio-status-icon idle">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div class="audio-status-text">Аудио связь</div>
        <div class="audio-status-hint">
          Прямая голосовая связь с Windows ПК
        </div>

        <!-- Mic selector + test -->
        <div class="audio-setup-section">
          <div class="audio-setup-row">
            <label>🎤 Микрофон:</label>
            <div class="audio-setup-controls">
              <select id="audio-mic-select" class="audio-device-select">
                <option value="">Загрузка...</option>
              </select>
              <button class="audio-test-btn" id="btn-test-mic" title="Тест микрофона">
                🎙️ Тест
              </button>
            </div>
          </div>

          <!-- Mic test level meter -->
          <div class="audio-test-meter" id="mic-test-meter" style="display:none;">
            <div class="audio-level-bar-bg">
              <div class="audio-level-bar" id="mic-test-level-bar"></div>
            </div>
            <button class="audio-test-stop-btn" id="btn-stop-mic-test">⏹ Стоп</button>
          </div>

          <div class="audio-setup-row">
            <label>🔊 Динамик:</label>
            <div class="audio-setup-controls">
              <select id="audio-speaker-select" class="audio-device-select">
                <option value="">Загрузка...</option>
              </select>
              <button class="audio-test-btn" id="btn-test-speaker" title="Тест динамика">
                🔔 Тест
              </button>
            </div>
          </div>
        </div>

        <button class="audio-start-btn" id="btn-start-audio">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          </svg>
          Начать аудио
        </button>
      </div>
    `;
  }

  async mount() {
    if (this._destroyed) return;

    // Check initial bridge status from cache
    const lastBridge = ws.getLastState('bridge_status');
    if (lastBridge) {
      this.bridgeOnline = lastBridge.online;
      this._updateBridgeStatus();
    }

    // Listen for bridge status (only if not already listening)
    if (!this._bridgeStatusHandler) {
      this._bridgeStatusHandler = (msg) => {
        this.bridgeOnline = msg.online;
        this._updateBridgeStatus();
      };
      ws.on('bridge_status', this._bridgeStatusHandler);
    }

    // Setup WebRTC callbacks
    webrtc.onConnectionChange = (connected) => {
      if (this._destroyed) return;
      this.rtcConnected = connected;
      this._reRenderAudioPanel();
      if (connected) {
        this._startMicLevelMeter();
      } else {
        this._stopMicLevelMeter();
      }
    };

    // Load devices
    await this._loadDevices();

    // Bind events based on current state
    this._bindDialpadEvents();
    this._bindAudioPanelEvents();
  }

  /**
   * Bind all audio panel events (idle + connecting + connected)
   * Unified method to avoid duplicate binding
   */
  _bindAudioPanelEvents() {
    this._bindIdleEvents();
    this._bindConnectingEvents();
    this._bindConnectedEvents();
  }

  _bindDialpadEvents() {
    // Dialpad keys
    const dialpad = document.getElementById('dialpad');
    if (dialpad) {
      dialpad.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-key]');
        if (btn) {
          const key = btn.dataset.key;
          this.inputNumber += key;
          audio.playDTMF(key);
          this._updateDisplay();
          ws.send({ type: 'dial', key });
        }
      });
    }

    // Call button
    const callBtn = document.getElementById('btn-call');
    if (callBtn) {
      callBtn.addEventListener('click', () => {
        if (this.inputNumber) {
          ws.send({ type: 'call', number: this.inputNumber });
        }
      });
    }

    // Backspace
    const backBtn = document.getElementById('btn-backspace');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.inputNumber = this.inputNumber.slice(0, -1);
        this._updateDisplay();
      });
    }

    // Clear
    const clearBtn = document.getElementById('btn-clear-number');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.inputNumber = '';
        this._updateDisplay();
      });
    }

    // Paste
    const pasteBtn = document.getElementById('btn-paste');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          const cleaned = text.replace(/[^0-9+*#]/g, '');
          if (cleaned) {
            this.inputNumber = cleaned;
            this._updateDisplay();
          }
        } catch(e) { /* clipboard denied */ }
      });
    }
  }

  _updateDisplay() {
    const display = document.getElementById('phone-number-display');
    const actions = document.getElementById('display-actions');
    if (display) {
      display.textContent = this.inputNumber || 'Введите номер';
      display.classList.toggle('has-number', !!this.inputNumber);
    }
    if (actions) {
      actions.style.display = this.inputNumber ? 'flex' : 'none';
    }
  }

  _bindIdleEvents() {
    // Start audio button
    const startBtn = document.getElementById('btn-start-audio');
    if (startBtn) {
      startBtn.addEventListener('click', () => this._startAudio());
    }

    // Test mic button
    const testMicBtn = document.getElementById('btn-test-mic');
    if (testMicBtn) {
      testMicBtn.addEventListener('click', () => this._testMic());
    }

    // Stop mic test
    const stopMicTestBtn = document.getElementById('btn-stop-mic-test');
    if (stopMicTestBtn) {
      stopMicTestBtn.addEventListener('click', () => this._stopMicTest());
    }

    // Test speaker button
    const testSpeakerBtn = document.getElementById('btn-test-speaker');
    if (testSpeakerBtn) {
      testSpeakerBtn.addEventListener('click', () => this._testSpeaker());
    }
  }

  _bindConnectingEvents() {
    // Copy bridge URL
    const copyBtn = document.getElementById('btn-copy-bridge');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const url = document.getElementById('bridge-url')?.textContent;
        if (url) {
          navigator.clipboard.writeText(url);
          copyBtn.textContent = '✅';
          setTimeout(() => copyBtn.textContent = '📋', 2000);
        }
      });
    }
  }

  _bindConnectedEvents() {
    // Mute button
    const muteBtn = document.getElementById('btn-mute-mic');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        this.isMuted = !this.isMuted;
        webrtc.setMuted(this.isMuted);
        this._reRenderAudioPanel();
      });
    }

    // Stop button
    const stopBtn = document.getElementById('btn-stop-audio');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        webrtc.stop();
        this.audioStarted = false;
        this.rtcConnected = false;
        this._stopMicLevelMeter();
        this._reRenderAudioPanel();
      });
    }

    // Connected mic selector
    const micSelect = document.getElementById('audio-mic-select-connected');
    if (micSelect) {
      this._populateSelect(micSelect, this.inputDevices);
      micSelect.addEventListener('change', async () => {
        await webrtc.changeMic(micSelect.value);
      });
    }

    // Connected speaker selector
    const speakerSelect = document.getElementById('audio-speaker-select-connected');
    if (speakerSelect) {
      this._populateSelect(speakerSelect, this.outputDevices);
      speakerSelect.addEventListener('change', async () => {
        await webrtc.setOutputDevice(speakerSelect.value);
      });
    }

    // Start live mic level meter
    if (this.rtcConnected) {
      this._startMicLevelMeter();
    }
  }

  async _loadDevices() {
    try {
      this.inputDevices = await webrtc.getAudioInputDevices();
      this.outputDevices = await webrtc.getAudioOutputDevices();

      const micSelect = document.getElementById('audio-mic-select');
      if (micSelect) this._populateSelect(micSelect, this.inputDevices);

      const speakerSelect = document.getElementById('audio-speaker-select');
      if (speakerSelect) this._populateSelect(speakerSelect, this.outputDevices);
    } catch (e) {
      // permission denied — will ask on start
    }
  }

  _populateSelect(select, devices) {
    if (!select || !devices.length) return;
    select.innerHTML = devices.map(d =>
      `<option value="${d.deviceId}">${d.label || d.kind}</option>`
    ).join('');
  }

  async _startAudio() {
    const micSelect = document.getElementById('audio-mic-select');
    const speakerSelect = document.getElementById('audio-speaker-select');
    const micId = micSelect?.value || undefined;
    const speakerId = speakerSelect?.value || undefined;

    // Stop any running mic test
    this._stopMicTest();

    // Init WebRTC with our WS service
    await webrtc.init({
      role: 'operator',
      deviceId: this.state.device?.id,
      wsInstance: ws,
    });

    // Set output device before starting
    if (speakerId) {
      await webrtc.setOutputDevice(speakerId);
    }

    const ok = await webrtc.startAudio(micId);
    if (ok) {
      this.audioStarted = true;
      this._reRenderAudioPanel();
    }
  }

  // =============================================
  // MIC TEST
  // =============================================

  async _testMic() {
    try {
      const micSelect = document.getElementById('audio-mic-select');
      const micId = micSelect?.value || undefined;

      const constraints = {
        audio: micId ? { deviceId: { exact: micId } } : true,
        video: false,
      };

      // Stop any existing mic test first
      this._stopMicTest();

      this._micTestStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Show level meter
      const meter = document.getElementById('mic-test-meter');
      if (meter) meter.style.display = 'flex';

      // Setup analyser
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(this._micTestStream);
      this._micTestAnalyser = audioCtx.createAnalyser();
      this._micTestAnalyser.fftSize = 256;
      source.connect(this._micTestAnalyser);

      this._micTestAudioCtx = audioCtx;
      this._animateMicTest();

      // Change button
      const btn = document.getElementById('btn-test-mic');
      if (btn) {
        btn.textContent = '⏹ Стоп';
        btn.onclick = () => this._stopMicTest();
      }
    } catch (e) {
      console.error('Mic test failed:', e);
    }
  }

  _animateMicTest() {
    if (this._destroyed) return;
    const bar = document.getElementById('mic-test-level-bar');
    if (!bar || !this._micTestAnalyser) return;

    const data = new Uint8Array(this._micTestAnalyser.frequencyBinCount);
    this._micTestAnalyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const pct = Math.min(100, (avg / 128) * 100);

    bar.style.width = pct + '%';
    bar.style.background = pct > 60 ? '#ef4444' : pct > 30 ? '#f59e0b' : '#22c55e';

    this._micTestAnimFrame = requestAnimationFrame(() => this._animateMicTest());
  }

  _stopMicTest() {
    if (this._micTestStream) {
      this._micTestStream.getTracks().forEach(t => t.stop());
      this._micTestStream = null;
    }
    if (this._micTestAudioCtx) {
      try { this._micTestAudioCtx.close(); } catch (e) {}
      this._micTestAudioCtx = null;
    }
    if (this._micTestAnimFrame) {
      cancelAnimationFrame(this._micTestAnimFrame);
      this._micTestAnimFrame = null;
    }
    this._micTestAnalyser = null;

    const meter = document.getElementById('mic-test-meter');
    if (meter) meter.style.display = 'none';

    const btn = document.getElementById('btn-test-mic');
    if (btn) {
      btn.textContent = '🎙️ Тест';
      btn.onclick = () => this._testMic();
    }
  }

  // =============================================
  // SPEAKER TEST
  // =============================================

  async _testSpeaker() {
    const speakerSelect = document.getElementById('audio-speaker-select');
    const speakerId = speakerSelect?.value || undefined;

    const btn = document.getElementById('btn-test-speaker');

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Create a pleasant test tone (two-tone chime)
      const playTone = (freq, start, duration) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, audioCtx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + start);
        osc.stop(audioCtx.currentTime + start + duration);
      };

      // If we can set output device, create audio element approach
      if (speakerId) {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const dest = audioCtx.createMediaStreamDestination();

        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.3;
        oscillator.connect(gainNode);
        gainNode.connect(dest);

        const testAudio = new Audio();
        testAudio.srcObject = dest.stream;
        if (typeof testAudio.setSinkId === 'function') {
          await testAudio.setSinkId(speakerId);
        }
        testAudio.play();
        oscillator.start();

        // Second tone
        setTimeout(() => {
          oscillator.frequency.value = 1320;
        }, 200);

        setTimeout(() => {
          oscillator.stop();
          testAudio.pause();
          audioCtx.close();
        }, 600);
      } else {
        // Default output
        playTone(880, 0, 0.3);
        playTone(1320, 0.2, 0.4);
        setTimeout(() => audioCtx.close(), 1000);
      }

      if (btn) {
        btn.textContent = '✅ OK';
        setTimeout(() => { if (btn) btn.textContent = '🔔 Тест'; }, 1500);
      }
    } catch (e) {
      console.error('Speaker test failed:', e);
      if (btn) btn.textContent = '❌ Ошибка';
    }
  }

  // =============================================
  // LIVE MIC LEVEL METER (connected state)
  // =============================================

  _startMicLevelMeter() {
    // Close previous context to prevent leak
    this._stopMicLevelMeter();

    if (!webrtc.localStream) return;

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(webrtc.localStream);
      this._liveMicAnalyser = audioCtx.createAnalyser();
      this._liveMicAnalyser.fftSize = 256;
      source.connect(this._liveMicAnalyser);
      this._liveMicAudioCtx = audioCtx;
      this._animateLiveMic();
    } catch (e) {
      console.error('Mic meter error:', e);
    }
  }

  _animateLiveMic() {
    if (this._destroyed) return;
    const bar = document.getElementById('mic-level-bar');
    if (!bar || !this._liveMicAnalyser) return;

    const data = new Uint8Array(this._liveMicAnalyser.frequencyBinCount);
    this._liveMicAnalyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const pct = Math.min(100, (avg / 128) * 100);

    bar.style.width = pct + '%';
    bar.style.background = pct > 60 ? '#ef4444' : pct > 30 ? '#f59e0b' : '#22c55e';

    this._micLevelAnimFrame = requestAnimationFrame(() => this._animateLiveMic());
  }

  _stopMicLevelMeter() {
    if (this._micLevelAnimFrame) {
      cancelAnimationFrame(this._micLevelAnimFrame);
      this._micLevelAnimFrame = null;
    }
    if (this._liveMicAudioCtx) {
      try { this._liveMicAudioCtx.close(); } catch (e) {}
      this._liveMicAudioCtx = null;
    }
    this._liveMicAnalyser = null;
  }

  // =============================================
  // HELPERS
  // =============================================

  _updateBridgeStatus() {
    const el = document.getElementById('audio-bridge-status');
    if (el) {
      el.innerHTML = `
        <span class="dot ${this.bridgeOnline ? 'online' : 'offline'}"></span>
        <span>Мост: <strong>${this.bridgeOnline ? 'Онлайн' : 'Оффлайн'}</strong></span>
      `;
    }
  }

  _reRenderAudioPanel() {
    if (this._destroyed) return;
    const panel = document.getElementById('audio-panel');
    if (panel) {
      panel.innerHTML = this._renderAudioPanel(this.state.device || {});
      // Rebind audio events only (dialpad keeps its handlers from initial mount)
      this._bindAudioPanelEvents();
    }
  }

  destroy() {
    this._destroyed = true;
    this._stopMicTest();
    this._stopMicLevelMeter();
    if (this._bridgeStatusHandler) {
      ws.off('bridge_status', this._bridgeStatusHandler);
      this._bridgeStatusHandler = null;
    }
  }
}
