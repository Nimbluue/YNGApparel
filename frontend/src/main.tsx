import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerServiceWorker } from './utils/registerServiceWorker';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemen root #root tidak ditemukan di index.html.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerServiceWorker();
