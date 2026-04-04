// ck-store.js — CK.Lib instance storage module
// Provides localStorage-backed instance CRUD, active instance tracking,
// state map registration (extract/apply), and sync placeholder.

export class CKStore {
  constructor(kernel) {
    if (!kernel) throw new Error('CKStore requires a kernel name');
    this.kernel = kernel;
    this._stateMaps = {};
    this._syncUrl = null;
  }

  // ── Instance CRUD ──────────────────────────────────────────────

  _key(type, id) {
    return `${this.kernel}:${type}:${id}`;
  }

  _indexKey(type) {
    return `${this.kernel}:${type}:__index__`;
  }

  _loadIndex(type) {
    const raw = localStorage.getItem(this._indexKey(type));
    return raw ? JSON.parse(raw) : {};
  }

  _saveIndex(type, index) {
    localStorage.setItem(this._indexKey(type), JSON.stringify(index));
  }

  save(type, instance) {
    const { id, name, createdAt, state } = instance;
    localStorage.setItem(this._key(type, id), JSON.stringify(instance));
    const index = this._loadIndex(type);
    index[id] = { id, name, createdAt };
    this._saveIndex(type, index);
  }

  get(type, id) {
    const raw = localStorage.getItem(this._key(type, id));
    return raw ? JSON.parse(raw) : null;
  }

  list(type) {
    const index = this._loadIndex(type);
    return Object.values(index);
  }

  remove(type, id) {
    localStorage.removeItem(this._key(type, id));
    const index = this._loadIndex(type);
    delete index[id];
    this._saveIndex(type, index);
  }

  // ── Active instance tracking ───────────────────────────────────

  _activeKey(type) {
    return `${this.kernel}:${type}:__active__`;
  }

  setActive(type, id) {
    localStorage.setItem(this._activeKey(type), id);
  }

  getActive(type) {
    return localStorage.getItem(this._activeKey(type)) || null;
  }

  // ── State map registration ────────────────────────────────────

  registerStateMap(type, { extract, apply }) {
    this._stateMaps[type] = { extract, apply };
  }

  captureState(type, state) {
    const map = this._stateMaps[type];
    if (!map) throw new Error(`No state map registered for type "${type}"`);
    return map.extract(state);
  }

  applyState(type, state, snapshot) {
    const map = this._stateMaps[type];
    if (!map) throw new Error(`No state map registered for type "${type}"`);
    map.apply(state, snapshot);
  }

  // ── Sync placeholder ─────────────────────────────────────────

  enableSync(apiUrl) {
    this._syncUrl = apiUrl;
  }
}
