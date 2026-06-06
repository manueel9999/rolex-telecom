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
              <button class="call-control__btn" id="btn-keypad" title="Клавиатура">
                ${icons.dialpad}
              </button>
              <span class="call-control__label">Клавиши</span>
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

    // DTMF keypad in-call (TODO: expand this into a mini-dialpad overlay)
    document.getElementById('btn-keypad')?.addEventListener('click', () => {
      // For now just send a tone
      this.onDTMF?.('1');
    });
  }
}
