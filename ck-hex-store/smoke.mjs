/**
 * smoke.mjs — exercise CKHexStore's core flow without NATS / pgCK.
 *
 * Run: node ck-hex-store/smoke.mjs
 *
 * Covers:
 *   1. Insert JSON-LD body → quads land, types and edges visible via match/inflate
 *   2. CKSubject sync accessor (get / types / edges / reverseEdges)
 *   3. URN bind dispatch (Kernel#K/<verb>, Instance#X, Edge#P, '*')
 *   4. CKView reactive change event
 *   5. invoke() trace correlation with a mock result
 *   6. Local-handle allocation + remap when ck.handleForIri starts answering
 *
 * Asserts via `node:assert` — exits non-zero on failure.
 */

import assert from 'node:assert/strict';
import { CKHexStore } from './ck-hex-store.js';

// ── Minimal CKClient stub ──────────────────────────────────────────────
function makeCk(kernel = 'pgCK.Task') {
    const handlers = { event: [], result: [], error: [], broadcast: [], status: [] };
    let dictVersion = 0;
    const dict = new Map();      // iri → handle (canonical, empty at start)
    let traceCounter = 0;
    const sent = [];

    return {
        kernel,
        get dictVersion() { return dictVersion; },
        handleForIri(iri) { return dict.has(iri) ? dict.get(iri) : null; },
        iriForHandle(h) { for (const [k, v] of dict) if (v === h) return k; return null; },
        on(name, fn) { handlers[name]?.push(fn); },
        off(name, fn) { const a = handlers[name]; if (!a) return; const i = a.indexOf(fn); if (i > -1) a.splice(i, 1); },
        async send(body) {
            const traceId = `tx-${++traceCounter}`;
            sent.push({ body, traceId });
            return traceId;
        },
        // test hooks
        _emit(name, msg) { for (const fn of handlers[name] || []) fn(msg); },
        _setCanonicalHandle(iri, h) { dict.set(iri, h); dictVersion += 1; },
        _sent: sent,
    };
}

function envelope({ kernel, verb, subjectIri, conceptType, data, kind = 'event' }) {
    return {
        subject: `event.kernel.${kernel}.${verb}`,
        headers: {},
        data,
        traceId: '',
        kind,
        subjectIri,
        conceptType,
        kernel,
        verb,
    };
}

function header(name) { console.log(`\n── ${name} ──`); }
function pass(name) { console.log(`  ✓ ${name}`); }

// ── Test 1: insert JSON-LD body → quads land ───────────────────────────
header('1. Insert JSON-LD → quads land');
{
    const ck = makeCk();
    const store = new CKHexStore(ck);
    const msg = envelope({
        kernel: 'pgCK.Task',
        verb: 'sealed',
        subjectIri: 'ckp://Instance#FC-T-0001',
        conceptType: 'https://conceptkernel.org/ontology/v3.8/Task',
        data: {
            '@id': 'ckp://Instance#FC-T-0001',
            '@type': 'https://conceptkernel.org/ontology/v3.8/Task',
            'ckp://Edge#title': 'Rotate SPIFFE SVIDs',
            'ckp://Edge#priority': 4,
            'ckp://Edge#lifecycle_state': 'pending',
            'ckp://Edge#goal_id': { '@id': 'ckp://Goal#G_Docking:v1.0' },
            'ckp://Edge#tag': ['security', 'urgent'],
        },
    });
    const added = store.insert(msg);
    assert.equal(added.length, 7, `expected 7 quads (1 rdf:type + title + priority + lifecycle + goal_id + 2 tags), got ${added.length}`);
    pass(`inserted 7 quads; store.size = ${store.size}`);
    assert.equal(store.size, 7);
    pass('store.size matches');

    // Duplicate insert is a no-op
    const again = store.insert(msg);
    assert.equal(again.length, 0, 'duplicate insert should add 0');
    pass('duplicate insert is a no-op');
}

// ── Test 2: CKSubject sync accessor ────────────────────────────────────
header('2. CKSubject sync accessor');
{
    const ck = makeCk();
    const store = new CKHexStore(ck);
    store.insert(envelope({
        kernel: 'pgCK.Task',
        verb: 'sealed',
        subjectIri: 'ckp://Instance#FC-T-0001',
        conceptType: 'https://conceptkernel.org/ontology/v3.8/Task',
        data: {
            '@id': 'ckp://Instance#FC-T-0001',
            '@type': 'https://conceptkernel.org/ontology/v3.8/Task',
            'ckp://Edge#title': 'Rotate SPIFFE SVIDs',
            'ckp://Edge#priority': 4,
            'ckp://Edge#goal_id': { '@id': 'ckp://Goal#G_Docking:v1.0' },
        },
    }));
    const subj = store.urn('ckp://Instance#FC-T-0001');
    assert.ok(subj, 'subject should exist');
    pass('subject exists');

    const title = subj.get('ckp://Edge#title');
    assert.deepEqual(title, { v: 'Rotate SPIFFE SVIDs' }, `got ${JSON.stringify(title)}`);
    pass('get(title) returns literal record');

    const priority = subj.get('ckp://Edge#priority');
    assert.deepEqual(priority, { v: '4', dt: `${'http://www.w3.org/2001/XMLSchema#'}integer` });
    pass('get(priority) returns typed literal');

    const goal = subj.get('ckp://Edge#goal_id');
    assert.equal(goal, 'ckp://Goal#G_Docking:v1.0', `expected IRI string, got ${JSON.stringify(goal)}`);
    pass('get(goal_id) returns IRI (object ref)');

    const types = subj.types();
    assert.deepEqual(types, ['https://conceptkernel.org/ontology/v3.8/Task']);
    pass('types() returns rdf:type values');

    const edgeCount = Array.from(subj.edges()).length;
    assert.equal(edgeCount, 4, `expected 4 outgoing edges (rdf:type + title + priority + goal_id), got ${edgeCount}`);
    pass(`edges() yields ${edgeCount} outgoing`);

    // Unknown URN → null
    assert.equal(store.urn('ckp://Instance#nonexistent'), null);
    pass('urn(unknown) returns null without triggering fetch');
}

// ── Test 3: URN bind dispatch ──────────────────────────────────────────
header('3. URN bind dispatch');
{
    const ck = makeCk();
    const store = new CKHexStore(ck);

    const seen = { kernelVerb: 0, instance: 0, edge: 0, wildcard: 0, kernel: 0 };
    store.bind('ckp://Kernel#pgCK.Task/sealed', () => { seen.kernelVerb++; });
    store.bind('ckp://Kernel#pgCK.Task',         () => { seen.kernel++; });
    store.bind('ckp://Instance#FC-T-0001',       () => { seen.instance++; });
    store.bind('ckp://Edge#title',               () => { seen.edge++; });
    store.bind('*',                              () => { seen.wildcard++; });

    store.insert(envelope({
        kernel: 'pgCK.Task',
        verb: 'sealed',
        subjectIri: 'ckp://Instance#FC-T-0001',
        conceptType: 'https://conceptkernel.org/ontology/v3.8/Task',
        data: {
            '@id': 'ckp://Instance#FC-T-0001',
            '@type': 'https://conceptkernel.org/ontology/v3.8/Task',
            'ckp://Edge#title': 'X',
        },
    }));
    assert.equal(seen.kernelVerb, 1, 'kernel/verb bind should fire once');
    assert.equal(seen.kernel,     1, 'kernel-only bind should fire once');
    assert.equal(seen.instance,   1, 'instance bind should fire once');
    assert.equal(seen.edge,       1, 'edge bind should fire once (title was written)');
    assert.equal(seen.wildcard,   1, 'wildcard bind should fire once');
    pass('all 5 URN patterns dispatched correctly');

    // Verb-mismatch: bind on a different verb should NOT fire
    let updatedFires = 0;
    store.bind('ckp://Kernel#pgCK.Task/updated', () => { updatedFires++; });
    store.insert(envelope({
        kernel: 'pgCK.Task', verb: 'sealed',
        subjectIri: 'ckp://Instance#FC-T-0002',
        conceptType: 'https://conceptkernel.org/ontology/v3.8/Task',
        data: { '@id': 'ckp://Instance#FC-T-0002', '@type': 'https://conceptkernel.org/ontology/v3.8/Task', 'ckp://Edge#x': 'y' },
    }));
    assert.equal(updatedFires, 0, 'verb mismatch must not fire');
    pass('verb mismatch does not fire');

    // Edge bind: insert a body that does NOT write 'title' → edge bind shouldn't fire
    const edgeFiresBefore = seen.edge;
    store.insert(envelope({
        kernel: 'pgCK.Task', verb: 'updated',
        subjectIri: 'ckp://Instance#FC-T-0003',
        conceptType: 'https://conceptkernel.org/ontology/v3.8/Task',
        data: { '@id': 'ckp://Instance#FC-T-0003', 'ckp://Edge#lifecycle_state': 'done' },
    }));
    assert.equal(seen.edge, edgeFiresBefore, 'edge bind must not fire when predicate absent');
    pass('edge bind filters on predicate correctly');
}

// ── Test 4: CKView reactive change event ───────────────────────────────
header('4. CKView reactive');
{
    const ck = makeCk();
    const store = new CKHexStore(ck);

    const view = store.view('ckp://Instance#FC-T-0001');
    const changes = [];
    view.on('change', (delta) => { changes.push(delta); });

    store.insert(envelope({
        kernel: 'pgCK.Task', verb: 'sealed',
        subjectIri: 'ckp://Instance#FC-T-0001',
        conceptType: 'https://conceptkernel.org/ontology/v3.8/Task',
        data: { '@id': 'ckp://Instance#FC-T-0001', '@type': 'https://conceptkernel.org/ontology/v3.8/Task',
                'ckp://Edge#title': 'V1' },
    }));
    // View change emit is queueMicrotask — let it flush
    await new Promise((r) => queueMicrotask(r));
    await new Promise((r) => queueMicrotask(r));
    assert.equal(changes.length, 1, `expected 1 change emit, got ${changes.length}`);
    pass('change emitted after insert');
    assert.ok(changes[0].added.length >= 1, 'change should report added edges');
    pass(`change.added has ${changes[0].added.length} edges`);

    // Insert event for a different subject → view should NOT fire
    store.insert(envelope({
        kernel: 'pgCK.Task', verb: 'sealed',
        subjectIri: 'ckp://Instance#OTHER',
        conceptType: 'https://conceptkernel.org/ontology/v3.8/Task',
        data: { '@id': 'ckp://Instance#OTHER', 'ckp://Edge#title': 'unrelated' },
    }));
    await new Promise((r) => queueMicrotask(r));
    assert.equal(changes.length, 1, 'unrelated insert must not fire this view');
    pass('view is scoped to its subject');

    view.dispose();
    pass('view disposed cleanly');
}

// ── Test 5: invoke() trace correlation ─────────────────────────────────
header('5. invoke() trace correlation');
{
    const ck = makeCk();
    const store = new CKHexStore(ck);

    const p = store.invoke('ckp://Action#pgCK.Task.create', { title: 'New' }, { timeoutMs: 1000 });

    // Verify the send happened with the right body
    assert.equal(ck._sent.length, 1);
    assert.equal(ck._sent[0].body.action, 'create');
    assert.equal(ck._sent[0].body.title, 'New');
    pass(`ck.send was called with action=create, title=New, traceId=${ck._sent[0].traceId}`);

    // Let _dispatch resume from `await ck.send` and register the pending entry.
    // (Real-world: NATS round-trip > microtask, so this race never occurs in prod.)
    for (let i = 0; i < 4; i++) await Promise.resolve();

    const traceId = ck._sent[0].traceId;
    // Simulate pgCK responding on result.kernel.pgCK.Task.action.create
    ck._emit('result', {
        subject: 'result.kernel.pgCK.Task.action.create',
        headers: { 'Trace-Id': traceId },
        traceId,
        kind: 'result',
        kernel: 'pgCK.Task',
        verb: 'create',
        subjectIri: 'ckp://Instance#FC-T-NEW',
        conceptType: 'https://conceptkernel.org/ontology/v3.8/Task',
        data: {
            trace_id: traceId,
            outcome: 'success',
            '@id': 'ckp://Instance#FC-T-NEW',
            '@type': 'https://conceptkernel.org/ontology/v3.8/Task',
            'ckp://Edge#title': 'New',
            proof: 'sha256:abc',
        },
    });

    const result = await p;
    assert.equal(result.outcome, 'success');
    assert.equal(result.subjectIri, 'ckp://Instance#FC-T-NEW');
    assert.equal(result.proof, 'sha256:abc');
    pass('invoke() resolved with deflated result');

    // The result body should also have landed in the store
    const newSubj = store.urn('ckp://Instance#FC-T-NEW');
    assert.ok(newSubj, 'sealed subject should be in store');
    assert.deepEqual(newSubj.get('ckp://Edge#title'), { v: 'New' });
    pass('result body was inserted into store');
}

// ── Test 6: invoke() timeout ──────────────────────────────────────────
header('6. invoke() timeout');
{
    const ck = makeCk();
    const store = new CKHexStore(ck);
    const p = store.invoke('ckp://Action#pgCK.Task.create', {}, { timeoutMs: 50 });
    try {
        await p;
        assert.fail('should have timed out');
    } catch (e) {
        assert.match(e.message, /timeout/i);
        pass(`rejected with timeout: "${e.message}"`);
    }
}

// ── Test 7: Local-handle allocation + remap ───────────────────────────
header('7. Local-handle allocation + remap');
{
    const ck = makeCk();
    const store = new CKHexStore(ck);

    // No canonical dictionary yet — every IRI gets a local handle from 2^31
    const iri = 'ckp://Instance#FC-T-0001';
    store.insert(envelope({
        kernel: 'pgCK.Task', verb: 'sealed',
        subjectIri: iri,
        conceptType: 'https://conceptkernel.org/ontology/v3.8/Task',
        data: { '@id': iri, '@type': 'https://conceptkernel.org/ontology/v3.8/Task', 'ckp://Edge#title': 'X' },
    }));
    const subj = store.urn(iri);
    assert.ok(subj);
    assert.ok(subj.handle >= 2147483648, `local handle should be ≥ 2^31, got ${subj.handle}`);
    pass(`local handle allocated: ${subj.handle}`);

    // Now pretend pgCK published a Dictionary.snapshot — handleForIri starts answering
    ck._setCanonicalHandle(iri, 42);
    // Next insert triggers remap because ck.dictVersion changed
    store.insert(envelope({
        kernel: 'pgCK.Task', verb: 'updated',
        subjectIri: iri,
        conceptType: null,
        data: { '@id': iri, 'ckp://Edge#lifecycle_state': 'done' },
    }));

    // After remap, the subject's quads are now keyed under handle 42 (canonical)
    const after = store.urn(iri);
    assert.ok(after);
    assert.equal(after.handle, 42, `expected canonical handle 42, got ${after.handle}`);
    pass(`remap moved subject to canonical handle ${after.handle}`);

    // Existing quads should still be reachable through the new handle
    const title = after.get('ckp://Edge#title');
    assert.deepEqual(title, { v: 'X' });
    pass('pre-remap quad is reachable via canonical handle');
}

console.log('\nAll smoke tests passed.\n');
