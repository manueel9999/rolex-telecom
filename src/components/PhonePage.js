/**
 * Phone Page — 2-column layout: Dialpad | Phone Screen (ws-scrcpy) / Audio (VDO.ninja)
 * Right panel has tabs: Экран (ws-scrcpy iframe) | Аудио (VDO.ninja iframe)
 */

import { icons } from '../utils/icons.js';
import { ws } from '../services/WsService.js';
import { audio } from '../services/AudioService.js';

export class PhonePage {
  constructor({ state }) {
    this.state = state;
    this.inputNumber = '';
    this.activeTab = 'screen'; // 'screen' or 'audio'
    this.scrcpyLoaded = false;
    this.vdoLoaded = false;
    this._destroyed = false;

    // Listen for scrcpy URL updates from server
    this._scrcpyHandler = ws.on('scrcpy_url', (msg) => {
      if (this.state.device) {
        this.state.device.scrcpyUrl = msg.scrcpyUrl;
        this._updateRightPanel();
      }
    });
  }

  render() {
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
              <div class="phone-display">
                <div class="phone-display__number ${this.inputNumber ? 'has-number' : ''}" id="phone-number-display">
                  ${this.inputNumber || 'Введите номер'}
                </div>
                <div class="phone-display__actions" id="display-actions" style="display:${this.inputNumber ? 'flex' : 'none'}">
                  <button class="phone-display__clear" id="btn-clear-number" title="Очистить">✕</button>
                </div>
              </div>

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

              <div class="dialpad-actions">
                <button class="dialpad-action__backspace" id="btn-backspace" title="Удалить">⌫</button>
                <button class="dialpad-action__call" id="btn-call" title="Позвонить">${icons.phone}</button>
                <button class="dialpad-action__paste" id="btn-paste" title="Вставить">📋</button>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Tabbed panel (Screen / Audio) -->
        <div class="conference-panel" id="conference-panel">
          <div class="panel-header panel-header--tabbed">
            <div class="panel-tabs" id="panel-tabs">
              <button class="panel-tab ${this.activeTab === 'screen' ? 'active' : ''}" data-tab="screen">
                📱 Экран
              </button>
              <button class="panel-tab ${this.activeTab === 'audio' ? 'active' : ''}" data-tab="audio">
                🎧 Аудио
              </button>
            </div>
            <span class="panel-header__room" id="panel-status">
              <span class="dot offline"></span>
              <span id="panel-status-text">—</span>
            </span>
          </div>

          <!-- Tab contents -->
          <div class="panel-tab-content" id="tab-content-screen" style="display:${this.activeTab === 'screen' ? 'flex' : 'none'}">
            ${this._renderScreenTab()}
          </div>
          <div class="panel-tab-content" id="tab-content-audio" style="display:${this.activeTab === 'audio' ? 'flex' : 'none'}">
            ${this._renderAudioTab()}
          </div>
        </div>
      </div>
    `;
  }

  // ---- Screen Tab (ws-scrcpy) ----
  _renderScreenTab() {
    const device = this.state.device || {};
    const scrcpyUrl = device.scrcpyUrl;

    if (this.scrcpyLoaded && scrcpyUrl) {
      return `
        <div class="scrcpy-live">
          <div class="scrcpy-iframe-wrap" id="scrcpy-iframe-wrap">
            <!-- iframe injected in mount -->
          </div>
          <div class="scrcpy-footer">
            <button class="audio-control-btn danger" id="btn-stop-scrcpy">
              ✕ <span>Отключить</span>
            </button>
          </div>
        </div>
      `;
    }

    if (scrcpyUrl) {
      return `
        <div class="tab-idle">
          <div class="tab-idle__icon">📱</div>
          <div class="tab-idle__title">Экран телефона</div>
          <div class="tab-idle__hint">ws-scrcpy настроен. Нажмите чтобы подключить экран телефона с тач-управлением.</div>
          <button class="audio-start-btn" id="btn-start-scrcpy">📱 Подключить экран</button>
        </div>
      `;
    }

    return `
      <div class="tab-idle">
        <div class="tab-idle__icon">📱</div>
        <div class="tab-idle__title">Экран телефона</div>
        <div class="tab-idle__hint">
          ws-scrcpy не настроен.<br>
          Запустите на Windows ПК:
        </div>
        <div class="tab-setup-steps">
          <div class="tab-setup-step">
            <span class="tab-setup-step__num">1</span>
            <span>Откройте <code>agent/setup-scrcpy.bat</code></span>
          </div>
          <div class="tab-setup-step">
            <span class="tab-setup-step__num">2</span>
            <span>Подключите телефон по USB</span>
          </div>
          <div class="tab-setup-step">
            <span class="tab-setup-step__num">3</span>
            <span>Экран появится автоматически</span>
          </div>
        </div>
        <div class="tab-manual-url">
          <label class="tab-manual-url__label">Или введите URL ws-scrcpy вручную:</label>
          <div class="tab-manual-url__input-row">
            <input type="text" class="tab-manual-url__input" id="scrcpy-url-input" 
              placeholder="http://localhost:8000" value="">
            <button class="tab-manual-url__btn" id="btn-set-scrcpy-url">→</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---- Audio Tab (VDO.ninja) ----
  _renderAudioTab() {
    const device = this.state.device || {};
    const room = device.vdoRoom || '—';

    if (this.vdoLoaded) {
      return `
        <div class="vdo-live">
          <div class="vdo-iframe-container" id="vdo-iframe-container">
            <!-- injected in mount -->
          </div>
          <div class="vdo-live__footer">
            <button class="audio-control-btn danger" id="btn-stop-vdo">
              ${icons.phoneOff} <span>Отключить</span>
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="tab-idle">
        <div class="tab-idle__icon">🎧</div>
        <div class="tab-idle__title">Аудио связь (VDO.ninja)</div>
        <div class="tab-idle__hint">Подключитесь для двусторонней голосовой связи.</div>
        <div class="tab-idle__room">Комната: <code>${room}</code></div>
        <button class="audio-start-btn" id="btn-start-vdo">🎧 Войти в комнату</button>
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

  mount() {
    if (this._destroyed) return;
    this._bindDialpadEvents();
    this._bindTabEvents();
    this._bindPanelEvents();

    // Re-inject iframes if tabs were already loaded
    if (this.scrcpyLoaded) this._injectScrcpyIframe();
    if (this.vdoLoaded) this._injectVdoIframe();

    this._updateStatus();
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
        this.state.callNumber = this.inputNumber;
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
        if (cleaned) { this.inputNumber = cleaned; this._updateDisplay(); }
      } catch (e) { /* clipboard denied */ }
    });
  }

  _bindTabEvents() {
    document.getElementById('panel-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (!tab) return;
      this.activeTab = tab.dataset.tab;

      // Toggle tab active states
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === this.activeTab));
      // Toggle content visibility
      document.getElementById('tab-content-screen').style.display = this.activeTab === 'screen' ? 'flex' : 'none';
      document.getElementById('tab-content-audio').style.display = this.activeTab === 'audio' ? 'flex' : 'none';
      this._updateStatus();
    });
  }

  _bindPanelEvents() {
    // --- Screen tab ---
    document.getElementById('btn-start-scrcpy')?.addEventListener('click', () => {
      this.scrcpyLoaded = true;
      this._updateRightPanel();
      this._injectScrcpyIframe();
    });

    document.getElementById('btn-stop-scrcpy')?.addEventListener('click', () => {
      this.scrcpyLoaded = false;
      this._updateRightPanel();
    });

    document.getElementById('btn-set-scrcpy-url')?.addEventListener('click', () => {
      const input = document.getElementById('scrcpy-url-input');
      const url = input?.value?.trim();
      if (url) {
        // Save scrcpy URL to server
        fetch(`/api/device/${this.state.device?.id}/scrcpy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scrcpyUrl: url }),
        }).then(() => {
          if (this.state.device) this.state.device.scrcpyUrl = url;
          this._updateRightPanel();
        });
      }
    });

    // Enter key on URL input
    document.getElementById('scrcpy-url-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('btn-set-scrcpy-url')?.click();
      }
    });

    // --- Audio tab ---
    document.getElementById('btn-start-vdo')?.addEventListener('click', () => {
      this.vdoLoaded = true;
      this._updateAudioPanel();
      this._injectVdoIframe();
    });

    document.getElementById('btn-stop-vdo')?.addEventListener('click', () => {
      this.vdoLoaded = false;
      this._updateAudioPanel();
    });

    document.getElementById('btn-copy-bridge')?.addEventListener('click', () => {
      const url = document.getElementById('bridge-url')?.textContent;
      if (url) {
        navigator.clipboard.writeText(url);
        const btn = document.getElementById('btn-copy-bridge');
        if (btn) { btn.textContent = '✅'; setTimeout(() => { if (btn) btn.textContent = '📋'; }, 2000); }
      }
    });
  }

  // ---- Inject iframes ----
  _injectScrcpyIframe() {
    const wrap = document.getElementById('scrcpy-iframe-wrap');
    if (!wrap) return;
    const url = this.state.device?.scrcpyUrl;
    if (!url) return;

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.allow = 'fullscreen';
    iframe.id = 'scrcpy-iframe';
    wrap.innerHTML = '';
    wrap.appendChild(iframe);
    this._updateStatus();
  }

  _injectVdoIframe() {
    const container = document.getElementById('vdo-iframe-container');
    if (!container) return;
    const device = this.state.device || {};
    const room = device.vdoRoom;
    const password = device.vdoPassword;
    if (!room) return;

    const vdoUrl = `https://vdo.ninja/?room=${encodeURIComponent(room)}&password=${encodeURIComponent(password)}&push&miconly&proaudio&label=Operator`;
    const iframe = document.createElement('iframe');
    iframe.src = vdoUrl;
    iframe.allow = 'camera;microphone;autoplay;display-capture';
    iframe.id = 'vdo-iframe';
    container.innerHTML = '';
    container.appendChild(iframe);
    this._updateStatus();
  }

  // ---- Re-render helpers ----
  _updateRightPanel() {
    if (this._destroyed) return;
    const el = document.getElementById('tab-content-screen');
    if (el) {
      el.innerHTML = this._renderScreenTab();
      this._bindPanelEvents();
      if (this.scrcpyLoaded) this._injectScrcpyIframe();
    }
    this._updateStatus();
  }

  _updateAudioPanel() {
    if (this._destroyed) return;
    const el = document.getElementById('tab-content-audio');
    if (el) {
      el.innerHTML = this._renderAudioTab();
      this._bindPanelEvents();
      if (this.vdoLoaded) this._injectVdoIframe();
    }
    this._updateStatus();
  }

  _updateStatus() {
    const el = document.getElementById('panel-status-text');
    if (!el) return;
    const dot = document.querySelector('#panel-status .dot');

    if (this.activeTab === 'screen') {
      if (this.scrcpyLoaded) {
        el.textContent = 'Экран подключён';
        dot?.classList.replace('offline', 'online');
      } else {
        const hasUrl = !!this.state.device?.scrcpyUrl;
        el.textContent = hasUrl ? 'Готов к подключению' : 'Не настроен';
        dot?.classList.replace('online', 'offline');
      }
    } else {
      if (this.vdoLoaded) {
        el.textContent = 'VDO.ninja подключён';
        dot?.classList.replace('offline', 'online');
      } else {
        el.textContent = 'VDO.ninja';
        dot?.classList.replace('online', 'offline');
      }
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

  destroy() {
    this._destroyed = true;
    if (this._scrcpyHandler) {
      this._scrcpyHandler();
      this._scrcpyHandler = null;
    }
  }
}
