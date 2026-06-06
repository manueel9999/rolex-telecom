/**
 * API Service — HTTP calls to backend
 */

const API_BASE = window.location.origin;

class ApiService {
  constructor() {
    this.sessionId = localStorage.getItem('sessionId');
  }

  async request(url, options = {}) {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка сервера');
    }
    return data;
  }

  async login(deviceCode) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ deviceCode }),
    });
    this.sessionId = data.sessionId;
    localStorage.setItem('sessionId', data.sessionId);
    localStorage.setItem('deviceId', data.device.id);
    return data;
  }

  async checkSession() {
    if (!this.sessionId) return null;
    try {
      const data = await this.request(`/api/auth/session/${this.sessionId}`);
      return data;
    } catch {
      this.logout();
      return null;
    }
  }

  async logout() {
    if (this.sessionId) {
      try {
        await this.request('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ sessionId: this.sessionId }),
        });
      } catch { /* ignore */ }
    }
    this.sessionId = null;
    localStorage.removeItem('sessionId');
    localStorage.removeItem('deviceId');
  }

  async getCallHistory(deviceId) {
    return this.request(`/api/calls/${deviceId}`);
  }

  async getDevice(deviceId) {
    return this.request(`/api/device/${deviceId}`);
  }
  
  async updateDevice(deviceId, data) {
    return this.request(`/api/admin/devices/${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiService();
