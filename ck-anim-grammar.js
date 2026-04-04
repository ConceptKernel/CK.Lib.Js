// T007 — Animation grammar: maps NATS actions to anime.js animation specs

export const ANIM_GRAMMAR = {
  // Session
  'session.created':  { type: 'expand',    duration: 600, easing: 'easeOutExpo' },
  'session.start':    { type: 'pulse',     duration: 400, easing: 'easeOutElastic(1,.8)', repeat: 2 },
  'session.advance':  { type: 'slideLeft', duration: 500, easing: 'easeOutQuad' },
  'session.pause':    { type: 'dim',       duration: 300, easing: 'linear', opacity: 0.5 },
  'session.end':      { type: 'collapse',  duration: 700, easing: 'easeInExpo' },

  // Vote
  'vote.cast':        { type: 'flip',      duration: 400, easing: 'easeOutQuad' },
  'vote.tally':       { type: 'countUp',   duration: 800, easing: 'easeOutExpo' },
  'results.reveal':   { type: 'fadeIn',    duration: 500, easing: 'easeOutQuad' },

  // Question
  'question.show':    { type: 'slideIn',   duration: 400, easing: 'easeOutBack', from: 'right' },
  'question.results': { type: 'pulse',     duration: 300, easing: 'easeOutQuad' },

  // Participant
  'participant.join':  { type: 'slideIn',  duration: 400, easing: 'easeOutBack', from: 'edge' },
  'participant.leave': { type: 'fadeOut',  duration: 300, easing: 'easeInQuad' },

  // State
  'state.snapshot':   { type: 'flash',    duration: 200, color: '#66bb6a' },
  'state.restore':    { type: 'fadeIn',   duration: 400, easing: 'easeOutQuad' },
};

// Common actions shared across all concept kernels (from CKP whitepaper)
export const COMMON_ANIM = {
  'status':   { type: 'pulse',   duration: 200, easing: 'linear' },
  'enable':   { type: 'fadeIn',  duration: 300, easing: 'easeOutQuad' },
  'disable':  { type: 'dim',    duration: 300, easing: 'linear', opacity: 0.25 },
  'ontology': { type: 'flash',  duration: 150, color: '#26c6da' },
};
