// ck-page.js — CK.Lib Unified Page Harness
// Auto-detects kernel from /ontology.yaml, connects NATS, renders chrome.
//
// Usage (the absolute minimum inline HTML):
//   <script type="module">
//   import { CKPage } from '/ck.lib/ck-page.js';
//   await CKPage.init();
//   </script>

import { CKClient } from './ck-client.js';
import { CKBus } from './ck-bus.js';
import { CKStore } from './ck-store.js';
import { cssVars } from './ck-kernel.js';

const ROLE_ANON = 'anonymous';
const ROLE_USER = 'user';
const ROLE_OWNER = 'owner';

export class CKPage {

  static async init(config = {}) {
    const ontology = await CKPage._fetchOntology(config.ontologyUrl || '/ontology.yaml');
    const kernel = config.kernel || ontology?.name || CKPage._kernelFromHostname();

    const ck = new CKClient({ kernel });
    const bus = new CKBus();
    const store = new CKStore(kernel);

    const page = new CKPage();
    page.ck = ck;
    page.bus = bus;
    page.store = store;
    page.ontology = ontology;
    page.kernel = kernel;
    page.role = ROLE_ANON;
    page._logs = [];
    page._adminVisible = false;
    page._edgeOverlays = {};
    page._holdTimers = {};

    page._render();
    page._wireNATS();

    try {
      await ck.connect();
      page._log(`connected to ${ck.config.wssEndpoint}`);
    } catch (e) {
      page._log(`connection error: ${e.message}`);
    }

    await page._loadKernelJS(config.kernelJs);

    window.__ckpage = page;
    return page;
  }

  // ── Utility ─────────────────────────────────────────────

  static _edgeSlug(edgeName) {
    const parts = edgeName.split('.');
    return (parts.length > 1 ? parts.slice(1) : parts).join('').toLowerCase();
  }

  // ── Ontology ──────────────────────────────────────────────

  static async _fetchOntology(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      return CKPage._parseOntology(text);
    } catch { return null; }
  }

  static _parseOntology(text) {
    const get = (re) => { const m = text.match(re); return m?.[1]?.trim().replace(/^["']|["']$/g, '') || ''; };
    const edges = [];
    for (const m of text.matchAll(/target_kernel:\s*"?(.+?)"?\s*$/gm)) edges.push(m[1].trim());
    const topics = {};
    for (const key of ['input', 'result', 'event', 'admin']) {
      const m = text.match(new RegExp(`${key}_topic:\\s*"?(.+?)"?\\s*$`, 'm'));
      if (m) topics[key] = m[1].trim();
    }
    return {
      raw: text,
      name: get(/^\s*name:\s*(.+)$/m),
      urn: get(/^\s*urn:\s*(.+)$/m),
      version: get(/^\s*version:\s*(.+)$/m),
      type: get(/^\s*type:\s*(.+)$/m),
      description: get(/^\s*description:\s*(.+)$/m),
      subdomain: get(/^\s*subdomain:\s*(.+)$/m),
      governance: get(/^\s*governance_mode:\s*(.+)$/m),
      edges,
      topics,
    };
  }

  static _kernelFromHostname() {
    const h = location.hostname.split('.')[0];
    return h.charAt(0).toUpperCase() + h.slice(1);
  }

  // ── Render ────────────────────────────────────────────────

  _render() {
    document.title = this.ontology?.subdomain || this.kernel;
    document.body.innerHTML = '';
    this._injectStyles();

    // Top nav
    const nav = document.createElement('nav');
    nav.id = 'ck-nav';
    nav.innerHTML = `
      <span class="ck-logo" id="ck-logo">${this.ontology?.subdomain || this.kernel}
        <span class="ck-version">${this.ontology?.version || ''}</span>
      </span>
      <div class="ck-nav-icons" id="ck-nav-icons"></div>
      <div class="ck-nav-right">
        <span class="ck-dot" id="ck-dot"></span>
        <span class="ck-user-label" id="ck-user-label">anonymous</span>
        <button class="ck-nav-btn" id="ck-auth-btn" title="Login">LOGIN</button>
      </div>
    `;
    document.body.appendChild(nav);

    // Admin panel (left sidebar — NATS, log, edge overlays)
    const admin = document.createElement('div');
    admin.id = 'ck-admin';
    admin.className = 'ck-admin';
    admin.innerHTML = `
      <div class="ck-admin-section">
        <div class="ck-admin-header" data-section="topics">
          <span>NATS</span><span class="ck-toggle-indicator">-</span>
        </div>
        <div class="ck-admin-body" id="ck-admin-topics"></div>
      </div>
      <div class="ck-admin-section">
        <div class="ck-admin-header" data-section="log">
          <span>LOG</span><span class="ck-toggle-indicator">-</span>
        </div>
        <div class="ck-admin-body ck-log" id="ck-admin-log"></div>
      </div>
    `;
    document.body.appendChild(admin);

    // Main content area
    const main = document.createElement('div');
    main.id = 'ck-main';
    main.className = 'with-admin';
    document.body.appendChild(main);

    this._adminVisible = true;

    // Wire collapsible sections
    admin.querySelectorAll('.ck-admin-header').forEach(h => {
      h.onclick = () => {
        const body = h.nextElementSibling;
        body.classList.toggle('collapsed');
        h.classList.toggle('collapsed');
      };
    });

    this._renderTopics();
    this._renderNavIcons();
    this._wireAuthButton();
  }

  // ── Admin Panel ────────────────────────────────────────────

  _toggleAdmin() {
    this._adminVisible = !this._adminVisible;
    const panel = document.getElementById('ck-admin');
    const main = document.getElementById('ck-main');
    panel.classList.toggle('hidden', !this._adminVisible);
    main.classList.toggle('with-admin', this._adminVisible);
  }

  _renderTopics() {
    const el = document.getElementById('ck-admin-topics');
    if (!el || !this.ontology?.topics) return;
    el.innerHTML = '';
    for (const [dir, topic] of Object.entries(this.ontology.topics)) {
      if (!topic) continue;
      const row = document.createElement('div');
      row.className = 'ck-topic-row';
      row.innerHTML = `<span class="ck-topic-dir">${dir}</span><span class="ck-topic-name">${topic}</span>`;
      el.appendChild(row);
    }
  }

  // ── Nav Icons ──────────────────────────────────────────────

  _renderNavIcons() {
    const container = document.getElementById('ck-nav-icons');
    if (!container || !this.ontology?.edges) return;
    container.innerHTML = '';
    for (const edge of this.ontology.edges) {
      const slug = CKPage._edgeSlug(edge);

      const el = document.createElement('div');
      el.className = 'ck-nav-icon';
      el.dataset.edge = edge;
      el.dataset.slug = slug;
      el.title = `${edge} (click=toggle, hold 3s=disable)`;
      el.innerHTML = '<span class="material-symbols-outlined">hub</span>';

      // Click = show/hide overlay
      el.addEventListener('click', () => {
        const state = this._edgeOverlays[edge];
        if (state && !state.enabled) return;
        if (state?.visible) {
          this._hideEdgeOverlay(edge);
          el.classList.remove('active');
        } else {
          this._showEdgeOverlay(edge, slug);
          el.classList.add('active');
        }
      });

      // 3s hold = enable/disable
      el.addEventListener('pointerdown', () => {
        this._holdTimers[edge] = setTimeout(() => {
          this._holdTimers[edge] = null;
          const state = this._edgeOverlays[edge] || { enabled: true, visible: false };
          state.enabled = !state.enabled;
          this._edgeOverlays[edge] = state;
          if (!state.enabled) {
            el.classList.add('ck-disabled');
            el.classList.remove('active');
            this._hideEdgeOverlay(edge);
            this._log(`disabled: ${edge}`);
          } else {
            el.classList.remove('ck-disabled');
            this._log(`enabled: ${edge}`);
          }
        }, 3000);
      });
      el.addEventListener('pointerup', () => {
        if (this._holdTimers[edge]) { clearTimeout(this._holdTimers[edge]); this._holdTimers[edge] = null; }
      });
      el.addEventListener('pointerleave', () => {
        if (this._holdTimers[edge]) { clearTimeout(this._holdTimers[edge]); this._holdTimers[edge] = null; }
      });

      container.appendChild(el);
    }
  }

  // ── Edge Overlays ──────────────────────────────────────────

  async _showEdgeOverlay(edge, slug) {
    const state = this._edgeOverlays[edge] || { enabled: true, visible: false, mod: null, ontology: null };
    this._edgeOverlays[edge] = state;

    if (!this._adminVisible) this._toggleAdmin();

    let section = document.getElementById(`ck-edge-${slug}`);
    if (!section) {
      section = document.createElement('div');
      section.id = `ck-edge-${slug}`;
      section.className = 'ck-admin-section ck-edge-section';
      section.innerHTML = `
        <div class="ck-admin-header">
          <span>${edge.split('.').pop().toUpperCase()}</span>
          <span class="ck-toggle-indicator">-</span>
        </div>
        <div class="ck-admin-body" id="ck-edge-body-${slug}">loading...</div>
      `;
      // Wire collapse
      const header = section.querySelector('.ck-admin-header');
      header.onclick = () => {
        const body = header.nextElementSibling;
        body.classList.toggle('collapsed');
        header.classList.toggle('collapsed');
      };
      document.getElementById('ck-admin').appendChild(section);

      const body = document.getElementById(`ck-edge-body-${slug}`);
      // Resolve overlay base: try subfolder (consensus.services) then /ck/ (legacy)
      let overlayBase = `/${slug}`;
      try {
        let htmlRes = await fetch(`${overlayBase}/overlay.html`).catch(() => null);
        if (!htmlRes?.ok) {
          overlayBase = `/ck/${slug}`;
          htmlRes = await fetch(`${overlayBase}/overlay.html`).catch(() => null);
        }
        if (htmlRes?.ok) body.innerHTML = await htmlRes.text();
        else body.innerHTML = `<div class="ck-muted">no overlay</div>`;
      } catch { body.innerHTML = `<div class="ck-muted">overlay not available</div>`; }

      try {
        const mod = await import(`${overlayBase}/overlay.js`);
        state.mod = mod;
        if (typeof mod.setup === 'function') mod.setup(this);
      } catch { /* no overlay.js */ }

      try {
        const res = await fetch(`${overlayBase}/ontology.yaml`);
        if (res.ok) {
          state.ontology = CKPage._parseOntology(await res.text());
          this._log(`edge loaded: ${edge}`);
        }
      } catch {}
    }

    section.style.display = '';
    state.visible = true;
  }

  _hideEdgeOverlay(edge) {
    const slug = CKPage._edgeSlug(edge);
    const section = document.getElementById(`ck-edge-${slug}`);
    if (section) section.style.display = 'none';
    const state = this._edgeOverlays[edge];
    if (state) state.visible = false;
  }

  // ── NATS ──────────────────────────────────────────────────

  _wireNATS() {
    this.ck.on('status', (s) => {
      const dot = document.getElementById('ck-dot');
      if (dot) dot.className = 'ck-dot' + (s.connection === 'connected' ? ' connected' : '');
      this._updateAuthUI();
    });

    this.ck.on('result', (msg) => {
      this._log(`result: ${JSON.stringify(msg.data).substring(0, 80)}`);
      this.bus.emit('ck.result', msg);
    });

    this.ck.on('event', (msg) => {
      this._log(`event: ${JSON.stringify(msg.data).substring(0, 80)}`);
      this.bus.emit('ck.event', msg);
    });
  }

  // ── Auth ──────────────────────────────────────────────────

  _wireAuthButton() {
    const btn = document.getElementById('ck-auth-btn');
    if (!btn) return;

    // Check for existing token
    const stored = localStorage.getItem('ck_token');
    if (stored) {
      const claims = this.ck._parseJwt(stored);
      if (claims && claims.exp * 1000 > Date.now()) {
        this.ck.auth = {
          anonymous: false,
          userId: claims.preferred_username || claims.sub,
          token: stored,
          refreshToken: localStorage.getItem('ck_refresh'),
          expiresAt: new Date(claims.exp * 1000),
          claims,
        };
        this.role = ROLE_USER;
        this._updateAuthUI();
        this.ck._emitStatus();
      }
    }

    btn.addEventListener('click', () => {
      if (this.ck.isAnonymous) {
        this._showLoginModal();
      } else {
        this._doLogout();
      }
    });

    // Username click → open profile edge overlay (if available)
    const userLabel = document.getElementById('ck-user-label');
    if (userLabel) {
      userLabel.addEventListener('click', () => {
        if (this.ck.isAnonymous) { this._showLoginModal(); return; }
        // Find and toggle the profile/signup edge overlay
        const profileEdge = (this.ontology?.edges || []).find(e =>
          e.toLowerCase().includes('profile') || e.toLowerCase().includes('signup'));
        if (profileEdge) {
          const slug = CKPage._edgeSlug(profileEdge);
          const state = this._edgeOverlays[profileEdge];
          if (state?.visible) {
            this._hideEdgeOverlay(profileEdge);
          } else {
            this._showEdgeOverlay(profileEdge, slug);
          }
        } else {
          // No profile edge — redirect to /profile/
          window.location.href = '/profile/';
        }
      });
    }
  }

  _updateAuthUI() {
    const btn = document.getElementById('ck-auth-btn');
    const label = document.getElementById('ck-user-label');
    const dot = document.getElementById('ck-dot');
    if (!btn) return;

    if (this.ck.isAnonymous) {
      btn.textContent = 'LOGIN';
      btn.className = 'ck-nav-btn';
      if (label) { label.textContent = 'anonymous'; label.classList.remove('authenticated'); }
    } else {
      btn.textContent = 'LOGOUT';
      btn.className = 'ck-nav-btn ck-nav-btn-active';
      if (label) { label.textContent = this.ck.userId; label.classList.add('authenticated'); }
    }
  }

  _showLoginModal() {
    // Remove existing
    const existing = document.getElementById('ck-login-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'ck-login-modal';
    modal.innerHTML = `
      <div class="ck-modal-backdrop" id="ck-modal-backdrop"></div>
      <div class="ck-modal-content">
        <div class="ck-modal-title">SIGN IN</div>
        <input type="text" id="ck-login-user" placeholder="Username" autocomplete="username" />
        <input type="password" id="ck-login-pass" placeholder="Password" autocomplete="current-password" />
        <div class="ck-modal-buttons">
          <button id="ck-login-submit" class="ck-modal-btn ck-modal-btn-primary">LOGIN</button>
          <button id="ck-login-cancel" class="ck-modal-btn">CANCEL</button>
        </div>
        <div class="ck-modal-msg" id="ck-login-msg"></div>
        <div class="ck-modal-link"><a href="/signup/" id="ck-signup-link">Create account</a></div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('ck-modal-backdrop').addEventListener('click', () => modal.remove());
    document.getElementById('ck-login-cancel').addEventListener('click', () => modal.remove());
    document.getElementById('ck-login-submit').addEventListener('click', () => this._doLogin());
    document.getElementById('ck-login-pass').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._doLogin();
    });
    document.getElementById('ck-login-user').focus();
  }

  async _doLogin() {
    const user = document.getElementById('ck-login-user')?.value.trim();
    const pass = document.getElementById('ck-login-pass')?.value;
    const msg = document.getElementById('ck-login-msg');
    if (!user || !pass) { if (msg) msg.textContent = 'Enter credentials'; return; }

    try {
      if (msg) msg.textContent = 'Authenticating...';
      await this.ck.login(user, pass);
      localStorage.setItem('ck_token', this.ck.auth.token);
      if (this.ck.auth.refreshToken) localStorage.setItem('ck_refresh', this.ck.auth.refreshToken);
      this.role = ROLE_USER;
      this._updateAuthUI();
      this._log(`logged in: ${this.ck.userId}`);
      document.getElementById('ck-login-modal')?.remove();
      // Notify kernel JS
      this.bus.emit('ck.auth', { action: 'login', userId: this.ck.userId });
    } catch (e) {
      if (msg) { msg.textContent = 'Login failed'; msg.style.color = '#ef5350'; }
    }
  }

  _doLogout() {
    this.ck.logout();
    localStorage.removeItem('ck_token');
    localStorage.removeItem('ck_refresh');
    this.role = ROLE_ANON;
    this._updateAuthUI();
    this._log('logged out');
    this.bus.emit('ck.auth', { action: 'logout' });
  }

  // ── Logging ───────────────────────────────────────────────

  _log(msg) {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const entry = `${ts} ${msg}`;
    this._logs.push(entry);
    if (this._logs.length > 100) this._logs.shift();
    const el = document.getElementById('ck-admin-log');
    if (!el) return;
    const line = document.createElement('div');
    line.textContent = entry;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  // ── Kernel-specific JS ────────────────────────────────────

  async _loadKernelJS(path) {
    const candidates = [path, '/kernel.js'].filter(Boolean);
    for (const url of candidates) {
      try {
        const mod = await import(url);
        if (typeof mod.setup === 'function') {
          mod.setup(this);
          this._log(`kernel JS loaded: ${url}`);
          return;
        }
        if (typeof mod.default === 'function') {
          mod.default(this);
          this._log(`kernel JS loaded: ${url}`);
          return;
        }
      } catch { /* not found, try next */ }
    }
  }

  // ── Public API ────────────────────────────────────────────

  get main() { return document.getElementById('ck-main'); }

  showToast(msg) {
    let t = document.getElementById('ck-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ck-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }

  send(data) { return this.ck.send(data); }

  async destroy() {
    await this.ck.disconnect();
    document.body.innerHTML = '';
  }

  // ── Styles ────────────────────────────────────────────────

  _injectStyles() {
    if (document.querySelector('style[data-ck-page]')) return;
    const s = document.createElement('style');
    s.setAttribute('data-ck-page', '');
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Montserrat:wght@500;600;700&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: #1a202c; color: #e0e0e0;
        font-family: 'Inter', 'SF Mono', monospace;
        font-size: 11px; overflow: hidden; width: 100vw; height: 100vh;
      }
      .material-symbols-outlined {
        font-size: 14px; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20;
      }

      /* Nav */
      #ck-nav {
        position: fixed; top: 0; left: 0; right: 0; z-index: 1001;
        display: flex; align-items: center; height: 32px;
        background: rgba(10,10,10,0.95); border-bottom: 1px solid #2a2a2a;
        padding: 0 10px; gap: 0;
      }
      .ck-logo {
        font-family: 'Montserrat', sans-serif; font-weight: 700;
        font-size: 10px; letter-spacing: 1.5px; color: #66bb6a;
        white-space: nowrap; margin-right: 6px;
      }
      .ck-version { color: #444; font-size: 8px; font-weight: 500; }

      /* Nav icons (shared style for all circular icons) */
      .ck-nav-icon {
        width: 24px; height: 24px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; border: 1.5px solid #333; background: transparent;
        color: #555; transition: all 0.15s; user-select: none; margin: 0 2px;
      }
      .ck-nav-icon:hover { border-color: #666; color: #aaa; }
      .ck-nav-icon.active { border-color: #66bb6a; color: #66bb6a; background: rgba(102,187,106,0.08); }
      .ck-nav-icon.ck-disabled { opacity: 0.25; border-color: #222; color: #333; cursor: not-allowed; }

      .ck-nav-icons { display: flex; gap: 0; margin-left: 4px; }
      .ck-nav-right {
        margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 10px;
      }
      .ck-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #555; display: inline-block;
      }
      .ck-dot.connected { background: #66bb6a; }
      .ck-user-label { color: #888; font-size: 9px; cursor: pointer; }
      .ck-user-label.authenticated { color: #66bb6a; }
      .ck-user-label:hover { text-decoration: underline; }
      .ck-purple { color: #ce93d8; }
      .ck-muted { color: #555; font-size: 7px; }

      /* Admin panel */
      #ck-admin {
        position: fixed; top: 42px; left: 10px; bottom: 10px; z-index: 1000;
        width: 195px; overflow-y: auto;
        background: rgba(0,0,0,0.2); backdrop-filter: blur(5px);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 5px;
        padding: 5px; display: flex; flex-direction: column; gap: 0;
        -webkit-overflow-scrolling: touch;
      }
      #ck-admin::-webkit-scrollbar { display: none; }
      #ck-admin { scrollbar-width: none; }
      #ck-admin.hidden { display: none; }

      .ck-admin-section { border-bottom: 1px solid rgba(255,255,255,0.05); }
      .ck-admin-section:last-child { border-bottom: none; }
      .ck-admin-header {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600;
        color: #888; text-transform: uppercase; letter-spacing: 0.5px;
        padding: 4px 2px; cursor: pointer;
        border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 2px;
      }
      .ck-admin-header:hover { color: #66bb6a; }
      .ck-admin-header.collapsed .ck-toggle-indicator { content: '+'; }
      .ck-admin-header.collapsed .ck-toggle-indicator::after { content: ''; }
      .ck-toggle-indicator { color: #555; font-size: 8px; }
      .ck-admin-header.collapsed .ck-toggle-indicator { visibility: hidden; }
      .ck-admin-header.collapsed::after { content: '+'; color: #555; font-size: 8px; position: absolute; right: 7px; }
      .ck-admin-header { position: relative; }
      .ck-admin-body { font-size: 8px; color: #888; padding: 2px 2px 6px; line-height: 1.6; }
      .ck-admin-body.collapsed { display: none; }

      /* Edge overlay sections */
      .ck-edge-section { border-left: 2px solid #ce93d8; margin-top: 2px; }

      /* Topics */
      .ck-topic-row { display: flex; align-items: center; gap: 6px; padding: 1px 0; }
      .ck-topic-dir { color: #66bb6a; font-size: 7px; min-width: 32px; }
      .ck-topic-name { flex: 1; color: #ccc; font-size: 7px; }

      /* Log */
      .ck-log { max-height: 120px; overflow-y: auto; font-size: 7px; color: #666; }
      .ck-log div { padding: 0; }

      /* Main content */
      #ck-main {
        position: fixed; top: 42px; left: 10px; right: 10px; bottom: 10px;
        overflow-y: auto; padding: 10px;
      }
      #ck-main.with-admin { left: 215px; }

      /* Toast */
      #ck-toast {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: rgba(10,10,10,0.9); border: 1px solid #66bb6a;
        color: #66bb6a; padding: 6px 16px; font-size: 9px;
        font-family: 'Montserrat', sans-serif; font-weight: 600;
        letter-spacing: 1px; border-radius: 3px; z-index: 2000;
        opacity: 0; transition: opacity 0.3s; pointer-events: none;
      }
      #ck-toast.show { opacity: 1; }

      /* Auth button in nav */
      .ck-nav-btn {
        background: transparent; border: 1px solid #444; border-radius: 3px;
        color: #888; font-size: 8px; font-family: 'Montserrat', sans-serif;
        font-weight: 600; letter-spacing: 1px; padding: 3px 8px; cursor: pointer;
        transition: all 0.15s;
      }
      .ck-nav-btn:hover { border-color: #66bb6a; color: #66bb6a; }
      .ck-nav-btn-active { border-color: #66bb6a; color: #66bb6a; }

      /* Login modal */
      .ck-modal-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 3000;
      }
      .ck-modal-content {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        z-index: 3001; background: #12122a; border: 1px solid #2a2a4a;
        border-radius: 12px; padding: 28px; width: 300px;
        display: flex; flex-direction: column; gap: 10px;
      }
      .ck-modal-title {
        font-family: 'Montserrat', sans-serif; font-weight: 700;
        font-size: 12px; letter-spacing: 3px; color: #60a5fa;
        text-align: center; margin-bottom: 4px;
      }
      .ck-modal-content input {
        background: #1a1a2e; border: 1px solid #333; border-radius: 6px;
        color: #e0e0e0; padding: 10px 14px; font-size: 13px; outline: none;
        font-family: 'Inter', sans-serif; width: 100%; box-sizing: border-box;
      }
      .ck-modal-content input:focus { border-color: #60a5fa; }
      .ck-modal-buttons { display: flex; gap: 8px; margin-top: 4px; }
      .ck-modal-btn {
        flex: 1; border: none; border-radius: 6px; padding: 10px;
        font-size: 10px; font-weight: 600; cursor: pointer;
        letter-spacing: 2px; font-family: 'Montserrat', sans-serif;
        background: #2a2a3a; color: #888;
      }
      .ck-modal-btn:hover { background: #3a3a4a; color: #ccc; }
      .ck-modal-btn-primary { background: #60a5fa; color: #0a0a0a; }
      .ck-modal-btn-primary:hover { background: #42a5f5; }
      .ck-modal-msg { font-size: 10px; text-align: center; min-height: 14px; color: #888; }
      .ck-modal-link { text-align: center; font-size: 10px; }
      .ck-modal-link a { color: #60a5fa; text-decoration: none; }
      .ck-modal-link a:hover { text-decoration: underline; }
    `;
    document.head.appendChild(s);
  }
}

export default CKPage;
