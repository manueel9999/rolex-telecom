/**
 * Login Page — Device code authentication
 */

import { icons } from '../utils/icons.js';

export class LoginPage {
  constructor({ onLogin }) {
    this.onLogin = onLogin;
  }

  render() {
    return `
      <div class="login-page">
        <div class="login-bg">
          <div class="login-bg__circle login-bg__circle--1"></div>
          <div class="login-bg__circle login-bg__circle--2"></div>
          <div class="login-bg__circle login-bg__circle--3"></div>
        </div>

        <div class="login-card" id="login-card">
          <div class="login-card__logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="72" height="72">
              <defs>
                <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#d4a853"/>
                  <stop offset="100%" style="stop-color:#b8860b"/>
                </linearGradient>
              </defs>
              <circle cx="24" cy="24" r="22" fill="url(#lg)" opacity="0.15"/>
              <circle cx="24" cy="24" r="22" fill="none" stroke="url(#lg)" stroke-width="1.5"/>
              <path d="M16 14 C16 14 14 14 14 16 L14 20 C14 28 20 34 28 34 L32 34 C34 34 34 32 34 32 L34 28 C34 28 34 26 32 26 L28 26 C28 26 26 26 26 28 L26 28 C24 28 20 24 20 22 L20 22 C22 22 22 20 22 20 L22 16 C22 14 20 14 20 14 Z" fill="url(#lg)"/>
            </svg>
          </div>

          <h1 class="login-card__title">
            <span class="login-card__brand">Rolex</span> Telecom
          </h1>
          <p class="login-card__subtitle">Введите код устройства для подключения</p>

          <form class="login-form" id="login-form">
            <div class="login-form__field">
              <div class="login-form__icon">${icons.device}</div>
              <input
                type="text"
                id="login-device-code"
                class="login-form__input"
                placeholder="Код устройства"
                autocomplete="off"
                spellcheck="false"
                autofocus
              />
            </div>
            <div class="login-form__error" id="login-error"></div>
            <button type="submit" class="login-form__btn" id="login-btn">
              <span class="login-form__btn-text">Подключиться</span>
              <span class="login-form__btn-loader" id="login-loader"></span>
            </button>
          </form>

          <div class="login-card__footer">
            <span class="login-card__secure">${icons.wifi} Защищённое соединение</span>
          </div>
        </div>
      </div>
    `;
  }

  mount() {
    const form = document.getElementById('login-form');
    const input = document.getElementById('login-device-code');
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    const loader = document.getElementById('login-loader');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value.trim();

      if (!code) {
        errorEl.textContent = 'Введите код устройства';
        input.classList.add('error');
        return;
      }

      // Loading state
      btn.disabled = true;
      btn.classList.add('loading');
      errorEl.textContent = '';
      input.classList.remove('error');

      try {
        await this.onLogin(code);
      } catch (err) {
        errorEl.textContent = err.message || 'Ошибка подключения';
        input.classList.add('error');
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });

    input?.addEventListener('input', () => {
      input.classList.remove('error');
      errorEl.textContent = '';
    });

    // Focus input
    setTimeout(() => input?.focus(), 100);
  }
}
