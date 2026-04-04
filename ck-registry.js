/**
 * ck-registry.js — Component Type Registry for NATS-driven UI materialization.
 *
 * Maps data types to shape factories, animation grammars, and layout modes.
 * Any kernel registers its component types here. The materializer uses
 * the registry to render typed data as Konva canvas elements.
 *
 * Usage:
 *   import { registry, materialize } from '/ck.lib/ck-registry.js';
 *
 *   // Register a component type
 *   registry.register('vote-choice', {
 *     shape: (item, style) => createChoiceButton(item, style),
 *     layout: 'grid',
 *     animation: { enter: 'slideIn', stagger: 80 },
 *     interaction: 'tap',  // tap | drag | hold | swipe
 *   });
 *
 *   // Materialize typed data onto a Konva layer
 *   materialize(layer, {
 *     type: 'vote-choice',
 *     items: [{key:'A', label:'Yes'}, {key:'B', label:'No'}],
 *     callbacks: { onTap: (item) => console.log(item) },
 *   });
 */

// ── Color palette ──────────────────────────────────────────────────────
const PALETTE = ['#00ff88','#00e5ff','#ab47bc','#ffca28','#ef5350','#26c6da'];

// ── Registry store ─────────────────────────────────────────────────────
const _types = {};

export const registry = {
  /**
   * Register a component type.
   * @param {string} type — unique type name (e.g. 'vote-choice', 'task-card', 'goal-node')
   * @param {object} config
   * @param {function} config.shape — (item, style) => Konva.Group
   * @param {string} config.layout — 'grid' | 'vertical' | 'horizontal' | 'circle' | 'free'
   * @param {object} config.animation — { enter, exit, stagger }
   * @param {string} config.interaction — 'tap' | 'drag' | 'hold' | 'swipe' | 'none'
   * @param {object} config.style — default style overrides
   */
  register(type, config) {
    _types[type] = {
      shape: config.shape || defaultShape,
      layout: config.layout || 'grid',
      animation: config.animation || { enter: 'fadeIn', stagger: 60 },
      interaction: config.interaction || 'tap',
      style: config.style || {},
      ...config,
    };
  },

  get(type) { return _types[type]; },
  has(type) { return type in _types; },
  list() { return Object.keys(_types); },
};


// ── Default shape factory ──────────────────────────────────────────────

function defaultShape(item, style = {}) {
  const {
    width = 200, height = 60, x = 0, y = 0,
    bgFill = '#0d0d1a', borderColor = '#00e5ff', borderWidth = 1,
    cornerRadius = 8, fontSize = 13, labelColor = '#e0e0e0',
  } = style;

  const g = new Konva.Group({ x, y, name: `item-${item.key || item.id || ''}` });

  g.add(new Konva.Rect({
    width, height, cornerRadius, fill: bgFill,
    stroke: borderColor, strokeWidth: borderWidth, name: 'bg',
  }));

  // Primary text
  g.add(new Konva.Text({
    text: item.label || item.name || item.text || String(item.key || ''),
    x: 12, y: height * 0.3, width: width - 24,
    fontSize, fontFamily: 'Inter, sans-serif', fill: labelColor,
    wrap: 'word',
  }));

  // Optional subtitle
  if (item.subtitle || item.description) {
    g.add(new Konva.Text({
      text: item.subtitle || item.description,
      x: 12, y: height * 0.6, width: width - 24,
      fontSize: 9, fontFamily: 'Inter, sans-serif', fill: '#666',
      wrap: 'word',
    }));
  }

  return g;
}


// ── Layout computation ─────────────────────────────────────────────────

export function computeLayout(mode, count, bounds) {
  const { x = 0, y = 0, width = 800, height = 600 } = bounds;
  const positions = [];
  const gap = 8;

  if (mode === 'grid') {
    const cols = count <= 4 ? 2 : count <= 9 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    const w = (width - gap * (cols + 1)) / cols;
    const h = (height - gap * (rows + 1)) / rows;
    for (let i = 0; i < count; i++) {
      positions.push({
        x: x + gap + (i % cols) * (w + gap),
        y: y + gap + Math.floor(i / cols) * (h + gap),
        width: w, height: h,
      });
    }
  } else if (mode === 'vertical') {
    const h = (height - gap * (count + 1)) / count;
    for (let i = 0; i < count; i++) {
      positions.push({ x: x + gap, y: y + gap + i * (h + gap), width: width - gap * 2, height: h });
    }
  } else if (mode === 'horizontal') {
    const w = (width - gap * (count + 1)) / count;
    for (let i = 0; i < count; i++) {
      positions.push({ x: x + gap + i * (w + gap), y: y + gap, width: w, height: height - gap * 2 });
    }
  } else if (mode === 'circle') {
    const cx = x + width / 2, cy = y + height / 2;
    const r = Math.min(width, height) * 0.35;
    const sz = r * 0.5;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      positions.push({
        x: cx + Math.cos(a) * r - sz / 2,
        y: cy + Math.sin(a) * r - sz / 2,
        width: sz, height: sz,
      });
    }
  } else {
    // free — items placed at their own x/y
    for (let i = 0; i < count; i++) {
      positions.push({ x: x + i * 50, y: y + i * 50, width: 150, height: 60 });
    }
  }

  return positions;
}


// ── Materialize — render typed data onto a Konva layer ──────────────────

export function materialize(layer, data, callbacks = {}) {
  const { type, items = [], bounds = {}, styleOverrides = {} } = data;

  const config = registry.get(type);
  if (!config) {
    console.warn(`[ck-registry] unknown type: ${type}, using default`);
  }

  const shape = config?.shape || defaultShape;
  const layout = config?.layout || 'grid';
  const anim = config?.animation || { enter: 'fadeIn', stagger: 60 };
  const interaction = config?.interaction || 'tap';
  const baseStyle = { ...config?.style, ...styleOverrides };

  // Compute positions
  const w = bounds.width || layer.getStage()?.width() || 800;
  const h = bounds.height || layer.getStage()?.height() || 600;
  const positions = computeLayout(layout, items.length, {
    x: bounds.x || 0, y: bounds.y || 0, width: w, height: h,
  });

  const groups = [];

  items.forEach((item, i) => {
    const pos = positions[i] || { x: 0, y: 0, width: 150, height: 60 };
    const color = PALETTE[i % PALETTE.length];
    const style = { ...baseStyle, ...pos, borderColor: color };

    const g = shape(item, style);
    g.setPosition({ x: pos.x, y: pos.y });

    // Wire interaction
    if (interaction === 'tap') {
      g.on('tap click', () => { if (callbacks.onTap) callbacks.onTap(item, i); });
    }

    // Hover
    g.on('pointerover', () => {
      const bg = g.findOne('.bg');
      if (bg) { bg._origFill = bg._origFill || bg.fill(); bg.fill(color); layer.batchDraw(); }
    });
    g.on('pointerout', () => {
      const bg = g.findOne('.bg');
      if (bg && bg._origFill) { bg.fill(bg._origFill); layer.batchDraw(); }
    });

    g.opacity(0);
    layer.add(g);
    groups.push(g);
  });

  layer.draw();

  // Animate entrance
  if (typeof anime !== 'undefined') {
    groups.forEach((g, i) => {
      setTimeout(() => {
        if (anim.enter === 'slideIn') {
          const tx = g.x(); g.x(tx + 30); g.opacity(0);
          anime({ targets: g, x: tx, opacity: 1, duration: 350, easing: 'easeOutBack',
            update: () => layer.batchDraw() });
        } else if (anim.enter === 'expand') {
          g.scaleX(0.01); g.scaleY(0.01); g.opacity(0);
          anime({ targets: g, scaleX: 1, scaleY: 1, opacity: 1, duration: 400, easing: 'easeOutExpo',
            update: () => layer.batchDraw() });
        } else {
          g.opacity(0);
          anime({ targets: g, opacity: 1, duration: 250, easing: 'easeOutQuad',
            update: () => layer.batchDraw() });
        }
      }, i * (anim.stagger || 60));
    });
  } else {
    groups.forEach(g => { g.opacity(1); });
    layer.batchDraw();
  }

  return { groups, config };
}


// ── Built-in component types ───────────────────────────────────────────

// Vote choice buttons
registry.register('vote-choice', {
  shape: (item, style) => {
    const { width = 200, height = 200, x = 0, y = 0,
      bgFill = '#0d0d1a', borderColor = '#00ff88', borderWidth = 2.5,
      cornerRadius = 14 } = style;
    const g = new Konva.Group({ x, y, name: `choice-${item.key}` });
    g.add(new Konva.Rect({ width, height, cornerRadius, fill: bgFill,
      stroke: borderColor, strokeWidth: borderWidth, name: 'bg' }));
    g.add(new Konva.Text({ text: item.key, x: 0, y: height * 0.18, width,
      fontSize: Math.min(56, height * 0.3), fontFamily: 'Montserrat', fontStyle: 'bold',
      fill: borderColor, align: 'center' }));
    g.add(new Konva.Text({ text: (item.label || '').toUpperCase(), x: 8, y: height * 0.55,
      width: width - 16, fontSize: Math.min(14, height * 0.08),
      fontFamily: 'Inter', fill: '#ccc', align: 'center', wrap: 'word' }));
    return g;
  },
  layout: 'grid',
  animation: { enter: 'slideIn', stagger: 80 },
  interaction: 'tap',
});

// Tally bar
registry.register('tally-bar', {
  shape: (item, style) => {
    const { width = 300, height = 20, x = 0, y = 0, borderColor = '#00ff88' } = style;
    const g = new Konva.Group({ x, y, name: `bar-${item.key}` });
    g.add(new Konva.Rect({ width, height, cornerRadius: 3, fill: '#111122', name: 'bg' }));
    const pct = item.pct || 0;
    g.add(new Konva.Rect({ width: (pct / 100) * width, height, cornerRadius: 3,
      fill: borderColor, opacity: 0.85, name: 'fill' }));
    g.add(new Konva.Text({ text: `${item.key}: ${item.label} ${pct}%`, x: 6, y: 3,
      fontSize: 10, fontFamily: 'Inter', fill: '#fff' }));
    return g;
  },
  layout: 'vertical',
  animation: { enter: 'expand', stagger: 60 },
  interaction: 'none',
});

// Task card
registry.register('task-card', {
  shape: (item, style) => {
    const { width = 300, height = 70, x = 0, y = 0, borderColor = '#00e5ff' } = style;
    const statusColor = { pending: '#ffca28', in_progress: '#00e5ff',
      completed: '#00ff88', cancelled: '#555' }[item.status] || '#555';
    const g = new Konva.Group({ x, y, name: `task-${item.id}` });
    g.add(new Konva.Rect({ width, height, cornerRadius: 8, fill: '#0d0d1a',
      stroke: statusColor, strokeWidth: 1, name: 'bg' }));
    g.add(new Konva.Text({ text: item.id || '', x: 8, y: 8,
      fontSize: 10, fontFamily: 'Montserrat', fontStyle: '700', fill: statusColor }));
    g.add(new Konva.Text({ text: item.title || item.label || '', x: 8, y: 24, width: width - 16,
      fontSize: 11, fontFamily: 'Inter', fill: '#e0e0e0', wrap: 'word' }));
    g.add(new Konva.Text({ text: item.target_ck || '', x: 8, y: height - 16,
      fontSize: 8, fontFamily: 'Inter', fill: '#555' }));
    return g;
  },
  layout: 'vertical',
  animation: { enter: 'slideIn', stagger: 50 },
  interaction: 'tap',
});

// Goal node
registry.register('goal-node', {
  shape: (item, style) => {
    const { width = 250, height = 50, x = 0, y = 0 } = style;
    const statusColor = { active: '#00e5ff', completed: '#00ff88' }[item.status] || '#ffca28';
    const g = new Konva.Group({ x, y, name: `goal-${item.id}` });
    g.add(new Konva.Rect({ width, height, cornerRadius: 10, fill: '#0d0d1a',
      stroke: statusColor, strokeWidth: 2, name: 'bg' }));
    g.add(new Konva.Text({ text: item.id || '', x: 10, y: 8,
      fontSize: 10, fontFamily: 'Montserrat', fontStyle: '700', fill: statusColor }));
    g.add(new Konva.Text({ text: item.title || '', x: 10, y: 26, width: width - 20,
      fontSize: 10, fontFamily: 'Inter', fill: '#ccc' }));
    return g;
  },
  layout: 'vertical',
  animation: { enter: 'expand', stagger: 100 },
  interaction: 'tap',
});

// Kernel node (for fleet graph)
registry.register('kernel-node', {
  shape: (item, style) => {
    const { width = 180, height = 45, x = 0, y = 0 } = style;
    const typeColor = { 'node:hot': '#ff8c00', 'node:cold': '#00e5ff',
      agent: '#ff0055', service: '#ab47bc' }[item.type] || '#555';
    const g = new Konva.Group({ x, y, name: `kernel-${item.name}` });
    g.add(new Konva.Rect({ width, height, cornerRadius: 6, fill: '#0d0d1a',
      stroke: typeColor, strokeWidth: 1.5, name: 'bg' }));
    g.add(new Konva.Text({ text: item.name || '', x: 8, y: 8, width: width - 16,
      fontSize: 10, fontFamily: 'Montserrat', fontStyle: '600', fill: '#e0e0e0', letterSpacing: 0.5 }));
    g.add(new Konva.Text({ text: item.type || '', x: 8, y: 26,
      fontSize: 8, fontFamily: 'Inter', fill: typeColor }));
    return g;
  },
  layout: 'grid',
  animation: { enter: 'fadeIn', stagger: 30 },
  interaction: 'tap',
});

// Audience profile
registry.register('audience-profile', {
  shape: (item, style) => {
    const { width = 200, height = 55, x = 0, y = 0 } = style;
    const trustColor = { Discoverer: '#555', Explorer: '#ffca28',
      Regular: '#00e5ff', Advocate: '#00ff88' }[item.trust_state] || '#555';
    const g = new Konva.Group({ x, y, name: `audience-${item.voter_id}` });
    g.add(new Konva.Rect({ width, height, cornerRadius: 8, fill: '#0d0d1a',
      stroke: trustColor, strokeWidth: 1, name: 'bg' }));
    g.add(new Konva.Circle({ x: 16, y: height / 2, radius: 8, fill: trustColor }));
    g.add(new Konva.Text({ text: item.voter_id || '', x: 30, y: 10,
      fontSize: 10, fontFamily: 'Montserrat', fontStyle: '600', fill: '#e0e0e0' }));
    g.add(new Konva.Text({
      text: `${item.trust_state} · ${item.governance_style} · ${item.total_votes} votes`,
      x: 30, y: 28, fontSize: 8, fontFamily: 'Inter', fill: '#888' }));
    return g;
  },
  layout: 'vertical',
  animation: { enter: 'slideIn', stagger: 40 },
  interaction: 'tap',
});

export default registry;
