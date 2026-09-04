// smoke-adopt-ladder.mjs — v1.6.5 R25–R32: the client rung of the digest ladder, against the
// 0.4.112 substrate (PRE/AT reference band). TDD: RED against v1.6.4.
// Spec: SPEC.CK-LIB-JS.v1.6.5 §3; SPEC.CK-DOOR.v1.6.5 §14; pgCK PASS-15 + PASS-16.
//
// WHAT IS MEASURED vs SYNTHESISED. Every reply shape below is the one measured 2026-09-04 on
// pgck.localhost @ extversion 0.4.112 (spec §0.1 M1–M9): validate answers `reference` +
// check-keyed `warnings` for core#Adoption bodies (and NO reference key for other types);
// create replies carry the same band; adoption.check is payload-blind and seat-scoped.
// The fake door is DECLARED. FIXTURE DIGESTS are labelled — never the bench's (build rule 8).
// Run: node tests/smoke-adopt-ladder.mjs
import { ConceptKernel } from '../ck.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
const store = { ingest() {}, retire() {}, get: () => undefined };
const CORE = 'https://conceptkernel.org/ontology/v3.11/core#';
const WAVE = 'urn:ckp:module:wave';
const FIX_REC = 'a'.repeat(64);            // FIXTURE: "the loader record"
const FIX_SUP = 'b'.repeat(64);            // FIXTURE: "a caller's transcription"
const attempt = async (fn) => { try { return { v: await fn(), e: null }; } catch (e) { return { v: null, e }; } };

/** A fake 0.4.112 door. `placed` = modules with a loader record (null record = pgRDF#120);
 *  `graphed` = projects that hold graphs; `rows` = this seat's adoption.check rows. */
const door = ({ state = 'germinated', epoch = 3, placed = { [WAVE]: FIX_REC }, graphed = ['urn:ckp:project:ck-lib-js'],
                rows = [], sealOk = true, checkFault = false, referenceBand = true, engine = null } = {}) => {
  const calls = [];
  const ref = (b) => {
    if (!referenceBand || b.type !== `${CORE}Adoption`) return {};
    const resolves = Object.prototype.hasOwnProperty.call(placed, b.adopts);
    const rec = resolves ? placed[b.adopts] : null;
    const target = b.intoProject == null ? null : graphed.includes(b.intoProject);
    const match = (b.sourceDigest == null || rec == null) ? null : (b.sourceDigest === rec);
    const warnings = [];
    if (!resolves) warnings.push({ ok: false, check: 'moduleResolves', resultMessage: `the adopts IRI (${b.adopts}) names NO non-empty graph in this store — sealed, this adoption composes NOTHING (the census's malformed class).`, resultSeverity: 'sh:Warning' });
    if (match === false) warnings.push({ ok: false, check: 'sourceDigestMatch', resultMessage: `the claimed sourceDigest does not match the loader's record for these bytes (sourceRecorded ${rec}) — doctrine wearing a digest.`, resultSeverity: 'sh:Warning' });
    if (target === false) warnings.push({ ok: false, check: 'targetHasGraphs', resultMessage: `intoProject (${b.intoProject}) reduces to a project segment with NO graphs in this store (the census's orphaned class).`, resultSeverity: 'sh:Warning' });
    return { reference: { moduleResolves: resolves, sourceRecorded: rec, targetHasGraphs: target, sourceDigestMatch: match }, warnings };
  };
  const shacl = (b) => {
    if (b.type === `${CORE}Adoption`) return ['adopts', 'intoProject', 'intoEpoch', 'sourceDigest'].filter((k) => b[k] == null)
      .map((k) => ({ resultPath: `${CORE}${k}`, resultMessage: 'MinCount(1) not satisfied', resultSeverity: 'sh:Violation', sourceConstraintComponent: 'http://www.w3.org/ns/shacl#MinCountConstraintComponent' }));
    if (b.type === `${CORE}Supersession`) return b.supersedes ? [] : [{ resultPath: `${CORE}supersedes`, resultMessage: 'MinCount(1) not satisfied', resultSeverity: 'sh:Violation', sourceConstraintComponent: 'http://www.w3.org/ns/shacl#MinCountConstraintComponent' }];
    return [];
  };
  let sealedIds = 0;
  const k = new ConceptKernel('ckp://Kernel#ck-lib-js', {
    auth: { claims: { sub: '1f0951f0-0000-0000-0000-000000000000' } },
    async dispatch(verb, _kernel, payload) {
      calls.push({ verb, payload });
      switch (verb) {
        case 'surface.check':     return { ok: true, kernel: 'ck-lib-js', state, epoch, ...(engine ? { engineIdentity: engine } : {}) };
        case 'instance.validate': { const v = shacl(payload); return { ok: true, conforms: v.length === 0, violations: v, warnings: [], ...ref(payload) }; }
        case 'adoption.check':
          if (checkFault && sealedIds) throw new Error('timeout');
          return { ok: true, drifted: false, modules: rows };
        case 'instance.create': {
          if (!sealOk) return { ok: false, refused: true, sqlstate: '22023', error: 'shape_violation' };
          sealedIds++; const id = `${payload.type === `${CORE}Supersession` ? 'supersession' : 'adoption'}-${sealedIds}`;
          return { ok: true, id, verified: true, createdBy: 'urn:ckp:participant:1f0951f0-…', ...ref(payload) };
        }
        case 'instance.get':      return payload.id === 'nope' ? { ok: false, refused: true, sqlstate: '42704', error: 'unknown_instance' } : { ok: true, instance: { body: { '@id': `ckp://Adoption#${String(payload.id).replace(/^.*[#:]/, '')}`, type: `${CORE}Adoption` } } };
        case 'fleet.adoptions':   return { ok: true, adoptions: [], malformedCount: 0, orphanedCount: 0 };
        case 'integrity.check':   return { ok: true, healthy: true, findings: [] };
        default: return { ok: false, refused: true, sqlstate: '42704', error: 'unknown_affordance' };
      }
    },
  }, store, [], {});
  return { k, calls, verbs: () => calls.map((c) => c.verb), payloads: (v) => calls.filter((c) => c.verb === v).map((c) => c.payload) };
};
const ROW = { module: WAVE, sourceRecorded: FIX_REC, sourceLoads: 1, sourceDigestVerifiable: true, sourceDigest: FIX_REC, sourceDigestMatch: true, drifted: false };

console.log('R30 — validate(): two bands, never folded, verbatim');
{
  const { k } = door();
  const r = await k.validate({ type: `${CORE}Adoption`, adopts: WAVE, intoProject: 'urn:ckp:project:ck-lib-js', intoEpoch: 3, sourceDigest: FIX_SUP });
  ok('a WRONG digest is conforms:true (shape-only) AND reference.sourceDigestMatch:false — both visible', r.conforms === true && r.reference?.sourceDigestMatch === false);
  ok('warnings pass through verbatim; the check-keyed one is the reference band', Array.isArray(r.warnings) && r.referenceWarnings?.length === 1 && r.referenceWarnings[0].check === 'sourceDigestMatch' && r.shapeWarnings?.length === 0);
  ok('sourceRecorded rides on the reply', r.reference?.sourceRecorded === FIX_REC);
  const n = await k.validate({ type: `${CORE}Kernel`, label: 'x' });
  ok('NEGATIVE CONTROL — a non-Adoption body has reference:null (type-scoped band, never invented)', n.reference === null);
}

console.log('R25.1 — recorded(): the loader record BEFORE adoption, one read, no digest sent');
{
  const { k, verbs, payloads } = door({ rows: [] });
  const { v, e } = await attempt(() => k.adoption.recorded(WAVE));
  ok('recorded(wave) returns sourceRecorded on a seat that has NOT adopted it (R-34 met at 0.4.112)', !e && v?.sourceRecorded === FIX_REC && v?.moduleResolves === true);
  ok('it dispatched exactly ONE instance.validate and nothing else', JSON.stringify(verbs()) === '["instance.validate"]');
  ok('the probe body is {type, adopts} — no digest fabricated, no seat read', payloads('instance.validate')[0].sourceDigest === undefined && Object.keys(payloads('instance.validate')[0]).length === 2);
}
{
  const { k } = door({ placed: {} });
  const { v } = await attempt(() => k.adoption.recorded('urn:ckp:module:doesnotexist'));
  ok('a nonexistent module → moduleResolves:false, sourceRecorded:null (absence, stated)', v?.moduleResolves === false && v?.sourceRecorded === null);
}
{
  const { k } = door({ referenceBand: false });
  const { v } = await attempt(() => k.adoption.recorded(WAVE));
  ok('a door WITHOUT the reference band (pre-0.4.112) → reference:null + note naming R-34 — the door\'s capability, never a guess', v?.reference === null && /R-34/.test(v?.note ?? ''));
}
{
  const { k } = door();
  k._transport.dispatch = async () => ({ ok: false, refused: true, sqlstate: '42704', error: 'unknown_affordance' });
  const { e } = await attempt(() => k.adoption.recorded(WAVE));
  ok('a PROCEDURAL refusal throws verbatim', !!e && e.refused === true && e.sqlstate === '42704');
}

console.log('R25.3 — row(): the confirmation read, filtered client-side (adoption.check is payload-blind)');
{
  const { k, verbs } = door({ rows: [ROW] });
  const { v } = await attempt(() => k.adoption.row(WAVE));
  ok('row(wave) is the adoption.check row verbatim (sourceLoads lives ONLY here)', v?.sourceLoads === 1 && v?.drifted === false && JSON.stringify(verbs()) === '["adoption.check"]');
  ok('row() of an un-adopted module is null (not "no such module")', (await k.adoption.row('urn:ckp:module:lexicon')) === null);
}

console.log('R26 — dryRun(): instance.validate IS the dry-run; findings named for the census verdicts');
{
  const { k, verbs, payloads } = door();
  const { v, e } = await attempt(() => k.adoption.dryRun({ adopts: WAVE }));
  ok('clean seat, no digest ⇒ ok:true, derived from the record, zero findings', !e && v?.ok === true && v.findings.length === 0 && v.digest.derived === FIX_REC && v.digest.source === 'recorded');
  ok('the report carries the composed BODY exactly as adopt() would seal it', v?.body?.type === `${CORE}Adoption` && v.body.adopts === WAVE && v.body.intoProject === 'urn:ckp:project:ck-lib-js' && v.body.intoEpoch === 3 && v.body.sourceDigest === FIX_REC && Object.keys(v.body).length === 5);
  ok('reference + warnings + conforms ride verbatim; the PRE on the composed body is all-true', v?.reference?.sourceDigestMatch === true && v.reference.targetHasGraphs === true && v.conforms === true && Array.isArray(v.warnings));
  ok('reads: surface.check · adoption.check · validate(probe) · validate(composed) — and NO instance.create', !verbs().includes('instance.create') && payloads('instance.validate').length === 2 && payloads('instance.validate')[1].sourceDigest === FIX_REC);
}
{
  const { k } = door({ placed: {} });
  const { v } = await attempt(() => k.adoption.dryRun({ adopts: 'urn:ckp:module:doesnotexist' }));
  ok('NEGATIVE CONTROL — moduleResolves:false ⇒ module_absent (refuse), carrying the door\'s OWN prose (malformed)', v?.ok === false && v.findings.some((f) => f.code === 'module_absent' && f.severity === 'refuse' && f.check === 'moduleResolves' && /malformed/.test(f.message)));
  ok('…and digest_underivable rides beside it (nothing recorded for a graph that is not there)', v?.findings.some((f) => f.code === 'digest_underivable'));
}
{
  const { k } = door({ graphed: [] });
  const { v } = await attempt(() => k.adoption.dryRun({ adopts: WAVE }));
  ok('targetHasGraphs:false ⇒ target_no_graphs (refuse) — the DOOR\'s verdict, not a client inference from seat state', v?.ok === false && v.findings.some((f) => f.code === 'target_no_graphs' && f.check === 'targetHasGraphs' && /orphaned/.test(f.message)));
}
{
  const { k } = door({ state: 'named' });
  const { v } = await attempt(() => k.adoption.dryRun({ adopts: WAVE }));
  ok('NEGATIVE CONTROL — a `named` seat whose project HAS graphs is NOT refused (measured: ghosts hold graphs)', v?.ok === true);
}
{
  const { k } = door({ rows: [{ ...ROW, drifted: true, sourceLoads: 2 }] });
  const { v } = await attempt(() => k.adoption.dryRun({ adopts: WAVE }));
  ok('drifted + reloaded (from the row) are WARN findings; ok stays true', v?.ok === true && v.findings.some((f) => f.code === 'module_drifted' && f.severity === 'warn') && v.findings.some((f) => f.code === 'source_reloaded' && f.severity === 'warn'));
}

console.log('R25.2 — the digest rule: a record beats a transcription; absence stops by name');
{
  const { k, payloads } = door();
  const { v } = await attempt(() => k.adoption.dryRun({ adopts: WAVE, sourceDigest: FIX_SUP }));
  ok('supplied ≠ recorded ⇒ digest_disagrees (refuse) with the door\'s prose naming the record', v?.ok === false && v.findings.some((f) => f.code === 'digest_disagrees' && f.check === 'sourceDigestMatch' && f.message.includes(FIX_REC)) && v.digest.agrees === false);
  ok('a supplied digest is validated in ONE call (no probe)', payloads('instance.validate').length === 1);
  const { v: v2 } = await attempt(() => k.adoption.dryRun({ adopts: WAVE, sourceDigest: FIX_SUP, transcribed: true }));
  ok('NEGATIVE CONTROL — transcribed:true does NOT override a record', v2?.ok === false && v2.findings.some((f) => f.code === 'digest_disagrees'));
  const { v: v3 } = await attempt(() => k.adoption.dryRun({ adopts: WAVE, sourceDigest: FIX_REC }));
  ok('supplied === recorded ⇒ agrees:true, source recorded, no finding', v3?.ok === true && v3.digest.source === 'recorded' && v3.digest.agrees === true);
  const { v: v4 } = await attempt(() => k.adoption.dryRun({ adopts: WAVE, sourceDigest: 'not-a-digest' }));
  ok('a malformed value ⇒ digest_malformed BEFORE any I/O', v4?.ok === false && v4.findings[0].code === 'digest_malformed' && v4.findings[0].read === 'local');
}
{
  const { k } = door({ placed: { [WAVE]: null } });        // placed, but the load was never recorded (pgRDF#120)
  const { v } = await attempt(() => k.adoption.dryRun({ adopts: WAVE }));
  ok('no record (pgRDF#120), no value ⇒ digest_underivable naming #120 and the escape', v?.ok === false && v.findings.some((f) => f.code === 'digest_underivable' && /120/.test(f.message) && /transcribed/.test(f.message)));
  const { v: v2 } = await attempt(() => k.adoption.dryRun({ adopts: WAVE, sourceDigest: FIX_SUP }));
  ok('no record, value WITHOUT opt-in ⇒ still underivable', v2?.ok === false && v2.findings.some((f) => f.code === 'digest_underivable'));
  const { v: v3 } = await attempt(() => k.adoption.dryRun({ adopts: WAVE, sourceDigest: FIX_SUP, transcribed: true }));
  ok('no record, value WITH opt-in ⇒ accepted as transcribed, sourceDigestMatch null carried as a WARN', v3?.ok === true && v3.digest.source === 'transcribed' && v3.body.sourceDigest === FIX_SUP && v3.findings.some((f) => f.code === 'digest_unverifiable' && f.severity === 'warn'));
}
{
  const { k } = door({ referenceBand: false });
  const { v } = await attempt(() => k.adoption.dryRun({ adopts: WAVE }));
  ok('a door without the band ⇒ underivable naming the pre-0.4.112 surface, plus reference_unavailable (warn)', v?.ok === false && v.findings.some((f) => f.code === 'digest_underivable' && /0\.4\.112/.test(f.message)) && v.findings.some((f) => f.code === 'reference_unavailable'));
}

console.log('R27 — adopt(): dry-run → seal (AT band on the receipt) → confirmation');
{
  const { k, verbs, payloads } = door({ rows: [ROW] });
  const { v, e } = await attempt(() => k.adoption.adopt({ adopts: WAVE }));
  ok('adopt() seals the derived body and returns a receipt', !e && v?.ok === true && v.id === 'adoption-1' && v.digestSource === 'recorded');
  ok('THE AT BAND: the create reply\'s reference + warnings ride on the receipt verbatim', v?.reference?.sourceDigestMatch === true && Array.isArray(v.warnings));
  ok('the seal payload is exactly the dry-run body', JSON.stringify(payloads('instance.create')[0]) === JSON.stringify(v.dryRun.body));
  const seal = verbs().indexOf('instance.create');
  ok('reads precede the seal; the confirmation adoption.check follows it', seal > verbs().indexOf('instance.validate') && verbs().lastIndexOf('adoption.check') > seal);
  ok('confirmation carries the R17.3 verdict (sourceLoads from the row)', v?.check?.verdict === 'verified' && v.check.sourceLoads === 1);
  ok('the receipt is a Ref', typeof v?.verify === 'function');
}
{
  const { k, verbs } = door({ placed: {} });
  const { v, e } = await attempt(() => k.adoption.adopt({ adopts: 'urn:ckp:module:doesnotexist' }));
  ok('a refuse finding THROWS locally — refused:false, sqlstate:null, localGuard R25, findings attached', !v && !!e && e.refused === false && e.sqlstate === null && e.localGuard === 'R25' && e.findings.some((f) => f.code === 'module_absent'));
  ok('NEGATIVE CONTROL — nothing was sealed', !verbs().includes('instance.create'));
}
{
  const { k } = door({ placed: { [WAVE]: null }, rows: [{ ...ROW, sourceRecorded: null, sourceDigestVerifiable: false, sourceDigestMatch: null }] });
  const { v, e } = await attempt(() => k.adoption.adopt({ adopts: WAVE, sourceDigest: FIX_SUP, transcribed: true }));
  ok('transcribed path: ok:true, digestSource transcribed, AT band null-match, confirmation verdict unknown — a seal is not a verification', !e && v?.ok === true && v.digestSource === 'transcribed' && v.reference?.sourceDigestMatch === null && v.check?.verdict === 'unknown');
}
{
  const { k } = door({ sealOk: false });
  const { v, e } = await attempt(() => k.adoption.adopt({ adopts: WAVE }));
  ok('a WIRE refusal at the seal returns verdict-shaped (T-D2), no confirmation attempted', !e && v?.ok === false && v.refused === true && v.sqlstate === '22023' && v.check === undefined);
}
{
  const { k } = door({ checkFault: true });
  const { v, e } = await attempt(() => k.adoption.adopt({ adopts: WAVE }));
  ok('R27.2 — a faulted confirmation keeps the landed seal: ok:true, id kept, check:null, checkError named', !e && v?.ok === true && v.id === 'adoption-1' && v.check === null && /timeout/.test(v.checkError ?? ''));
}

console.log('R28 — create() on core#Adoption takes the ladder; other types do not');
{
  const { k, verbs } = door({ rows: [ROW] });
  const { v, e } = await attempt(() => k.create(`${CORE}Adoption`, { adopts: WAVE }));
  ok('create(Adoption) routes through adopt()', !e && v?.digestSource === 'recorded' && verbs().indexOf('instance.validate') < verbs().indexOf('instance.create'));
}
{
  const { k, verbs } = door();
  await attempt(() => k.create('urn:ckp:ck-lib-js/type/BeatNote', { text: 'x' }));
  ok('NEGATIVE CONTROL — a non-Adoption create dispatches NO pre-flight reads', JSON.stringify(verbs()) === '["instance.create"]');
  const w = await k.create('urn:ckp:ck-lib-js/type/BeatNote', { text: 'y' });
  ok('writeResult is null-honest for reference/warnings on a seal that carries none', w.reference === null && w.warnings === null);
}

console.log('R32 — supersede(): cites the sealed @id READ OFF THE DOOR, never composed');
{
  const { k, payloads, verbs } = door();
  const { v, e } = await attempt(() => k.adoption.supersede('adoption-1788558879271784000'));
  ok('a bare receipt id → instance.get first, then the Supersession cites the SEALED @id verbatim (ckp://Adoption#…)', !e && v?.ok === true && v.supersedes === 'ckp://Adoption#adoption-1788558879271784000' && payloads('instance.create')[0].supersedes === v.supersedes);
  ok('read precedes write', verbs().indexOf('instance.get') < verbs().indexOf('instance.create'));
  const { v: v2 } = await attempt(() => k.adoption.supersede('urn:ckp:instance:adoption-1788558879271784000'));
  ok('an E-5 form is ALSO resolved through the door and re-cited as the sealed @id (never forwarded as typed)', v2?.supersedes === 'ckp://Adoption#adoption-1788558879271784000');
  const { e: e2 } = await attempt(() => k.adoption.supersede(WAVE));
  ok('NEGATIVE CONTROL — the MODULE IRI form is refused LOCALLY by name (SPORE §5.1b), no read, no write', !!e2 && e2.localGuard === 'R32' && e2.refused === false);
  const { e: e3 } = await attempt(() => k.adoption.supersede('nope'));
  ok('an unresolvable id → E-5\'s 42704 refusal thrown verbatim, nothing sealed', !!e3 && e3.refused === true && e3.sqlstate === '42704' && payloads('instance.create').length === 2);
}

console.log('R29 — census() and integrity() facades');
{
  const { k, verbs } = door();
  const { v } = await attempt(() => k.adoption.census());
  ok('census() reaches fleet.adoptions', Array.isArray(v?.adoptions) && verbs().includes('fleet.adoptions'));
  const { v: i } = await attempt(() => k.integrity());
  ok('integrity() reaches integrity.check', i?.healthy === true && verbs().includes('integrity.check'));
  k._transport.dispatch = async () => ({ ok: false, refused: true, sqlstate: '42704', error: 'unknown_affordance' });
  const { e } = await attempt(() => k.adoption.census());
  ok('a refusal throws verbatim', !!e && e.refused === true && e.sqlstate === '42704');
}

console.log('R31 — doorIdentity(): diverged is the documented lag, extversion is the law surface');
{
  const { k } = door({ engine: { state: 'diverged', version: '0.4.111', build_id: 'v0.4.111', extversion: '0.4.112', agreement: false } });
  const { v, e } = await attempt(() => k.doorIdentity());
  ok('diverged never throws; lawSurface === extversion; agreement stays false (never softened)', !e && v?.state === 'diverged' && v.lawSurface === '0.4.112' && v.agreement === false);
  ok('the note names the lag AND the cure, and forbids gating on version()', /restart/.test(v?.note ?? '') && /version\(\)/.test(v?.note ?? ''));
}
{
  const { k } = door({ engine: { state: 'agree', version: '0.4.112', build_id: 'v0.4.112', extversion: '0.4.112', agreement: true } });
  const { v } = await attempt(() => k.doorIdentity());
  ok('NEGATIVE CONTROL — agree carries no note', v?.note === null && v.lawSurface === '0.4.112');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
