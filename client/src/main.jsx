import React from 'react';
import { createRoot } from 'react-dom/client';
import { installUiSound } from './components/uiSound.js';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider, ThemeProvider, ToastProvider } from './context.jsx';
import '@fontsource-variable/manrope';
import '@fontsource-variable/unbounded';
import './styles.css';

installUiSound();
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            
              <App />
            
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// installable app + faster repeat visits (production only; the dev server must not be cached)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* not supported here */ }); });
}
