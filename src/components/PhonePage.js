/**
 * Phone Page — 2-column layout: Dialpad | VDO.ninja Audio
 * Right panel uses VDO.ninja iframe for audio bridge
 */

import { icons } from '../utils/icons.js';
import { ws } from '../services/WsService.js';
import { audio } from '../services/AudioService.js';

export class PhonePage {
  constructor({ state }) {
    this.state = state;
    this.inputNumber = '';
    this.isMuted = false;
    this.vdoStarted = false;
    this._vdoIframe = null;
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

        <!-- RIGHT: VDO.ninja Audio Panel -->
        <div class="conference-panel" id="conference-panel">
          <div class="panel-header">
            <span class="panel-header__title">${icons.headphones} Аудио связь</span>
            <span class="panel-header__room" id="vdo-status">
              <span class="dot offline"></span>
              <span>VDO.ninja</span>
            </span>
          </div>
          <div class="audio-panel" id="audio-panel">
            ${this._renderAudioPanel()}
          </div>
        </div>
      </div>
    `;
  }

  _renderAudioPanel() {
    if (this.vdoStarted) {
      return this._renderVdoActive();
    }
    return this._renderVdoIdle();
  }

  _renderVdoIdle() {
    const device = this.state.device || {};
    const room = device.vdoRoom || '—';

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
        <div class="audio-status-text">Аудио связь через VDO.ninja</div>
        <div class="audio-status-hint">
          Подключитесь к комнате для двусторонней голосовой связи с Windows ПК
        </div>

        <div class="vdo-room-info">
          <div class="vdo-room-info__row">
            <span class="vdo-room-info__label">Комната:</span>
            <code class="vdo-room-info__value">${room}</code>
          </div>
        </div>

        <button class="audio-start-btn" id="btn-start-vdo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          </svg>
          Подключить аудио
        </button>

        <div class="vdo-bridge-hint">
          <span class="vdo-bridge-hint__label">Мост на Windows ПК:</span>
          <div class="vdo-bridge-hint__url">
            <code id="bridge-url">${window.location.origin}/bridge.html?device=${device.id || ''}</code>
            <button class="audio-copy-btn" id="btn-copy-bridge" title="Копировать">📋</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderVdoActive() {
    return `
      <div class="audio-panel__connected vdo-active-panel">
        <div class="audio-status-icon connected">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div class="audio-status-text">VDO.ninja подключён</div>
        <div class="audio-status-hint">Двусторонняя аудио связь активна</div>

        <!-- VDO.ninja iframe container -->
        <div class="vdo-iframe-container" id="vdo-iframe-container">
          <!-- iframe injected dynamically -->
        </div>

        <div class="audio-controls">
          <button class="audio-control-btn ${this.isMuted ? 'active' : ''}" id="btn-mute-vdo" title="Мут микрофона">
            ${this.isMuted ? icons.micOff : icons.mic}
            <span>${this.isMuted ? 'Вкл. микрофон' : 'Выкл. микрофон'}</span>
          </button>
          <button class="audio-control-btn danger" id="btn-stop-vdo" title="Отключить">
            ${icons.phoneOff}
            <span>Отключить</span>
          </button>
        </div>
      </div>
    `;
  }

  mount() {
    if (this._destroyed) return;

    this._bindDialpadEvents();
    this._bindAudioPanelEvents();

    // If VDO was already started, re-inject iframe
    if (this.vdoStarted) {
      this._injectVdoIframe();
    }
  }

  _bindDialpadEvents() {
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

    document.getElementById('btn-call')?.addEventListener('click', () => {
      if (this.inputNumber) {
        ws.send({ type: 'call', number: this.inputNumber });
      }
    });

    document.getElementById('btn-backspace')?.addEventListener('click', () => {
      this.inputNumber = this.inputNumber.slice(0, -1);
      this._updateDisplay();
    });

    document.getElementById('btn-clear-number')?.addEventListener('click', () => {
      this.inputNumber = '';
      this._updateDisplay();
    });

    document.getElementById('btn-paste')?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        const cleaned = text.replace(/[^0-9+*#]/g, '');
        if (cleaned) {
          this.inputNumber = cleaned;
          this._updateDisplay();
        }
      } catch (e) { /* clipboard denied */ }
    });
  }

  _bindAudioPanelEvents() {
    // Idle state
    document.getElementById('btn-start-vdo')?.addEventListener('click', () => {
      this._startVdo();
    });

    document.getElementById('btn-copy-bridge')?.addEventListener('click', () => {
      const url = document.getElementById('bridge-url')?.textContent;
      if (url) {
        navigator.clipboard.writeText(url);
        const btn = document.getElementById('btn-copy-bridge');
        if (btn) {
          btn.textContent = '✅';
          setTimeout(() => { if (btn) btn.textContent = '📋'; }, 2000);
        }
      }
    });

    // Active state
    document.getElementById('btn-mute-vdo')?.addEventListener('click', () => {
      this.isMuted = !this.isMuted;
      // Send mute command to VDO.ninja iframe
      if (this._vdoIframe) {
        this._vdoIframe.contentWindow.postMessage({ action: 'mic', value: 'toggle' }, '*');
      }
      this._reRenderAudioPanel();
    });

    document.getElementById('btn-stop-vdo')?.addEventListener('click', () => {
      this._stopVdo();
    });
  }

  _startVdo() {
    this.vdoStarted = true;
    this._reRenderAudioPanel();
    this._injectVdoIframe();
  }

  _stopVdo() {
    this.vdoStarted = false;
    this.isMuted = false;
    this._vdoIframe = null;
    this._reRenderAudioPanel();
  }

  _injectVdoIframe() {
    const container = document.getElementById('vdo-iframe-container');
    if (!container) return;

    const device = this.state.device || {};
    const room = device.vdoRoom;
    const password = device.vdoPassword;

    if (!room) {
      console.error('[VDO] No room configured for device');
      return;
    }

    // Build VDO.ninja URL for operator:
    // - &room= join the device's room
    // - &push push our mic audio
    // - &miconly audio only, no video
    // - &proaudio high quality unprocessed audio
    // - &cleanoutput no UI controls overlay
    // - &nopreview don't show self-preview
    // - &autostart auto-connect without clicking
    const vdoUrl = `https://vdo.ninja/?room=${encodeURIComponent(room)}&password=${encodeURIComponent(password)}&push&miconly&proaudio&cleanoutput&nopreview&autostart&label=Оператор`;

    const iframe = document.createElement('iframe');
    iframe.src = vdoUrl;
    iframe.allow = 'camera;microphone;autoplay;display-capture';
    iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:12px;min-height:120px;';
    iframe.id = 'vdo-iframe';

    container.innerHTML = '';
    container.appendChild(iframe);
    this._vdoIframe = iframe;

    // Listen for VDO.ninja events
    this._handleVdoMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (data && data.action) {
        console.log('[VDO] Event:', data.action, data);
        if (data.action === 'joined-room') {
          this._updateVdoStatus(true);
        } else if (data.action === 'disconnected') {
          this._updateVdoStatus(false);
        }
      }
    };
    window.addEventListener('message', this._handleVdoMessage);

    // Update status indicator
    this._updateVdoStatus(true);
  }

  _updateVdoStatus(connected) {
    const el = document.getElementById('vdo-status');
    if (el) {
      el.innerHTML = `
        <span class="dot ${connected ? 'online' : 'offline'}"></span>
        <span>VDO.ninja: <strong>${connected ? 'Подключён' : 'Оффлайн'}</strong></span>
      `;
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

  _reRenderAudioPanel() {
    if (this._destroyed) return;
    const panel = document.getElementById('audio-panel');
    if (panel) {
      panel.innerHTML = this._renderAudioPanel();
      this._bindAudioPanelEvents();
    }
  }

  destroy() {
    this._destroyed = true;
    if (this._handleVdoMessage) {
      window.removeEventListener('message', this._handleVdoMessage);
      this._handleVdoMessage = null;
    }
    this._vdoIframe = null;
  }
}
