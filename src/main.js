import '@fortawesome/fontawesome-free/css/all.min.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

let app;
try {
  const target = document.getElementById('app');
  if (!target) {
    throw new Error('Target element #app was not found in document.');
  }
  app = mount(App, { target });
} catch (err) {
  console.error('[Easper] Failed to mount Svelte application:', err);
  const target = document.getElementById('app') || document.body;
  target.innerHTML = `
    <div style="max-width: 680px; margin: 50px auto; padding: 28px; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; border: 1px solid #dc3545; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
      <h2 style="color: #dc3545; margin-top: 0; font-size: 1.4rem;">Application Startup Notice</h2>
      <p style="color: #333; line-height: 1.6; font-size: 0.95rem;">
        EasperWeb encountered an error while initializing the user interface. This is commonly caused by an outdated browser cache or stale service worker.
      </p>
      <pre style="background: #fff5f5; padding: 14px; border-radius: 6px; border: 1px solid #ffd2d2; overflow-x: auto; font-size: 13px; color: #900; line-height: 1.4;">${err?.stack || err?.message || String(err)}</pre>
      <div style="margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button id="btn-purge-reload" style="padding: 10px 20px; background: #0056b3; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.95rem;">
          Clear Cache &amp; Reload Application
        </button>
      </div>
    </div>
  `;
  const purgeBtn = document.getElementById('btn-purge-reload');
  if (purgeBtn) {
    purgeBtn.onclick = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
        }
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.warn(e);
      }
      location.reload(true);
    };
  }
}

export default app;

