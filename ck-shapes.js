// T008 — Konva shape library for consensus visualizations

export function createVoteCard(q, opts = {}) {
  const { width = 280, height = 180, x = 0, y = 0 } = opts;
  const group = new Konva.Group({ x, y, name: 'vote-card' });

  group.add(new Konva.Rect({
    width, height, cornerRadius: 12,
    fill: '#141414', stroke: '#2a2a2a', strokeWidth: 1,
  }));

  group.add(new Konva.Text({
    text: q.text, x: 16, y: 20, width: width - 32,
    fontSize: 14, fontFamily: 'Inter, sans-serif', fill: '#e0e0e0',
    align: 'center', wrap: 'word',
  }));

  const btnY = height - 50;
  const btnW = (width - 48) / 2;

  // Option A
  group.add(new Konva.Rect({
    x: 16, y: btnY, width: btnW, height: 36, cornerRadius: 8,
    fill: '#1a2a1a', stroke: '#2a2a2a', strokeWidth: 1, name: 'choice-a',
  }));
  group.add(new Konva.Text({
    text: q.optA, x: 16, y: btnY + 10, width: btnW,
    fontSize: 12, fontFamily: 'Inter, sans-serif', fill: '#e0e0e0', align: 'center',
  }));

  // Option B
  group.add(new Konva.Rect({
    x: 32 + btnW, y: btnY, width: btnW, height: 36, cornerRadius: 8,
    fill: '#1a1a2a', stroke: '#2a2a2a', strokeWidth: 1, name: 'choice-b',
  }));
  group.add(new Konva.Text({
    text: q.optB, x: 32 + btnW, y: btnY + 10, width: btnW,
    fontSize: 12, fontFamily: 'Inter, sans-serif', fill: '#e0e0e0', align: 'center',
  }));

  return group;
}

export function createParticipantDot(name, color = '#66bb6a') {
  const group = new Konva.Group({ name: 'participant-dot' });
  group.add(new Konva.Circle({ radius: 14, fill: color, opacity: 0.8 }));
  group.add(new Konva.Text({
    text: (name || '?')[0].toUpperCase(),
    fontSize: 12, fontFamily: 'Inter, sans-serif', fill: '#fff',
    x: -6, y: -7, align: 'center',
  }));
  return group;
}

export function createProgressRing(current, total, opts = {}) {
  const { radius = 30, x = 0, y = 0 } = opts;
  const group = new Konva.Group({ x, y, name: 'progress-ring' });
  const angle = total > 0 ? (current / total) * 360 : 0;

  // Background ring
  group.add(new Konva.Arc({
    innerRadius: radius - 4, outerRadius: radius,
    angle: 360, fill: '#2a2a2a', rotation: -90,
  }));

  // Progress arc
  group.add(new Konva.Arc({
    innerRadius: radius - 4, outerRadius: radius,
    angle: angle, fill: '#66bb6a', rotation: -90, name: 'progress-arc',
  }));

  // Center text
  group.add(new Konva.Text({
    text: `${current}/${total}`,
    fontSize: 11, fontFamily: 'Inter, sans-serif', fill: '#e0e0e0',
    x: -12, y: -6, align: 'center', width: 24,
  }));

  return group;
}

export function createTimerText(elapsed, opts = {}) {
  const { x = 0, y = 0 } = opts;
  const secs = (elapsed / 1000).toFixed(3);
  const fill = elapsed > 5000 ? '#ef5350' : elapsed > 3000 ? '#ff9800' : '#444';
  return new Konva.Text({
    text: secs, x, y,
    fontSize: 24, fontFamily: 'SF Mono, monospace', fill,
    name: 'timer-text',
  });
}

export function createResultBar(label, pct, color = '#66bb6a', opts = {}) {
  const { width = 200, height = 20, x = 0, y = 0 } = opts;
  const group = new Konva.Group({ x, y, name: 'result-bar' });

  // Background
  group.add(new Konva.Rect({ width, height, cornerRadius: 3, fill: '#2a2a2a' }));

  // Fill
  group.add(new Konva.Rect({
    width: (pct / 100) * width, height, cornerRadius: 3, fill: color,
    name: 'bar-fill',
  }));

  // Label
  group.add(new Konva.Text({
    text: `${label} ${pct}%`, x: 6, y: 4,
    fontSize: 10, fontFamily: 'Inter, sans-serif', fill: '#fff',
  }));

  return group;
}

export function createChoiceButton(option, style = {}) {
  const {
    width = 200, height = 300, x = 0, y = 0,
    bgFill = '#0d0d1a', borderColor = '#66bb6a', borderWidth = 2.5,
    cornerRadius = 14, keyFontSize = 56, labelFontSize = 16,
    keyColor = null, labelColor = '#ccc',
    fontFamily = 'Montserrat', labelFont = 'Inter',
  } = style;

  const accent = keyColor || borderColor;
  const g = new Konva.Group({ x, y, name: `choice-${option.key}` });

  g.add(new Konva.Rect({
    width, height, cornerRadius, fill: bgFill,
    stroke: borderColor, strokeWidth: borderWidth, name: 'bg',
  }));

  g.add(new Konva.Text({
    text: option.key, x: 0, y: height * 0.18, width,
    fontSize: Math.min(keyFontSize, height * 0.32),
    fontFamily, fontStyle: 'bold', fill: accent, align: 'center',
  }));

  g.add(new Konva.Text({
    text: (option.label || '').toUpperCase(), x: 8, y: height * 0.55, width: width - 16,
    fontSize: Math.min(labelFontSize, height * 0.09),
    fontFamily: labelFont, fill: labelColor, align: 'center', wrap: 'word',
  }));

  return g;
}

export function createSessionNode(stage, status, opts = {}) {
  const { x = 0, y = 0 } = opts;
  const group = new Konva.Group({ x, y, name: 'session-node' });

  const statusColor = {
    pending: '#555', active: '#66bb6a', completed: '#42a5f5', paused: '#ff9800',
  }[status] || '#555';

  group.add(new Konva.Rect({
    width: 100, height: 36, cornerRadius: 6,
    fill: '#141414', stroke: statusColor, strokeWidth: 2,
  }));

  group.add(new Konva.Text({
    text: stage, x: 8, y: 4,
    fontSize: 10, fontFamily: 'Inter, sans-serif', fill: '#e0e0e0',
    width: 84,
  }));

  group.add(new Konva.Text({
    text: status, x: 8, y: 20,
    fontSize: 8, fontFamily: 'Inter, sans-serif', fill: statusColor,
  }));

  return group;
}
