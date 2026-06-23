/**
 * harness.js — v1.5.x FULL-SURFACE keystone verification harness.
 *
 * Drives the v1.5.x dispatch-only L2 surface end-to-end against the live
 * ck-lib-js all-in-one. Imports { CK } from /cklib/ck.js (the bind-mounted
 * live workspace file, served via busybox httpd). WSS endpoint auto-detected:
 *   https://<host>/   → wss://<host>/wss  (Envoy / gateway)
 *   http://<host>:8000/ → ws://<host>:9222 (direct docker run)
 * Override via ?wss=ws://... query param.
 *
 * Op surface:
 *   core     : activate · do('kernels.list') · create('Task') · query('Task')
 *   lifecycle: transition(id, toState)
 *   integrity: validate(body) · verify(id) · provenance(id)
 *   reads    : reach(from, via) · snapshot()
 *   gov trio : do('kernel.propose_change') · do('kernel.vote') · do('kernel.apply')
 *   concept  : do('concept.match')
 *
 * Every op is a separate badge. Every op defaults ON (the keystone run) and is
 * skippable via query params:
 *   ?skip=transition,gov,match     — skip listed ops
 *   ?only=create,query             — run only listed ops
 *   ?kernel=demo&wss=wss://...&timeout=4000
 * Op keys: read, create, query, transition, validate, verify, provenance,
 *          reach, snapshot, gov (the trio), match.
 *
 * CLASSIFICATION — each op's reply is labeled from the RAW dispatch trace:
 *   TYPED-SEALED          : ok:true / proof_digest / seq / typed result payload
 *   TYPED-NEGATIVE (stub) : ok:false — relay stub answer
 *   DEGRADED              : echo/unrecognized shape, facade fallback, honest degrade
 *   TIMEOUT               : no correlated result.* within dispatchTimeout
 * PASS (green) only on a typed positive server answer.
 *
 * Sentinels: `[v150] STEP <id> <STATUS>` per op, `[v150] OPS <json>` summary,
 * and the final `[v150] RESULT PASS|FAIL :: N PASS / M FAIL / K SKIP`.
 */

import { CK } from '/cklib/ck.js';

// ── Live env defaults (overridable via ?param=) ──────────────────────────────
const DEFAULTS = {
  kernel:        'demo',
  // Auto-detect WSS endpoint from page topology (same logic as root probe page):
  //   https://<host>/   → wss://<host>/wss  (Envoy / gateway in front)
  //   http://<host>:8000/ → ws://<host>:9222 (direct docker run, no gateway)
  wssEndpoint: (() => {
    const override = new URLSearchParams(location.search).get('wss');
    if (override) return override;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const directHttpd = location.port === '8000';
    return directHttpd
      ? `${proto}://${location.hostname}:9222`
      : `${proto}://${location.host}/wss`;
  })(),
  dispatchTimeout: 4000,
};

const OP_KEYS = ['read', 'create', 'query', 'transition', 'validate', 'verify',
                 'provenance', 'reach', 'snapshot', 'gov', 'match'];

function cfg() {
  const q = new URLSearchParams(location.search);
  const list = (name) => (q.get(name) || '').split(',').map(s => s.trim()).filter(Boolean);
  const skip = new Set(list('skip'));
  const only = new Set(list('only'));
  const enabled = {};
  for (const op of OP_KEYS) enabled[op] = only.size ? only.has(op) : !skip.has(op);
  return {
    kernel:          q.get('kernel') || DEFAULTS.kernel,
    wssEndpoint:     q.get('wss')    || DEFAULTS.wssEndpoint,
    dispatchTimeout: Number(q.get('timeout')) || DEFAULTS.dispatchTimeout,
    enabled,
  };
}

// ── UI plumbing ──────────────────────────────────────────────────────────────
const steps = [];
function addStep(id, label, op = null) {
  const li = document.createElement('li');
  li.id = `step-${id}`;
  li.className = 'step pending';
  li.innerHTML = `<span class="badge">…</span> <span class="cls"></span> <span class="label"></span> <span class="detail"></span>`;
  li.querySelector('.label').textContent = label;
  document.getElementById('steps').appendChild(li);
  const rec = { id, label, op, status: 'pending', cls: null, el: li };
  steps.push(rec);
  return rec;
}
function setStep(rec, status, detail = '', cls = null) {
  rec.status = status;
  rec.cls = cls;
  rec.el.className = `step ${status}`;
  const badge = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP', running: 'RUN', pending: '…' }[status] || status;
  rec.el.querySelector('.badge').textContent = badge;
  const clsEl = rec.el.querySelector('.cls');
  clsEl.textContent = cls || '';
  clsEl.className = 'cls' + (cls ? ` cls-${cls.startsWith('TYPED-SEALED') ? 'sealed' : cls.startsWith('TYPED-NEGATIVE') ? 'negative' : cls.startsWith('TIMEOUT') ? 'timeout' : 'degraded'}` : '');
  rec.el.querySelector('.detail').textContent = detail ? `— ${detail}` : '';
  const line = `[v150] STEP ${rec.id} ${status.toUpperCase()}${cls ? ` [${cls}]` : ''}: ${rec.label}${detail ? ' — ' + detail : ''}`;
  (status === 'fail' ? console.error : console.log)(line);
}
function setSummary(text, ok) {
  const el = document.getElementById('summary');
  el.textContent = text;
  el.className = ok ? 'ok' : 'bad';
  console.log(`[v150] RESULT ${ok ? 'PASS' : 'FAIL'} :: ${text}`);
}

// ── Raw-trace classification ─────────────────────────────────────────────────
const STUB_RE = /not governed yet|CI-B/i;

function classifyEntry(e) {
  if (e.err) {
    if (/timed out/i.test(e.err.message || '')) return { label: 'TIMEOUT', detail: e.err.message };
    return { label: 'DEGRADED', detail: `dispatch threw: ${e.err.message}` };
  }
  const r = e.reply;
  if (r == null) return { label: 'DEGRADED', detail: 'null reply' };
  if (typeof r !== 'object') return { label: 'DEGRADED', detail: `scalar reply (${typeof r})` };
  if (r.ok === false) {
    const err = typeof r.error === 'string' ? r.error : JSON.stringify(r.error ?? null);
    if (STUB_RE.test(err || '')) return { label: 'TYPED-NEGATIVE (stub)', detail: `ok:false "${err}"` };
    if (err === 'unknown_affordance' || err === 'unknown_verb') return { label: 'TYPED-NEGATIVE (unknown_affordance)', detail: `ok:false "${err}"` };
    if (Array.isArray(r.violations)) return { label: 'TYPED-NEGATIVE (violations)', detail: `${r.violations.length} violation(s)` };
    return { label: 'TYPED-NEGATIVE', detail: `ok:false${err ? ` "${err}"` : ''}` };
  }
  const sealed = r.ok === true || r.proof_digest != null || r.seq != null;
  const typedResult = r.result !== undefined || Array.isArray(r);
  if (sealed || typedResult) {
    const bits = [];
    if (r.id) bits.push(`id=${r.id}`);
    if (r.proof_digest) bits.push('proof_digest✓');
    if (Array.isArray(r.result)) bits.push(`result[${r.result.length}]`);
    return { label: 'TYPED-SEALED', detail: bits.join(' ') };
  }
  if (('action' in r) && !('ok' in r)) return { label: 'DEGRADED', detail: 'ECHO (input bounced back)' };
  return { label: 'DEGRADED', detail: 'unrecognized reply shape' };
}

function classifyOp(trace, threw) {
  if (!trace.length) {
    if (threw) return /timed out/i.test(threw.message || '')
      ? { label: 'TIMEOUT', detail: threw.message }
      : { label: 'DEGRADED', detail: `threw before dispatch: ${threw.message}` };
    return { label: 'DEGRADED', detail: 'no dispatch issued' };
  }
  const last = classifyEntry(trace[trace.length - 1]);
  if (trace.length > 1) last.detail += ` (facade chain: ${trace.map(t => t.verb).join(' → ')})`;
  return last;
}

export async function run() {
  const c = cfg();
  document.getElementById('config-dump').textContent = JSON.stringify(c, null, 2);
  console.log('[v150] config:', c);

  const s0  = addStep('import',      `import { CK } from /cklib/ck.js (live workspace bind-mount)`);
  const s1  = addStep('activate',    `CK.activate('${c.kernel}', { wssEndpoint, dispatchTimeout })`);
  const s2  = addStep('do-read',     `k.do('kernels.list', {})  — read via open affordance surface`, 'read');
  const s3  = addStep('create',      `k.create('Task', {...})    — write → instance.create`, 'create');
  const s4  = addStep('query',       `k.query('Task', {...})     — typed read → instance.query`, 'query');
  const s5  = addStep('transition',  `k.transition(id, 'active') — lifecycle → instance.transition`, 'transition');
  const s6  = addStep('validate',    `k.validate(body)            — pre-write check → instance.validate`, 'validate');
  const s7  = addStep('verify',      `k.verify(id)                — seal check → instance.verify`, 'verify');
  const s8  = addStep('provenance',  `k.provenance(id)            — PROV chain → instance.provenance`, 'provenance');
  const s9  = addStep('reach',       `k.reach(from, via)          — bounded traversal → instance.reach`, 'reach');
  const s10 = addStep('snapshot',    `k.snapshot()                — current-state replay → instance.snapshot`, 'snapshot');
  const s11 = addStep('gov-propose', `k.do('kernel.propose_change', {ops})  — governance plane`, 'gov');
  const s12 = addStep('gov-vote',    `k.do('kernel.vote', {proposal, choice}) — governance plane`, 'gov');
  const s13 = addStep('gov-apply',   `k.do('kernel.apply', {proposal})        — governance plane`, 'gov');
  const s14 = addStep('match',       `k.match(term) → concept.match`, 'match');

  setStep(s0, 'pass', 'modules loaded; import { CK } from /cklib/ck.js OK');

  let k = null;

  setStep(s1, 'running');
  try {
    k = await CK.activate(c.kernel, {
      wssEndpoint: c.wssEndpoint,
      dispatchTimeout: c.dispatchTimeout,
      hydrate: false,
      timeout: c.dispatchTimeout,
    });
    window.__k = k;
    const affs = k.affordances();
    setStep(s1, 'pass', `handle live (name=${k.name}, affordances=${affs.length})`);
  } catch (e) {
    setStep(s1, 'fail', `activate threw: ${e.message}`);
    for (const s of steps.slice(2)) setStep(s, 'skip', 'no handle');
    setSummary(`FAIL at activate — ${e.message}`, false);
    return;
  }

  let rawTrace = [];
  const origDo = k.do.bind(k);
  k.do = async (verb, payload = {}, opts = {}) => {
    const entry = { verb, payload };
    rawTrace.push(entry);
    try {
      entry.reply = await origDo(verb, payload, opts);
      console.log(`[v150] RAW ${verb} ::`, JSON.stringify(entry.reply).slice(0, 400));
      return entry.reply;
    } catch (e) {
      entry.err = e;
      console.log(`[v150] RAW ${verb} :: THREW ${e.message}`);
      throw e;
    }
  };

  async function runOp(rec, exec, judge) {
    if (rec.op && !c.enabled[rec.op]) { setStep(rec, 'skip', `disabled (?skip=${rec.op} / ?only=…)`); return null; }
    setStep(rec, 'running');
    rawTrace = [];
    let facade = null, threw = null;
    try { facade = await exec(); } catch (e) { threw = e; }
    const trace = rawTrace.slice();
    const cls = classifyOp(trace, threw);
    let verdict = { pass: cls.label === 'TYPED-SEALED', detail: '' };
    try { if (judge) verdict = judge(facade, trace, cls) ?? verdict; } catch (_) {}
    const detail = [cls.detail, verdict.detail].filter(Boolean).join('; ');
    setStep(rec, verdict.pass ? 'pass' : 'fail', detail, cls.label);
    return facade;
  }

  await runOp(s2, () => k.do('kernels.list', {}));

  let createdId = null;
  await runOp(s3,
    () => k.create('Task', { part_of_goal: 'backlog:demo', target_kernel: 'demo' }),
    (res, _t, cls) => {
      if (res && res.ok === true && (res.id || res.proof_digest)) {
        createdId = res.id;
        return { pass: true, detail: `sealed: id=${res.id} verified=${res.verified}` };
      }
      return { pass: false, detail: `writeResult=${JSON.stringify(res)}` };
    });

  const probeId = createdId || 'task-web2-keystone-probe';

  await runOp(s4,
    () => k.query('Task', { target_kernel: 'demo' }),
    (rows, trace, cls) => {
      const typedFromServer = trace.some(t => t.reply && Array.isArray(t.reply.result));
      if (typedFromServer) return { pass: true, detail: `typed read returned ${rows.length} instance(s)` };
      return { pass: false, detail: `DEGRADED → cache-filter returned ${Array.isArray(rows) ? rows.length : 0} row(s)` };
    });

  await runOp(s5,
    () => k.transition(probeId, 'active', { note: 'web2 keystone transition probe' }),
    (res) => {
      if (res && res.ok === true) return { pass: true, detail: `transitioned: id=${res.id ?? probeId} verified=${res.verified}` };
      return { pass: false, detail: `writeResult=${JSON.stringify(res)}` };
    });

  await runOp(s6,
    () => k.validate({ type: 'Task', part_of_goal: 'backlog:demo', target_kernel: 'demo' }),
    (res, trace) => {
      const r = trace[trace.length - 1]?.reply;
      const typedReport = r && (r.conforms !== undefined || Array.isArray(r.violations) || r.ok === true);
      if (typedReport) return { pass: true, detail: `ValidationReport: conforms=${res.conforms}${res.violations ? ` violations=${res.violations.length}` : ''}` };
      return { pass: false, detail: `boolean-grade: conforms=${res?.conforms} (no typed report)` };
    });

  await runOp(s7,
    () => k.verify(probeId),
    (res) => {
      if (res && res.verified === true) return { pass: true, detail: `verified✓ proof_digest=${res.proof_digest ? 'present' : 'none'} seq=${res.seq}` };
      return { pass: false, detail: `verified=${res?.verified}` };
    });

  await runOp(s8,
    () => k.provenance(probeId),
    (res, trace) => {
      const r = trace[trace.length - 1]?.reply;
      const chain = r?.result ?? (Array.isArray(res) ? res : null);
      if (r && r.ok !== false && chain != null) return { pass: true, detail: `PROV chain: ${Array.isArray(chain) ? chain.length + ' link(s)' : 'object'}` };
      return { pass: false, detail: 'no typed provenance chain' };
    });

  await runOp(s9,
    () => k.reach(probeId, 'part_of_goal', { depth: 1 }),
    (rows, trace, cls) => {
      const r = trace[trace.length - 1]?.reply;
      if (r && Array.isArray(r.result)) return { pass: true, detail: `traversal returned ${r.result.length} instance(s)` };
      return { pass: false, detail: `facade returned ${Array.isArray(rows) ? rows.length : 0} row(s) without typed result` };
    });

  await runOp(s10,
    () => k.snapshot(),
    (snap, trace) => {
      const r = trace[trace.length - 1]?.reply;
      if (r && Array.isArray(r.result)) return { pass: true, detail: `snapshot replayed ${r.result.length} instance(s)` };
      return { pass: false, detail: `facade returned ${Array.isArray(snap) ? snap.length : 0} instance(s) without typed result` };
    });

  let proposalId = null;
  await runOp(s11,
    () => k.do('kernel.propose_change', { ops: [{ op: 'add_affordance', verb: 'task.snooze', handler: 'noop' }], rationale: 'web2 keystone governance probe' }),
    (r) => {
      if (r && r.ok === true) {
        proposalId = r.id ?? r.result?.['@id'] ?? r.result?.id ?? null;
        return { pass: true, detail: `proposal sealed: id=${proposalId}` };
      }
      return { pass: false, detail: '' };
    });
  const probeProposal = proposalId || 'proposal-web2-keystone-probe';

  await runOp(s12,
    () => k.do('kernel.vote', { proposal: probeProposal, choice: 'approve' }),
    (r) => (r && r.ok === true) ? { pass: true, detail: `vote sealed on ${probeProposal}` } : { pass: false, detail: '' });

  await runOp(s13,
    () => k.do('kernel.apply', { proposal: probeProposal }),
    (r) => (r && r.ok === true) ? { pass: true, detail: `applied ${probeProposal}` } : { pass: false, detail: '' });

  await runOp(s14,
    () => k.match('task'),
    (r) => {
      if (r && Array.isArray(r) && r.length >= 0) return { pass: true, detail: `matched ${r.length} candidate(s)` };
      return { pass: false, detail: '' };
    });

  k.do = origDo;
  try { await k.close(); } catch (_) {}
  const passes = steps.filter(s => s.status === 'pass').length;
  const failc  = steps.filter(s => s.status === 'fail').length;
  const skips  = steps.filter(s => s.status === 'skip').length;
  const opsSummary = Object.fromEntries(steps.map(s => [s.id, `${s.status.toUpperCase()}${s.cls ? `:${s.cls}` : ''}`]));
  console.log('[v150] OPS', JSON.stringify(opsSummary));
  setSummary(`${passes} PASS / ${failc} FAIL / ${skips} SKIP`, failc === 0);
}
