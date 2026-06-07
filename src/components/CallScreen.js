/**
 * Call Screen — Active call overlay with controls
 */

import { icons } from '../utils/icons.js';

export class CallScreen {
  constructor({ onHangup, onAnswer, onMute, onHold, onDTMF, onSpeaker }) {
    this.onHangup = onHangup;
    this.onAnswer = onAnswer;
    this.onMute = onMute;
    this.onHold = onHold;
    this.onDTMF = onDTMF;
    this.onSpeaker = onSpeaker;
    this._keypadOpen = false;
  }

  render(state) {
    const { callNumber, callStatus, callTimer, muted, onHold } = state;
    const initial = (callNumber || '?')[0].toUpperCase();

    const isIncoming = callStatus === 'incoming';
    const isConnected = callStatus === 'connected';
    const isCalling = callStatus === 'calling' || callStatus === 'ringing';

    const statusText = isIncoming ? 'Входящий звонок...'
      : isCalling ? 'Вызов...'
      : isConnected ? '' : 'Соединение...';

    const formatTime = (seconds) => {
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = (seconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    };

    return `
      <div class="call-screen__bg"></div>
      <div class="call-screen__content">
        <div class="call-screen__avatar ${isCalling || isIncoming ? 'ringing' : ''}">
          ${initial}
        </div>

        <div class="call-screen__info">
          <div class="call-screen__number">${callNumber || 'Неизвестный'}</div>
          <div class="call-screen__status">${statusText}</div>
        </div>

        ${isConnected ? `
          <div class="call-screen__timer" id="call-timer">${formatTime(callTimer)}</div>

          <div class="audio-visualizer active" id="audio-viz">
            <div class="audio-visualizer__bar"></div>
            <div class="audio-visualizer__bar"></div>
            <div class="audio-visualizer__bar"></div>
            <div class="audio-visualizer__bar"></div>
            <div class="audio-visualizer__bar"></div>
          </div>
        ` : ''}

        ${isConnected ? `
          <div class="call-screen__controls">
            <div class="call-control">
              <button class="call-control__btn ${muted ? 'active' : ''}" id="btn-mute" title="Микрофон">
                ${muted ? icons.micOff : icons.mic}
              </button>
              <span class="call-control__label">${muted ? 'Вкл. микро' : 'Выкл. микро'}</span>
            </div>
            <div class="call-control">
              <button class="call-control__btn ${onHold ? 'active' : ''}" id="btn-hold" title="Удержание">
                ${icons.pause}
              </button>
              <span class="call-control__label">${onHold ? 'Снять' : 'Удержание'}</span>
            </div>
            <div class="call-control">
              <button class="call-control__btn" id="btn-speaker" title="Динамик">
                ${icons.volume}
              </button>
              <span class="call-control__label">Динамик</span>
            </div>
            <div class="call-control">
              <button class="call-control__btn ${this._keypadOpen ? 'active' : ''}" id="btn-keypad" title="Клавиатура">
                ${icons.dialpad}
              </button>
              <span class="call-control__label">Клавиши</span>
            </div>
          </div>

          <!-- In-call DTMF keypad -->
          <div class="call-screen__keypad ${this._keypadOpen ? 'open' : ''}" id="call-keypad">
            <div class="call-keypad__grid">
              <button class="call-keypad__key" data-dtmf="1">1</button>
              <button class="call-keypad__key" data-dtmf="2">2</button>
              <button class="call-keypad__key" data-dtmf="3">3</button>
              <button class="call-keypad__key" data-dtmf="4">4</button>
              <button class="call-keypad__key" data-dtmf="5">5</button>
              <button class="call-keypad__key" data-dtmf="6">6</button>
              <button class="call-keypad__key" data-dtmf="7">7</button>
              <button class="call-keypad__key" data-dtmf="8">8</button>
              <button class="call-keypad__key" data-dtmf="9">9</button>
              <button class="call-keypad__key" data-dtmf="*">✱</button>
              <button class="call-keypad__key" data-dtmf="0">0</button>
              <button class="call-keypad__key" data-dtmf="#">#</button>
            </div>
          </div>
        ` : ''}

        <div class="call-screen__bottom-actions">
          ${isIncoming ? `
            <div class="call-actions">
              <button class="call-btn call-btn--red" id="btn-reject" title="Отклонить">
                ${icons.phoneOff}
              </button>
              <button class="call-btn call-btn--green" id="btn-answer" title="Ответить">
                ${icons.phone}
              </button>
            </div>
          ` : `
            <button class="call-btn call-btn--red call-screen__end-btn" id="btn-hangup" title="Завершить">
              ${icons.phoneOff}
            </button>
          `}
        </div>
      </div>
    `;
  }

  mount() {
    document.getElementById('btn-hangup')?.addEventListener('click', this.onHangup);
    document.getElementById('btn-reject')?.addEventListener('click', this.onHangup);
    document.getElementById('btn-answer')?.addEventListener('click', this.onAnswer);
    document.getElementById('btn-mute')?.addEventListener('click', this.onMute);
    document.getElementById('btn-hold')?.addEventListener('click', this.onHold);
    document.getElementById('btn-speaker')?.addEventListener('click', this.onSpeaker);

    // Toggle DTMF keypad
    document.getElementById('btn-keypad')?.addEventListener('click', () => {
      this._keypadOpen = !this._keypadOpen;
      const keypad = document.getElementById('call-keypad');
      const btn = document.getElementById('btn-keypad');
      if (keypad) keypad.classList.toggle('open', this._keypadOpen);
      if (btn) btn.classList.toggle('active', this._keypadOpen);
    });

    // DTMF keys — each key sends the correct tone
    document.querySelectorAll('[data-dtmf]').forEach(key => {
      key.addEventListener('click', () => {
        const dtmfKey = key.dataset.dtmf;
        if (dtmfKey && this.onDTMF) {
          this.onDTMF(dtmfKey);
          // Visual feedback
          key.style.background = 'rgba(212, 168, 83, 0.3)';
          setTimeout(() => { key.style.background = ''; }, 150);
        }
      });
    });
  }
}
