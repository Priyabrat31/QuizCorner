/* Shared navigation, data loading, notifications, and Supabase helpers. */
(function () {
  'use strict';

  const cfg = window.QC_CONFIG || {};
  const currentDirectory = new URL('.', window.location.href).pathname;
  const basePath = cfg.BASE_PATH ? (cfg.BASE_PATH.endsWith('/') ? cfg.BASE_PATH : `${cfg.BASE_PATH}/`) : currentDirectory;

  function siteUrl(path = '') {
    const clean = String(path).replace(/^\/+/, '');
    return `${basePath}${clean}`;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function toast(message, type = 'info', duration = 3200) {
    let host = document.getElementById('toast-region');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-region';
      host.className = 'toast-region';
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'true');
      document.body.appendChild(host);
    }
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.textContent = message;
    host.appendChild(item);
    requestAnimationFrame(() => item.classList.add('is-visible'));
    window.setTimeout(() => {
      item.classList.remove('is-visible');
      window.setTimeout(() => item.remove(), 240);
    }, duration);
  }

  function showDialog({ title, message, actions = [] }) {
    const layer = document.createElement('div');
    layer.className = 'modal-backdrop';
    layer.innerHTML = `
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="qc-modal-title">
        <h2 id="qc-modal-title">${escapeHTML(title)}</h2>
        <p>${escapeHTML(message)}</p>
        <div class="modal-actions"></div>
      </section>`;
    const actionsHost = layer.querySelector('.modal-actions');
    actions.forEach((action, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `button ${action.primary ? 'button-primary' : 'button-secondary'}`;
      button.textContent = action.label;
      button.addEventListener('click', () => {
        layer.remove();
        if (typeof action.onClick === 'function') action.onClick();
      });
      actionsHost.appendChild(button);
      if (index === 0) window.setTimeout(() => button.focus(), 0);
    });
    document.body.appendChild(layer);
    return layer;
  }

  function setPageLoading(target, label = 'Loading QuizCorner') {
    if (!target) return;
    target.innerHTML = `<div class="loader-wrap"><div class="brand-loader">QuizCorner</div><p>${escapeHTML(label)}</p></div>`;
  }

  async function readJSON(path) {
    const response = await fetch(siteUrl(path), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Unable to load ${path} (${response.status}).`);
    return response.json();
  }

  async function getCreators() {
    const data = await readJSON('data/creators.json');
    if (!Array.isArray(data.creators)) throw new Error('Creator configuration is invalid.');
    return data.creators;
  }

  async function getCreator(creatorId) {
    const creators = await getCreators();
    return creators.find((creator) => creator.id === creatorId) || null;
  }

  async function getQuiz(creator) {
    if (!creator || !creator.quizFile) throw new Error('Quiz configuration is missing.');
    const quiz = await readJSON(creator.quizFile);
    if (!Array.isArray(quiz.questions) || quiz.questions.length !== 20) {
      throw new Error('This quiz must contain exactly 20 questions.');
    }
    const ids = new Set();
    quiz.questions.forEach((question) => {
      if (!question.id || ids.has(question.id)) throw new Error('Each question must have a unique ID.');
      ids.add(question.id);
      const optionKeys = Object.keys(question.options || {}).sort().join('');
      if (optionKeys !== 'ABCD') throw new Error(`Question ${question.id} must contain options A, B, C and D.`);
    });
    return quiz;
  }

  async function ensureAnonymousSession() {
    if (!window.QC_SUPABASE_READY || !window.QC_SUPABASE) {
      throw new Error('Supabase is not configured yet. Add your project URL and public key in assets/js/config.js.');
    }
    const client = window.QC_SUPABASE;
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user) return sessionData.session;

    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    if (!data.session) throw new Error('Could not create an anonymous browser session.');
    return data.session;
  }

  async function invokeFunction(name, body, requireAnonymousUser = false) {
    if (!window.QC_SUPABASE_READY || !window.QC_SUPABASE) {
      throw new Error('Supabase is not configured.');
    }
    if (requireAnonymousUser) await ensureAnonymousSession();
    const { data, error } = await window.QC_SUPABASE.functions.invoke(name, { body });
    if (error) {
      let message = error.message || 'The server could not complete this request.';
      try {
        const context = error.context;
        if (context && typeof context.json === 'function') {
          const detail = await context.clone().json();
          if (detail?.error) message = detail.error;
        }
      } catch (_) { /* Keep the original message. */ }
      const wrapped = new Error(message);
      wrapped.status = error.context?.status || 0;
      throw wrapped;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function renderHeader() {
    const host = document.getElementById('site-header');
    if (!host) return;
    host.innerHTML = `
      <header class="inner-header">
        <a class="home-link" href="${siteUrl('index.html')}" aria-label="Go to home">
          <span aria-hidden="true">⌂</span><span>Home</span>
        </a>
        <a class="header-wordmark" href="${siteUrl('index.html')}">QuizCorner</a>
      </header>`;
  }

  function renderFooter() {
    const host = document.getElementById('site-footer');
    if (!host) return;
    const contact = `https://wa.me/${cfg.WHATSAPP_NUMBER || '919988776655'}`;
    host.innerHTML = `
      <footer class="site-footer">
        <div class="footer-brand">QuizCorner</div>
        <nav class="footer-links" aria-label="Footer navigation">
          <a href="${siteUrl('index.html')}">Home</a>
          <a href="${siteUrl('users.html')}">Creators</a>
          <a href="${siteUrl('leaderboard.html')}">Leaderboard</a>
          <a href="${siteUrl('history.html')}">Results History</a>
          <a href="${contact}" target="_blank" rel="noopener">WhatsApp Contact</a>
        </nav>
        <p class="footer-credit">Designed &amp; Developed by Priyabrat Mohanty</p>
        <p class="footer-copy">© ${new Date().getFullYear()} QuizCorner</p>
      </footer>`;
  }

  function initShell() {
    renderHeader();
    renderFooter();
    if (window.QC_SUPABASE_READY) {
      window.addEventListener('online', () => toast('Connection restored.', 'success'));
      window.addEventListener('offline', () => toast('You are offline. Your active quiz is saved on this device.', 'warning', 5000));
    }
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatDate(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function normaliseName(name) {
    return String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function getLastStudentName() {
    return localStorage.getItem('qc_student_name') || '';
  }

  function saveLastStudentName(name) {
    localStorage.setItem('qc_student_name', String(name || '').trim());
  }

  window.QC = {
    config: cfg,
    basePath,
    siteUrl,
    escapeHTML,
    toast,
    showDialog,
    setPageLoading,
    readJSON,
    getCreators,
    getCreator,
    getQuiz,
    ensureAnonymousSession,
    invokeFunction,
    initShell,
    formatDuration,
    formatDate,
    normaliseName,
    getLastStudentName,
    saveLastStudentName
  };

  document.addEventListener('DOMContentLoaded', initShell);
})();
