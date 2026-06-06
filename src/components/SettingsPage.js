/**
 * Settings Page — Device info, VDO.ninja config, audio settings
 */

import { icons } from '../utils/icons.js';

export class SettingsPage {
  constructor({ device, onLogout }) {
    this.device = device || {};
    this.onLogout = onLogout;
  }

  render() {
    return `
      <!-- Device Card -->
      <div class="device-card">
        <div class="device-card__icon">${icons.device}</div>
        <div class="device-card__info">
          <div class="device-card__label">Устройство</div>
          <div class="device-card__id">${this.device.id || '—'}</div>
        </div>
        <div class="device-card__status">
          <span class="dot"></span>
          ${this.device.status === 'online' ? 'Онлайн' : 'Оффлайн'}
        </div>
      </div>

      <!-- Connection Settings -->
      <div class="settings-section">
        <div class="settings-section__title">${icons.wifi} Подключение</div>
        
        <div class="settings-field">
          <label class="settings-field__label">Код устройства</label>
          <div class="settings-field__value">${this.device.id || '—'}</div>
        </div>

        <div class="settings-field">
          <label class="settings-field__label">Имя устройства</label>
          <div class="settings-field__value">${this.device.name || '—'}</div>
        </div>

        <div class="settings-field">
          <label class="settings-field__label">Статус</label>
          <div class="settings-field__value" style="display: flex; align-items: center; gap: 8px;">
            <span class="dot ${this.device.status === 'online' ? 'online' : 'offline'}" style="width:8px;height:8px;border-radius:50%;background:${this.device.status === 'online' ? 'var(--success)' : 'var(--danger)'}"></span>
            ${this.device.status === 'online' ? 'Подключено' : 'Не подключено'}
          </div>
        </div>
      </div>

      <!-- VDO.ninja Settings -->
      <div class="settings-section">
        <div class="settings-section__title">${icons.headphones} VDO.ninja — Аудио</div>

        <div class="settings-field">
          <label class="settings-field__label">Комната</label>
          <input type="text" id="settings-vdo-room" value="${this.device.vdoRoom || ''}" placeholder="Название комнаты" />
        </div>

        <div class="settings-field">
          <label class="settings-field__label">Ссылка для просмотра (View)</label>
          <div class="settings-field__value" style="word-break:break-all; font-size: 12px;">
            https://vdo.ninja/?view&room=${this.device.vdoRoom || 'rolex-device-1'}&novideo
          </div>
        </div>

        <div class="settings-field">
          <label class="settings-field__label">Ссылка для подключения (Push)</label>
          <div class="settings-field__value" style="word-break:break-all; font-size: 12px;">
            https://vdo.ninja/?push&room=${this.device.vdoRoom || 'rolex-device-1'}&miconly
          </div>
        </div>

        <p style="font-size: var(--font-size-sm); color: var(--text-tertiary); margin-top: var(--space-sm);">
          Для работы аудио: на устройстве с телефоном откройте ссылку Push и подключите Bluetooth-микрофон. 
          На этом сайте аудио автоматически встроено в интерфейс набора номера.
        </p>
      </div>

      <!-- Bluetooth Info -->
      <div class="settings-section">
        <div class="settings-section__title">${icons.bluetooth} Bluetooth / Связь с Windows</div>
        
        <p style="font-size: var(--font-size-sm); color: var(--text-secondary); line-height: 1.6;">
          Телефон подключается через приложение <strong>"Связь с Windows"</strong> (Phone Link) по Bluetooth.
          Звук передаётся через VDO.ninja комнату.
          <br><br>
          <strong>Настройка:</strong>
        </p>
        <ol style="font-size: var(--font-size-sm); color: var(--text-secondary); padding-left: 20px; margin-top: 8px; line-height: 1.8;">
          <li>Подключите телефон к Windows через Bluetooth</li>
          <li>Откройте "Связь с Windows" на ПК</li>
          <li>Запустите агент управления на ПК</li>
          <li>Откройте VDO.ninja Push-ссылку на ПК с Bluetooth-микрофоном</li>
          <li>На этом сайте зайдите в комнату для аудио</li>
        </ol>
      </div>

      <!-- Actions -->
      <div style="display: flex; gap: var(--space-md); margin-top: var(--space-md);">
        <button class="btn btn--ghost" id="btn-settings-logout">
          ${icons.logOut} Выйти
        </button>
      </div>
    `;
  }

  mount() {
    document.getElementById('btn-settings-logout')?.addEventListener('click', () => {
      this.onLogout();
    });
  }
}
