/**
 * History Page — Call history list
 */

import { icons } from '../utils/icons.js';
import { api } from '../services/ApiService.js';

export class HistoryPage {
  constructor({ deviceId, onCallNumber }) {
    this.deviceId = deviceId;
    this.onCallNumber = onCallNumber;
    this.calls = [];
    this.filter = 'all'; // all | incoming | outgoing | missed
  }

  render() {
    return `
      <div class="history-page__header">
        <h2 class="page-title">История звонков</h2>
        <div class="filter-tabs" id="history-filters">
          <button class="filter-tab ${this.filter === 'all' ? 'active' : ''}" data-filter="all">Все</button>
          <button class="filter-tab ${this.filter === 'incoming' ? 'active' : ''}" data-filter="incoming">Входящие</button>
          <button class="filter-tab ${this.filter === 'outgoing' ? 'active' : ''}" data-filter="outgoing">Исходящие</button>
          <button class="filter-tab ${this.filter === 'missed' ? 'active' : ''}" data-filter="missed">Пропущенные</button>
        </div>
      </div>

      <div class="history-list" id="history-list">
        ${this.renderCalls()}
      </div>
    `;
  }

  renderCalls() {
    const filtered = this.filter === 'all'
      ? this.calls
      : this.calls.filter(c => c.direction === this.filter);

    if (filtered.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state__icon">${icons.history}</div>
          <div class="empty-state__text">Нет звонков</div>
        </div>
      `;
    }

    return filtered.map(call => {
      const iconType = call.direction === 'incoming' ? 'incoming'
        : call.direction === 'missed' ? 'missed' : 'outgoing';
      const icon = call.direction === 'incoming' ? icons.phoneIncoming
        : call.direction === 'missed' ? icons.phoneMissed : icons.phoneOutgoing;
      const time = this.formatDate(call.timestamp);
      const duration = call.duration ? this.formatDuration(call.duration) : '—';

      return `
        <div class="history-item" data-number="${call.number}">
          <div class="history-item__icon ${iconType}">${icon}</div>
          <div class="history-item__info">
            <div class="history-item__number">${call.number || 'Неизвестный'}</div>
            <div class="history-item__time">${time}</div>
          </div>
          <div class="history-item__duration">${duration}</div>
          <button class="history-item__call-btn" data-call="${call.number}" title="Перезвонить">
            ${icons.phone}
          </button>
        </div>
      `;
    }).join('');
  }

  async mount() {
    // Load call history
    await this.loadHistory();

    // Filter tabs
    document.querySelectorAll('#history-filters .filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.filter;
        document.querySelectorAll('#history-filters .filter-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('history-list').innerHTML = this.renderCalls();
        this.mountCallButtons();
      });
    });

    this.mountCallButtons();
  }

  mountCallButtons() {
    document.querySelectorAll('.history-item__call-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const number = btn.dataset.call;
        if (number) this.onCallNumber(number);
      });
    });

    document.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const number = item.dataset.number;
        if (number) this.onCallNumber(number);
      });
    });
  }

  async loadHistory() {
    if (!this.deviceId) return;
    try {
      const data = await api.getCallHistory(this.deviceId);
      this.calls = data.calls || [];
      const listEl = document.getElementById('history-list');
      if (listEl) {
        listEl.innerHTML = this.renderCalls();
        this.mountCallButtons();
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }

  formatDate(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return 'Только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}с`;
    return `${m}м ${s}с`;
  }
}
