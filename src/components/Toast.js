/**
 * Toast — notification system
 */

import { icons } from '../utils/icons.js';

export class Toast {
  constructor() {
    this.container = null;
  }

  mount(container) {
    this.container = container;
  }

  show(message, type = 'info', duration = 3000) {
    if (!this.container) {
      this.container = document.getElementById('toast-container');
    }
    if (!this.container) return;

    const iconMap = {
      success: icons.check,
      error: icons.x,
      info: icons.info,
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <span class="toast__icon">${iconMap[type] || iconMap.info}</span>
      <span>${message}</span>
    `;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}
