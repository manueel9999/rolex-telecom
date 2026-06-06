/**
 * Phone Page — 2-column layout: Phone Screen | VDO.ninja Conference
 * No dialpad needed — user taps directly on the phone screen
 */

import { icons } from '../utils/icons.js';

export class PhonePage {
  constructor({ state }) {
    this.state = state;
  }

  render() {
    const device = this.state.device || {};
    const vdoRoom = device.vdoRoom || 'rolex-device-1';

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

        <!-- RIGHT: VDO.ninja Conference -->
        <div class="conference-panel" id="conference-panel">
          <div class="panel-header">
            <span class="panel-header__title">${icons.headphones} Аудио (VDO.ninja)</span>
            <span class="panel-header__room">
              <span class="dot online"></span>
              Комната: <strong>${vdoRoom}</strong>
            </span>
          </div>
          <div class="conference-iframe-wrapper" id="conference-iframe-wrapper">
            <iframe
              id="vdo-iframe"
              allow="camera;microphone;fullscreen;display-capture;autoplay;"
              src="https://vdo.ninja/?room=${vdoRoom}&push&miconly&cleanoutput&nopreview"
              class="conference-iframe"
            ></iframe>
          </div>
          <div class="conference-hint">
            Нажмите "Start" чтобы подключить микрофон к комнате
          </div>
        </div>
      </div>
    `;
  }

  mount() {
    // Nothing to mount — no dialpad, phone is controlled via screen mirror
  }

  destroy() {
    // cleanup if needed
  }
}
