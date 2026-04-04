// ck-kernel.js — CK.Lib base Kernel class
// Provides lifecycle hooks, style injection, and shared design tokens.
// Subclass CKKernel for each concept kernel; override setup/refresh/destroy/styles.

/**
 * CSS design tokens for consistent dark-theme styling across all kernels.
 * Import and reference these in kernel styles() or inline style attributes.
 */
export const cssVars = {
  bg:       '#0a0a0a',
  bgCard:   '#141414',
  text:     '#e0e0e0',
  textMuted:'#888888',
  accent:   '#66bb6a',
  border:   '#2a2a2a',
  fontMono: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSans: "'Inter', 'Segoe UI', system-ui, sans-serif",
};

/**
 * Base class for all concept kernels.
 *
 * Subclasses MUST set `static id` to their kernel identifier (e.g. 'CK.UI.2D.Physics').
 * Override lifecycle methods and styles() to customize behavior.
 *
 * Usage:
 *   class MyKernel extends CKKernel {
 *     static id = 'CK.UI.2D.Physics';
 *     styles() { return `.physics-panel { color: ${cssVars.accent}; }`; }
 *     setup(ctx) { ... }
 *     refresh(ctx) { ... }
 *     destroy() { super.destroy(); ... }
 *   }
 */
export class CKKernel {

  /** Kernel identifier — override in subclass via `static id = '...'`. */
  static id = 'CKKernel';

  constructor() {
    this._styleEl = null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  /**
   * Initialize the kernel with a runtime context object.
   * Override in subclass to wire event listeners, render initial UI, etc.
   * @param {object} ctx — runtime context (ck, bus, store, helpers)
   */
  setup(ctx) {}

  /**
   * Re-read state and update DOM.
   * Called by the runtime when external state changes.
   * @param {object} ctx — runtime context
   */
  refresh(ctx) {}

  /**
   * Cleanup subscriptions, remove injected styles, and release resources.
   * If overriding, call `super.destroy()` to ensure style cleanup.
   */
  destroy() {
    if (this._styleEl && this._styleEl.parentNode) {
      this._styleEl.parentNode.removeChild(this._styleEl);
      this._styleEl = null;
    }
  }

  // ── Style injection ──────────────────────────────────────────────

  /**
   * Return a CSS string to inject into the document head.
   * Override in subclass; base returns empty string.
   * @returns {string} CSS rules
   */
  styles() {
    return '';
  }

  /**
   * Create a <style> element in document.head with the CSS from styles().
   * Tagged with the kernel id via a data attribute for identification.
   * Safe to call multiple times — replaces existing style element.
   */
  injectStyles() {
    const css = this.styles();
    if (!css) return;

    // Remove existing style element if present
    if (this._styleEl && this._styleEl.parentNode) {
      this._styleEl.parentNode.removeChild(this._styleEl);
    }

    const el = document.createElement('style');
    el.setAttribute('data-ck-kernel', this.constructor.id);
    el.textContent = css;
    document.head.appendChild(el);
    this._styleEl = el;
  }
}
