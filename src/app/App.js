/**
 * Rolex Telecom — Main App Controller
 * Manages screens, state, and routing
 */

import { api } from '../services/ApiService.js';
import { ws } from '../services/WsService.js';
import { audio } from '../services/AudioService.js';
import { icons } from '../utils/icons.js';
import { LoginPage } from '../components/LoginPage.js';
import { PhonePage } from '../components/PhonePage.js';
import { HistoryPage } from '../components/HistoryPage.js';
import { SettingsPage } from '../components/SettingsPage.js';
import { CallScreen } from '../components/CallScreen.js';
import { Toast } from '../components/Toast.js';

export class App {
  constructor() {
    this.state = {
      screen: 'login', // login | phone
      currentPage: 'dialpad', // dialpad | history | settings
      device: null,
      sessionId: null,
      agentOnline: false,
      inCall: false,
      callNumber: '',
      callStatus: '', // ringing | connected | ended
      callTimer: 0,
      inputNumber: '',
      muted: false,
      onHold: false,
    };

    this.callInterval = null;
    this.toast = new Toast();
  }

  async init() {
    // Check existing session
    const session = await api.checkSession();
    if (session && session.success) {
      this.state.sessionId = api.sessionId;
      this.state.device = session.device;
      this.state.screen = 'phone';
      this.connectWebSocket();
    }

    this.render();
  }

  connectWebSocket() {
    ws.connect(this.state.sessionId);

    ws.on('connected', (msg) => {
      this.state.device = msg.device;
      this.render();
    });

    ws.on('connection', (msg) => {
      if (msg.connected) {
        this.toast.show('Подключено к серверу', 'success');
      } else {
        this.toast.show('Соединение потеряно...', 'error');
      }
    });

    ws.on('agent_status', (msg) => {
      this.state.agentOnline = msg.online;
      this.renderHeader();
      if (msg.online) {
        this.toast.show('📱 Устройство онлайн', 'success');
      } else {
        this.toast.show('📱 Устройство оффлайн', 'error');
      }
    });

    ws.on('call_status', (msg) => {
      this.handleCallStatus(msg);
    });

    ws.on('incoming_call', (msg) => {
      this.handleIncomingCall(msg);
    });

    ws.on('phone_status', (msg) => {
      // Update phone status indicators
      this.renderHeader();
    });
  }

  handleCallStatus(msg) {
    switch (msg.status) {
      case 'ringing':
        this.state.callStatus = 'ringing';
        this.state.inCall = true;
        audio.startRingback(); // длинные гудки
        this.showCallScreen();
        break;
      case 'connected':
        audio.stopAllTones();
        audio.playConnected(); // бип соединения
        this.state.callStatus = 'connected';
        this.startCallTimer();
        this.renderCallScreen();
        break;
      case 'busy':
        audio.stopAllTones();
        audio.startBusy(); // короткие гудки — занято
        this.state.callStatus = 'busy';
        this.renderCallScreen();
        // Авто-завершение через 5с
        setTimeout(() => this.endCall(), 5000);
        break;
      case 'ended':
        this.endCall();
        break;
    }
  }

  handleIncomingCall(msg) {
    this.state.callNumber = msg.number || 'Неизвестный';
    this.state.callStatus = 'incoming';
    this.state.inCall = true;
    audio.startIncomingRing(); // звонок входящего
    this.showCallScreen();
  }

  startCallTimer() {
    this.state.callTimer = 0;
    clearInterval(this.callInterval);
    this.callInterval = setInterval(() => {
      this.state.callTimer++;
      const timerEl = document.getElementById('call-timer');
      if (timerEl) {
        timerEl.textContent = this.formatTime(this.state.callTimer);
      }
    }, 1000);
  }

  endCall() {
    this.state.inCall = false;
    this.state.callStatus = '';
    this.state.muted = false;
    this.state.onHold = false;
    clearInterval(this.callInterval);

    // Остановить все гудки и сыграть конец звонка
    audio.stopAllTones();
    audio.playCallEnd();

    const callScreen = document.querySelector('.call-screen');
    if (callScreen) {
      callScreen.classList.remove('active');
    }
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ============================================
  // RENDER
  // ============================================
  render() {
    const app = document.getElementById('app');

    if (this.state.screen === 'login') {
      const loginPage = new LoginPage({
        onLogin: async (code) => {
          try {
            const data = await api.login(code);
            this.state.sessionId = data.sessionId;
            this.state.device = data.device;
            this.state.screen = 'phone';
            this.connectWebSocket();
            this.render();
          } catch (e) {
            throw e;
          }
        }
      });
      app.innerHTML = loginPage.render();
      loginPage.mount();
      return;
    }

    // Phone interface
    app.innerHTML = this.renderPhoneInterface();
    this.mountPhoneInterface();
  }

  renderPhoneInterface() {
    const device = this.state.device || {};

    return `
      <!-- Sidebar -->
      <nav class="sidebar" id="sidebar">
        <div class="sidebar__logo">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
            <defs>
              <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#d4a853"/>
                <stop offset="100%" style="stop-color:#b8860b"/>
              </linearGradient>
            </defs>
            <circle cx="24" cy="24" r="22" fill="url(#g)" opacity="0.15"/>
            <circle cx="24" cy="24" r="22" fill="none" stroke="url(#g)" stroke-width="2"/>
            <path d="M16 14 C16 14 14 14 14 16 L14 20 C14 28 20 34 28 34 L32 34 C34 34 34 32 34 32 L34 28 C34 28 34 26 32 26 L28 26 C28 26 26 26 26 28 L26 28 C24 28 20 24 20 22 L20 22 C22 22 22 20 22 20 L22 16 C22 14 20 14 20 14 Z" fill="url(#g)"/>
          </svg>
        </div>
        <div class="sidebar__nav">
          <button class="sidebar__btn active" data-page="dialpad" title="Клавиатура" id="nav-dialpad">
            ${icons.dialpad}
          </button>
          <button class="sidebar__btn" data-page="history" title="История" id="nav-history">
            ${icons.history}
          </button>
          <button class="sidebar__btn" data-page="settings" title="Настройки" id="nav-settings">
            ${icons.settings}
          </button>
        </div>
        <div class="sidebar__footer">
          <button class="sidebar__btn" id="btn-logout" title="Выйти">
            ${icons.logOut}
          </button>
          <div class="sidebar__avatar" title="${device.name || 'Device'}">
            ${(device.name || 'D')[0]}
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="main-content">
        <!-- Header -->
        <header class="header" id="header">
          <div class="header__title">
            <span class="brand">Rolex</span> Telecom
          </div>
          <div class="header__actions">
            <div class="header__status" id="agent-status">
              <span class="dot ${this.state.agentOnline ? 'online' : 'offline'}"></span>
              <span>${this.state.agentOnline ? 'Онлайн' : 'Оффлайн'}</span>
            </div>
            <div class="header__device-id" title="Код устройства">${device.id || '—'}</div>
          </div>
        </header>

        <!-- Pages -->
        <div class="pages-container" id="pages-container">
          <div class="page dialpad-page active" id="page-dialpad"></div>
          <div class="page history-page" id="page-history"></div>
          <div class="page settings-page" id="page-settings"></div>
        </div>
      </main>

      <!-- Mobile bottom nav -->
      <nav class="mobile-nav" id="mobile-nav">
        <button class="sidebar__btn active" data-page="dialpad">
          ${icons.dialpad}
        </button>
        <button class="sidebar__btn" data-page="history">
          ${icons.history}
        </button>
        <button class="sidebar__btn" data-page="settings">
          ${icons.settings}
        </button>
      </nav>

      <!-- Call Screen Overlay -->
      <div class="call-screen" id="call-screen"></div>

      <!-- Toast Container -->
      <div class="toast-container" id="toast-container"></div>
    `;
  }

  mountPhoneInterface() {
    // Initialize pages
    this.phonePage = new PhonePage({
      state: this.state,
    });

    this.historyPage = new HistoryPage({
      deviceId: this.state.device?.id,
      onCallNumber: (number) => {
        this.state.inputNumber = number;
        this.switchPage('dialpad');
      },
    });

    this.settingsPage = new SettingsPage({
      device: this.state.device,
      onLogout: () => this.logout(),
    });

    this.callScreen = new CallScreen({
      onHangup: () => {
        ws.hangup();
        this.endCall(); // endCall уже вызывает stopAllTones + playCallEnd
      },
      onAnswer: () => {
        ws.answer();
        audio.stopAllTones(); // стоп звонок
        audio.playConnected(); // бип соединения
        this.state.callStatus = 'connected';
        this.startCallTimer();
        this.renderCallScreen();
      },
      onMute: () => {
        this.state.muted = !this.state.muted;
        ws.mute(this.state.muted);
        this.renderCallScreen();
      },
      onHold: () => {
        this.state.onHold = !this.state.onHold;
        ws.hold(this.state.onHold);
        this.renderCallScreen();
      },
      onDTMF: (key) => {
        audio.playDTMF(key);
        ws.dtmf(key);
      },
      onSpeaker: () => {
        ws.speaker(true);
      },
    });

    // Render initial page
    this.renderPage('dialpad');

    // Navigation
    document.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchPage(btn.dataset.page);
      });
    });

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      this.logout();
    });

    // Mount toast
    this.toast.mount(document.getElementById('toast-container'));
  }

  switchPage(page) {
    this.state.currentPage = page;

    // Update nav active states
    document.querySelectorAll('[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });

    // Update page visibility
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.add('active');
    }

    this.renderPage(page);
  }

  renderPage(page) {
    const container = document.getElementById(`page-${page}`);
    if (!container) return;

    switch (page) {
      case 'dialpad':
        container.innerHTML = this.phonePage.render();
        this.phonePage.mount();
        break;
      case 'history':
        container.innerHTML = this.historyPage.render();
        this.historyPage.mount();
        break;
      case 'settings':
        container.innerHTML = this.settingsPage.render();
        this.settingsPage.mount();
        break;
    }
  }

  renderHeader() {
    const statusEl = document.getElementById('agent-status');
    if (statusEl) {
      statusEl.innerHTML = `
        <span class="dot ${this.state.agentOnline ? 'online' : 'offline'}"></span>
        <span>${this.state.agentOnline ? 'Онлайн' : 'Оффлайн'}</span>
      `;
    }
  }

  showCallScreen() {
    const el = document.getElementById('call-screen');
    if (el) {
      el.innerHTML = this.callScreen.render(this.state);
      el.classList.add('active');
      this.callScreen.mount();
    }
  }

  renderCallScreen() {
    const el = document.getElementById('call-screen');
    if (el && el.classList.contains('active')) {
      el.innerHTML = this.callScreen.render(this.state);
      this.callScreen.mount();
    }
  }

  async logout() {
    ws.disconnect();
    await api.logout();
    this.state = {
      screen: 'login',
      currentPage: 'dialpad',
      device: null,
      sessionId: null,
      agentOnline: false,
      inCall: false,
      callNumber: '',
      callStatus: '',
      callTimer: 0,
      inputNumber: '',
      muted: false,
      onHold: false,
    };
    this.render();
  }
}
