// T009 — Animation engine: applies grammar definitions to Konva groups via anime.js

import { ANIM_GRAMMAR, COMMON_ANIM } from './ck-anim-grammar.js';

export function animate(konvaGroup, action, layer) {
  const def = ANIM_GRAMMAR[action] || COMMON_ANIM[action];
  if (!def) return Promise.resolve();

  const node = konvaGroup;
  const draw = () => { if (layer) layer.batchDraw(); };

  return new Promise(resolve => {
    const baseOpts = {
      duration: def.duration,
      easing: def.easing || 'linear',
      complete: () => { draw(); resolve(); },
      update: draw,
    };

    switch (def.type) {
      case 'expand':
        node.scaleX(0.01); node.scaleY(0.01); node.opacity(0);
        anime({ targets: node, scaleX: 1, scaleY: 1, opacity: 1, ...baseOpts });
        break;

      case 'collapse':
        anime({ targets: node, scaleX: 0.01, scaleY: 0.01, opacity: 0, ...baseOpts });
        break;

      case 'pulse': {
        const orig = { scaleX: node.scaleX(), scaleY: node.scaleY() };
        anime({
          targets: node,
          scaleX: [orig.scaleX, orig.scaleX * 1.15, orig.scaleX],
          scaleY: [orig.scaleY, orig.scaleY * 1.15, orig.scaleY],
          loop: def.repeat || 1,
          ...baseOpts,
        });
        break;
      }

      case 'slideLeft':
        anime({ targets: node, x: node.x() - 40, opacity: 0, ...baseOpts });
        break;

      case 'slideIn': {
        const targetX = node.x();
        const from = def.from === 'edge' ? -60 : (def.from === 'right' ? 60 : -60);
        node.x(targetX + from); node.opacity(0);
        anime({ targets: node, x: targetX, opacity: 1, ...baseOpts });
        break;
      }

      case 'fadeIn':
        node.opacity(0);
        anime({ targets: node, opacity: 1, ...baseOpts });
        break;

      case 'fadeOut':
        anime({ targets: node, opacity: 0, ...baseOpts });
        break;

      case 'dim':
        anime({ targets: node, opacity: def.opacity || 0.5, ...baseOpts });
        break;

      case 'flip': {
        const origSX = node.scaleX();
        anime({
          targets: node,
          scaleX: [origSX, 0, origSX],
          ...baseOpts,
        });
        break;
      }

      case 'countUp':
        // For text nodes: animate a numeric property
        anime({ targets: node, opacity: [0.5, 1], scaleY: [0.8, 1], ...baseOpts });
        break;

      case 'flash': {
        const origOpacity = node.opacity();
        anime({
          targets: node,
          opacity: [1, 0.3, 1],
          duration: def.duration,
          easing: def.easing || 'linear',
          complete: () => { node.opacity(origOpacity); draw(); resolve(); },
          update: draw,
        });
        break;
      }

      default:
        resolve();
    }
  });
}

export function staggerAnimate(groups, action, layer, stagger = 60) {
  const def = ANIM_GRAMMAR[action] || COMMON_ANIM[action];
  if (!def || !groups.length) return Promise.resolve();

  return new Promise(resolve => {
    let completed = 0;
    const total = groups.length;

    groups.forEach((group, i) => {
      setTimeout(() => {
        animate(group, action, layer).then(() => {
          completed++;
          if (completed >= total) resolve();
        });
      }, i * stagger);
    });
  });
}
