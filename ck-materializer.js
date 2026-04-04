/**
 * materializer.js — Renders voter screen from a design instance.
 *
 * A design instance contains:
 *   layout: "grid"|"vertical"|"horizontal"|"circle"
 *   palette: ["#66bb6a","#42a5f5",...]
 *   animation: { enter: "slideIn"|"expand"|"fadeIn", stagger: 80 }
 *   buttonStyle: { cornerRadius, bgFill, borderWidth, keyFontSize, labelFontSize }
 *   twoButtonStyle: { swipeEnabled, themes: [[bg,hover,accent], ...] }
 *
 * Usage:
 *   import { materializeQuestion } from './materializer.js';
 *   materializeQuestion(stage, layer, question, designInstance, { onVote });
 */

const DEFAULT_DESIGN = {
  layout: 'grid',
  palette: ['#66bb6a','#42a5f5','#ab47bc','#ffca28','#ef5350','#26c6da'],
  animation: { enter: 'slideIn', stagger: 80 },
  buttonStyle: {
    cornerRadius: 14, bgFill: '#0d0d1a', borderWidth: 2.5,
    keyFontSize: 56, labelFontSize: 16, labelColor: '#ccc',
  },
  twoButtonStyle: {
    swipeEnabled: true,
    themes: [['#1a3a1a','#2a5a2a','#66bb6a'], ['#1a1a3a','#2a2a5a','#42a5f5']],
  },
};

export function mergeDesign(saved) {
  if (!saved) return { ...DEFAULT_DESIGN };
  return {
    layout: saved.layout || DEFAULT_DESIGN.layout,
    palette: saved.palette || DEFAULT_DESIGN.palette,
    animation: { ...DEFAULT_DESIGN.animation, ...saved.animation },
    buttonStyle: { ...DEFAULT_DESIGN.buttonStyle, ...saved.buttonStyle },
    twoButtonStyle: { ...DEFAULT_DESIGN.twoButtonStyle, ...saved.twoButtonStyle },
  };
}

export function computePositions(layout, count, w, h, topY) {
  const positions = [];
  const gap = 8;

  if (layout === 'grid') {
    const cols = count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / cols);
    const btnW = (w - gap * (cols + 1)) / cols;
    const btnH = (h - topY - gap * (rows + 1)) / rows;
    for (let i = 0; i < count; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      positions.push({
        x: gap + col * (btnW + gap),
        y: topY + gap + row * (btnH + gap),
        width: btnW, height: btnH,
      });
    }
  } else if (layout === 'vertical') {
    const btnH = (h - topY - gap * (count + 1)) / count;
    const btnW = w - gap * 2;
    for (let i = 0; i < count; i++) {
      positions.push({ x: gap, y: topY + gap + i * (btnH + gap), width: btnW, height: btnH });
    }
  } else if (layout === 'horizontal') {
    const btnW = (w - gap * (count + 1)) / count;
    const btnH = h - topY - gap * 2;
    for (let i = 0; i < count; i++) {
      positions.push({ x: gap + i * (btnW + gap), y: topY + gap, width: btnW, height: btnH });
    }
  } else if (layout === 'circle') {
    const cx = w / 2, cy = topY + (h - topY) / 2;
    const radius = Math.min(w, h - topY) * 0.35;
    const btnSize = radius * 0.6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      positions.push({
        x: cx + Math.cos(angle) * radius - btnSize / 2,
        y: cy + Math.sin(angle) * radius - btnSize / 2,
        width: btnSize, height: btnSize,
      });
    }
  }

  return positions;
}

export function materializeQuestion(stage, layer, question, design, callbacks = {}) {
  const d = mergeDesign(design);
  const opts = question.options || [];
  const w = stage.width(), h = stage.height();

  // Question text
  const qt = new Konva.Text({
    text: question.text, x: 16, y: 14, width: w - 32,
    fontSize: Math.min(24, w * 0.05),
    fontFamily: 'Inter, system-ui, sans-serif',
    fill: '#e0e0e0', align: 'center', wrap: 'word',
  });
  layer.add(qt);
  const topY = qt.height() + 30;

  // Two-button split for exactly 2 options with swipe
  const effectiveLayout = (opts.length === 2 && d.twoButtonStyle.swipeEnabled)
    ? 'horizontal' : d.layout;
  const positions = computePositions(effectiveLayout, opts.length, w, h, topY);

  const groups = [];

  opts.forEach((opt, i) => {
    const pos = positions[i] || { x: 0, y: 0, width: 200, height: 200 };
    const color = d.palette[i % d.palette.length];

    let bgFill, borderColor, keyColor;
    if (opts.length === 2 && d.twoButtonStyle.swipeEnabled) {
      const theme = d.twoButtonStyle.themes[i] || d.twoButtonStyle.themes[0];
      bgFill = theme[0]; borderColor = theme[1]; keyColor = theme[2];
    } else {
      bgFill = d.buttonStyle.bgFill; borderColor = color; keyColor = color;
    }

    const g = new Konva.Group({ x: pos.x, y: pos.y, name: `choice-${opt.key}` });

    g.add(new Konva.Rect({
      width: pos.width, height: pos.height,
      cornerRadius: d.buttonStyle.cornerRadius,
      fill: bgFill, stroke: borderColor,
      strokeWidth: d.buttonStyle.borderWidth, name: 'bg',
    }));

    g.add(new Konva.Text({
      text: opt.key, x: 0, y: pos.height * 0.18, width: pos.width,
      fontSize: Math.min(d.buttonStyle.keyFontSize, pos.height * 0.32),
      fontFamily: 'Montserrat', fontStyle: 'bold', fill: keyColor, align: 'center',
    }));

    g.add(new Konva.Text({
      text: (opt.label || '').toUpperCase(), x: 8, y: pos.height * 0.55,
      width: pos.width - 16,
      fontSize: Math.min(d.buttonStyle.labelFontSize, pos.height * 0.09),
      fontFamily: 'Inter', fill: d.buttonStyle.labelColor || '#ccc',
      align: 'center', wrap: 'word',
    }));

    // Swipe hints for 2-button
    if (opts.length === 2 && d.twoButtonStyle.swipeEnabled) {
      g.add(new Konva.Text({
        text: i === 0 ? '\u2190 SWIPE' : 'SWIPE \u2192',
        x: 0, y: pos.height * 0.85, width: pos.width,
        fontSize: 9, fontFamily: 'Inter', fill: '#333', align: 'center',
      }));
    }

    // Interaction
    g.on('tap click', () => { if (callbacks.onVote) callbacks.onVote(opt.key); });
    g.on('pointerover', () => {
      const bg = g.findOne('.bg');
      if (bg) { bg._origFill = bg._origFill || bg.fill(); bg.fill(borderColor); layer.batchDraw(); }
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
  groups.forEach((g, i) => {
    setTimeout(() => {
      if (typeof anime !== 'undefined') {
        const targetX = g.x(), targetY = g.y();
        if (d.animation.enter === 'slideIn') {
          g.x(targetX + 40); g.opacity(0);
          anime({ targets: g, x: targetX, opacity: 1, duration: 400, easing: 'easeOutBack',
            update: () => layer.batchDraw() });
        } else if (d.animation.enter === 'expand') {
          g.scaleX(0.01); g.scaleY(0.01); g.opacity(0);
          anime({ targets: g, scaleX: 1, scaleY: 1, opacity: 1, duration: 500, easing: 'easeOutExpo',
            update: () => layer.batchDraw() });
        } else {
          g.opacity(0);
          anime({ targets: g, opacity: 1, duration: 300, easing: 'easeOutQuad',
            update: () => layer.batchDraw() });
        }
      } else {
        g.opacity(1);
        layer.batchDraw();
      }
    }, i * d.animation.stagger);
  });

  // Swipe for 2-option
  if (opts.length === 2 && d.twoButtonStyle.swipeEnabled) {
    let sx = 0, dx = 0, active = false;
    stage.on('touchstart', e => { sx = e.evt.touches[0].clientX; active = true; });
    stage.on('touchmove', e => { if (active) dx = e.evt.touches[0].clientX - sx; });
    stage.on('touchend', () => {
      if (!active) return; active = false;
      if (Math.abs(dx) > 50 && callbacks.onVote) {
        callbacks.onVote(dx < 0 ? opts[1].key : opts[0].key);
      }
      dx = 0;
    });
  }

  return { groups, design: d };
}
