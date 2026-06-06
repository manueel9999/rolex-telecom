/**
 * Rolex Telecom — Main Application
 * Web phone interface with VDO.ninja integration
 */

import './style.css';
import { App } from './app/App.js';

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
