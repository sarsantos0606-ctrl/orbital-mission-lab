(function () {
  'use strict';
  const key = 'orbital.theme';
  let theme = 'light';
  try { if (localStorage.getItem(key) === 'dark') theme = 'dark'; } catch { /* Preferences are optional. */ }
  function apply() {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0c1016' : '#f5f7fa';
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      const dark = theme === 'dark';
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
      document.getElementById('theme-label').textContent = dark ? 'Modo claro' : 'Modo escuro';
      document.getElementById('theme-symbol').textContent = dark ? '☀' : '☾';
    }
  }
  apply();
  document.addEventListener('DOMContentLoaded', function () {
    apply();
    document.getElementById('theme-toggle').addEventListener('click', function () {
      theme = theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(key, theme); } catch { /* Theme still works without storage. */ }
      apply();
    });
  });
})();
