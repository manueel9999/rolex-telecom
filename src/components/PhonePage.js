/**
 * Phone Page — 2-column layout: Phone Screen | Audio Panel (WebRTC)
 * No VDO.ninja — audio is built-in via WebRTC
 */

import { icons } from '../utils/icons.js';
import { webrtc } from '../services/WebRTCService.js';
import { ws } from '../services/WsService.js';

export class PhonePage {
  constructor({ state }) {
    this.state = state;
    this.audioStarted = false;
    this.bridgeOnline = false;
    this.rtcConnected = false;
    this.inputDevices = [];
    this.isMuted = false;
  }

  render() {
    const device = this.state.device || {};

    return `
      <div class="phone-layout">
        <!-- LEFT: Phone Screen -->
        <div class="phone-screen-panel" id="phone-screen-panel">
          <div class="panel-header">
            <span class="panel-header__title">${icons.device} Экран телефона</span>
            <span class="panel-header__status" id="phone-screen-status">
              <span class="dot offline"></span> Не подключен
            </span>
          </div>
          <div class="phone-screen-area" id="phone-screen-area">
            <div class="phone-screen-placeholder" id="phone-screen-placeholder">
              <div class="phone-screen-placeholder__icon">${icons.device}</div>
              <div class="phone-screen-placeholder__text">Экран телефона</div>
              <div class="phone-screen-placeholder__hint">
                Подключите устройство для<br>отображения экрана
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
      return `
        <div class="audio-panel__connected">
          <div class="audio-status-icon connected">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </div>
          <div class="audio-status-text">Аудио подключено</div>
          <div class="audio-status-hint">Голосовая связь с мостом активна</div>
          
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

    if (this.audioStarted) {
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

    return `
      <div class="audio-panel__idle">
        <div class="audio-status-icon idle">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div class="audio-status-text">Аудио связь</div>
        <div class="audio-status-hint">
          Прямая голосовая связь с Windows ПК<br>
          без VDO.ninja и сторонних программ
        </div>
        
        <div class="audio-mic-select" id="audio-mic-select-wrap">
          <label>Микрофон:</label>
          <select id="audio-mic-select">
            <option value="">По умолчанию</option>
          </select>
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
    // Listen for bridge status
    this._bridgeStatusHandler = (msg) => {
      this.bridgeOnline = msg.online;
      this._updateBridgeStatus();
    };
    ws.on('bridge_status', this._bridgeStatusHandler);

    // Setup WebRTC callbacks
    webrtc.onConnectionChange = (connected) => {
      this.rtcConnected = connected;
      this._reRenderAudioPanel();
    };

    // Load mic devices
    await this._loadMicDevices();

    // Start audio button
    const startBtn = document.getElementById('btn-start-audio');
    if (startBtn) {
      startBtn.addEventListener('click', () => this._startAudio());
    }

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
        this._reRenderAudioPanel();
      });
    }
  }

  async _loadMicDevices() {
    try {
      this.inputDevices = await webrtc.getAudioInputDevices();
      const select = document.getElementById('audio-mic-select');
      if (select && this.inputDevices.length) {
        select.innerHTML = this.inputDevices.map(d =>
          `<option value="${d.deviceId}">${d.label || 'Микрофон'}</option>`
        ).join('');
      }
    } catch (e) {
      // permission denied — will ask on start
    }
  }

  async _startAudio() {
    const select = document.getElementById('audio-mic-select');
    const micId = select?.value || undefined;

    // Init WebRTC with our WS service
    await webrtc.init({
      role: 'operator',
      deviceId: this.state.device?.id,
      wsInstance: ws,
    });

    const ok = await webrtc.startAudio(micId);
    if (ok) {
      this.audioStarted = true;
      this._reRenderAudioPanel();
    }
  }

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
    const panel = document.getElementById('audio-panel');
    if (panel) {
      panel.innerHTML = this._renderAudioPanel(this.state.device || {});
      this.mount(); // rebind events
    }
  }

  destroy() {
    if (this._bridgeStatusHandler) {
      ws.off('bridge_status', this._bridgeStatusHandler);
    }
  }
}
