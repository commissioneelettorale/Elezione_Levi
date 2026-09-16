'use strict';
// Admin-only, explicitly invoked maintenance. Never logs identities or codes.
const Codes = require('./voter-token-code');
const Policy = require('./election-policy');
const VOTED = ['hasVoted','voted_consiglio','voted_istituto','voted_consulta','voted_classe_studente','voted_classe_genitore'];
const BALLOTS = ['voti_consiglio','voti_istituto','voti_consulta','voti_classe_studenti','voti_classe_genitori','credenziali_anonime'];
const META = ['tipo', ...VOTED, 'activeSessionHash', 'sessionExpiresAt'];
function stop(code) { throw Object.assign(new Error(code), { code }); }
// Firestore returns maps in key order, independent of insertion order.
function sameCounts(left, right) {
  return Object.keys(Codes.PREFIXES).every(type => Number.isInteger(left?.[type]) && left[type] === right?.[type]);
}
function preparation(config, state, now) {
  if (state.procedureClosed || state.voterRollFinal || state.votingReview?.stage === 'AUTHORIZED') stop('PROCEDURE_FROZEN');
  if ((Number(config.votingStartsAtMs) > 0 && now >= Number(config.votingStartsAtMs)) ||
      Object.keys(Policy.ELECTIONS).some(key => Policy.windows(config, key).some(w => now >= +w.start))) stop('VOTING_ALREADY_STARTED');
}
function eligible(data, now) {
  if (!Codes.PREFIXES[data.tipo]) stop('UNKNOWN_VOTER_TYPE');
  if (VOTED.some(field => data[field] === true)) stop('VOTER_ALREADY_USED');
  const expiry = data.sessionExpiresAt?.toMillis?.() || 0;
  if (data.activeSessionHash && expiry > now) stop('ACTIVE_VOTER_SESSION');
}
function summary(snapshot) {
  const counts = Object.fromEntries(Object.keys(Codes.PREFIXES).map(type => [type, 0]));
  let remaining = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!Codes.PREFIXES[data.tipo]) stop('UNKNOWN_VOTER_TYPE');
    counts[data.tipo]++;
    if (!Codes.matches(doc.id, data.tipo)) remaining++;
  }
  return { total: snapshot.size, counts, remaining };
}
async function migrate({ db, year, migrationId, apply = false, now = () => Date.now(), timestamp = () => new Date(), onProgress = () => {} }) {
  if (!/^20\d{2}\/20\d{2}$/.test(year) || !/^[a-z0-9-]{1,100}$/.test(migrationId)) stop('INVALID_MIGRATION_REQUEST');
  const suffix = year.replace('/', '_');
  const root = db.collection('artifacts').doc('iis-levi-electoral-v3').collection('public').doc('data');
  const collection = name => root.collection(name + '_' + suffix);
  const tokens = collection('tokens'), stateRef = collection('regolarita').doc('state');
  const configRef = root.collection('config').doc('yearly_settings_' + suffix);
  const migrationRef = collection('migrazioni_token').doc(migrationId);
  const backup = migrationRef.collection('backup');
  const global = await root.collection('config').doc('settings_v3').get();
  if (global.data()?.annoScolastico !== year) stop('ACTIVE_YEAR_MISMATCH');
  let began = false;
  try {
    const plan = await db.runTransaction(async tx => {
      const [c, s, m, roll, ...occupied] = await Promise.all([
        tx.get(configRef), tx.get(stateRef), tx.get(migrationRef), tx.get(tokens.select(...META)),
        ...BALLOTS.map(name => tx.get(collection(name).limit(1)))
      ]);
      const config = c.data() || {}, state = s.data() || {}, previous = m.data() || {}, stats = summary(roll);
      if (previous.status === 'COMPLETE') {
        if (stats.remaining) stop('COMPLETED_MIGRATION_HAS_LEGACY_CODES');
        return { ...stats, migrated: previous.migrated || 0, alreadyComplete: true };
      }
      preparation(config, state, now());
      if (occupied.some(snap => !snap.empty)) stop('BALLOTS_OR_ANONYMOUS_CODES_EXIST');
      if (Codes.migrationPending(state) && state.tokenCodeMigration.id !== migrationId) stop('OTHER_MIGRATION_PENDING');
      roll.docs.forEach(doc => eligible(doc.data(), now()));
      if (previous.initialCounts && !sameCounts(previous.initialCounts, stats.counts)) stop('REGISTER_COUNT_CHANGED');
      if (apply) {
        tx.set(migrationRef, { format: Codes.FORMAT, year, status: 'RUNNING', initialCounts: previous.initialCounts || stats.counts,
          initialTotal: previous.initialTotal ?? stats.total, migrated: previous.migrated || 0, updatedAt: timestamp() }, { merge: true });
        tx.set(stateRef, { tokenCodeMigration: { id: migrationId, status: 'RUNNING', format: Codes.FORMAT } }, { merge: true });
      }
      return { ...stats, migrated: previous.migrated || 0, ids: roll.docs.filter(doc => !Codes.matches(doc.id, doc.data().tipo)).map(doc => doc.id) };
    });
    if (!apply || plan.alreadyComplete) return { year, format: Codes.FORMAT, total: plan.total, counts: plan.counts, remaining: plan.remaining, migrated: plan.migrated, applied: !!plan.alreadyComplete };
    began = true;
    for (let offset = 0; offset < plan.ids.length; offset += 100) {
      const ids = plan.ids.slice(offset, offset + 100);
      const progress = await db.runTransaction(async tx => {
        const [c, s, m] = await Promise.all([tx.get(configRef), tx.get(stateRef), tx.get(migrationRef)]);
        const state = s.data() || {}, record = m.data() || {};
        preparation(c.data() || {}, state, now());
        if (state.tokenCodeMigration?.id !== migrationId || state.tokenCodeMigration?.status !== 'RUNNING') stop('MIGRATION_LOCK_CHANGED');
        const originals = await Codes.readAll(tx, ids.map(id => tokens.doc(id)));
        const existing = originals.filter(doc => doc.exists), replacements = new Map();
        existing.forEach(doc => eligible(doc.data(), now()));
        for (const type of Object.keys(Codes.PREFIXES)) {
          const group = existing.filter(doc => doc.data().tipo === type);
          const allocated = await Codes.allocate(tx, tokens, type, group.length);
          group.forEach((doc, index) => replacements.set(doc.id, allocated[index]));
        }
        const previousBackups = await Codes.readAll(tx, existing.map(doc => backup.doc(doc.id)));
        if (previousBackups.some(doc => doc.exists)) stop('BACKUP_CONFLICT');
        for (const doc of existing) {
          const newId = replacements.get(doc.id), data = doc.data();
          // All fields are copied unchanged, including vote flags and metadata.
          tx.create(backup.doc(doc.id), { newId, data });
          tx.create(tokens.doc(newId), data);
          tx.delete(tokens.doc(doc.id));
        }
        const migrated = (record.migrated || 0) + existing.length;
        tx.set(migrationRef, { migrated, updatedAt: timestamp() }, { merge: true });
        return { migrated, total: plan.total };
      });
      onProgress(progress);
    }
    return await db.runTransaction(async tx => {
      const [c, s, m, roll] = await Promise.all([tx.get(configRef), tx.get(stateRef), tx.get(migrationRef), tx.get(tokens.select(...META))]);
      preparation(c.data() || {}, s.data() || {}, now());
      if (s.data()?.tokenCodeMigration?.id !== migrationId) stop('MIGRATION_LOCK_CHANGED');
      const stats = summary(roll), record = m.data() || {};
      if (stats.remaining || stats.total !== record.initialTotal || !sameCounts(stats.counts, record.initialCounts)) stop('FINAL_VERIFICATION_FAILED');
      const result = { year, format: Codes.FORMAT, total: stats.total, counts: stats.counts, remaining: 0, migrated: record.migrated || 0, applied: true };
      tx.set(migrationRef, { status: 'COMPLETE', completedAt: timestamp(), result }, { merge: true });
      tx.set(stateRef, { tokenCodeMigration: { id: migrationId, status: 'COMPLETE', format: Codes.FORMAT } }, { merge: true });
      tx.create(root.collection('audit_admin').doc(), { action: 'MIGRATE_VOTER_TOKEN_FORMAT', details: result, at: timestamp() });
      return result;
    });
  } catch (error) {
    if (began) await db.runTransaction(async tx => {
      const s = await tx.get(stateRef);
      if (s.data()?.tokenCodeMigration?.id === migrationId && s.data().tokenCodeMigration.status === 'RUNNING') {
        tx.set(stateRef, { tokenCodeMigration: { id: migrationId, status: 'FAILED', format: Codes.FORMAT } }, { merge: true });
        tx.set(migrationRef, { status: 'FAILED', updatedAt: timestamp() }, { merge: true });
      }
    }).catch(() => {});
    throw error;
  }
}
module.exports = { migrate, preparation, eligible, summary };
