'use strict';

/**
 * ITSCG Primo Levi - Piattaforma elettorale
 * Backend Firebase Functions (2nd gen)
 *
 * Principi di progetto:
 * - nessun segreto nel browser/repository;
 * - nessun identificativo dell'elettore nella scheda;
 * - nessun timestamp nella scheda;
 * - separazione persistente tra diritto di voto e contenuto del voto;
 * - autorizzazioni server-side per ruolo;
 * - risultati parziali non esposti durante la votazione;
 * - audit solo per operazioni amministrative (mai per il contenuto del voto).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const crypto = require('crypto');

initializeApp();
const db = getFirestore();
const APP_ID = 'iis-levi-electoral-v3';
const REGION = 'europe-west1';

const ALLOWED_STAFF_ROLES = new Set([
  'COMMISSIONE', 'DIRIGENTE', 'VICEPRESIDE', 'DSGA', 'SEGRETERIA'
]);
const MANAGEMENT_ROLES = new Set(['DIRIGENTE', 'VICEPRESIDE', 'DSGA', 'SEGRETERIA']);
const BALLOT_COLLECTIONS = new Set([
  'voti_consiglio', 'voti_istituto', 'voti_consulta',
  'voti_classe_studenti', 'voti_classe_genitori'
]);

const REGULARITY_PRE_VOTE_CONTROLS = Object.freeze([
  'annualCircularRecorded','commissionAppointed','voterRollFinal','candidateListsValidated',
  'ballotApproved','privacyChecked','technicalTestPassed','softwareFrozen',
  'backupPlanReady','incidentPlanReady','communicationPublished'
]);
const REGULARITY_ALL_CONTROLS = new Set([...REGULARITY_PRE_VOTE_CONTROLS,'finalArchiveSealed','appealWindowClosed']);
const regularityStateRef = (year) => yearlyCollection('regolarita', year).doc('state');
const regularityAppeals = (year) => yearlyCollection('reclami_ricorsi', year);
const regularityEvents = (year) => yearlyCollection('eventi_procedimento', year);
const yearSuffix = (year) => String(year || '2026/2027').replace('/', '_');
const dataRoot = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const yearlyCollection = (name, year) => dataRoot().collection(`${name}_${yearSuffix(year)}`);
const yearlyConfigRef = (year) => dataRoot().collection('config').doc(`yearly_settings_${yearSuffix(year)}`);
const globalConfigRef = () => dataRoot().collection('config').doc('settings_v3');
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const normalize = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const canonicalName = (value) => normalize(value).split(' ').filter(Boolean).sort().join(' ');

function safeEqualHex(a, b) {
  const aa = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

function requireAuth(request, allowedRoles = []) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticazione richiesta.');
  const role = String(request.auth.token.role || '').toUpperCase();
  if (allowedRoles.length && !allowedRoles.includes(role)) {
    throw new HttpsError('permission-denied', 'Ruolo non autorizzato.');
  }
  // Gli account gestionali sono validi soltanto fino alla scadenza firmata nel token.
  // L'assenza della claim invalida le vecchie sessioni e forza un nuovo login dopo il deploy.
  if (MANAGEMENT_ROLES.has(role)) {
    const staffExpiresAt = Number(request.auth.token.staffExpiresAt || 0);
    if (!staffExpiresAt || Date.now() >= staffExpiresAt * 1000) {
      throw new HttpsError('permission-denied', 'Credenziali gestionali scadute. Effettuare un nuovo accesso con credenziali valide.');
    }
  }
  if (role === 'COMMISSIONE' && request.auth.token.mustChangePassword === true) {
    throw new HttpsError('failed-precondition', 'Cambio password obbligatorio prima di utilizzare le funzioni della Commissione.');
  }
  return { uid: request.auth.uid, role, claims: request.auth.token };
}

async function loadElectionConfig(year) {
  const snap = await yearlyConfigRef(year).get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Configurazione elettorale annuale non disponibile.');
  return snap.data() || {};
}

function timeZoneOffsetMs(utcMillis, timeZone = 'Europe/Rome') {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(utcMillis))
    .filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return representedAsUtc - utcMillis;
}

function parseItalianDate(dateText, timeText) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(dateText || ''))) return null;
  if (!/^\d{2}:\d{2}$/.test(String(timeText || ''))) return null;
  const [dd, mm, yyyy] = dateText.split('/').map(Number);
  const [hh, min] = timeText.split(':').map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || min > 59) return null;
  const localAsUtc = Date.UTC(yyyy, mm - 1, dd, hh, min, 0);
  let guess = localAsUtc;
  // Due iterazioni risolvono correttamente anche il passaggio CET/CEST.
  for (let i = 0; i < 3; i++) guess = localAsUtc - timeZoneOffsetMs(guess, 'Europe/Rome');
  return new Date(guess);
}

function electionPhase(config) {
  const cal = config.calendario || {};
  const start = parseItalianDate(cal.votingStartDate, cal.votingStartTime);
  const end = parseItalianDate(cal.votingEndDate, cal.votingEndTime);
  const release = parseItalianDate(cal.resultsReleaseDate, cal.resultsReleaseTime);
  const now = Date.now();
  if (start && now < start.getTime()) return 'BEFORE';
  if (end && now <= end.getTime()) return 'OPEN';
  if (config.commissionFinalized === true && release && now >= release.getTime()) return 'RELEASED';
  return 'CLOSED';
}

function assertVotingOpen(config) {
  const phase = electionPhase(config);
  if (phase !== 'OPEN') {
    if (phase === 'BEFORE') throw new HttpsError('failed-precondition', 'Le votazioni non sono ancora aperte.');
    throw new HttpsError('failed-precondition', 'Le votazioni sono chiuse.');
  }
}

async function auditAdmin(actor, action, details = {}) {
  // Mai registrare token di voto, preferenze, sessionId o altri elementi
  // che possano correlare un elettore a una scheda.
  const forbidden = ['token', 'sessionId', 'ballot', 'ballots', 'preferenze', 'password'];
  const clean = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (!forbidden.includes(key)) clean[key] = value;
  }
  await dataRoot().collection('audit_admin').add({
    actorUid: actor.uid,
    actorRole: actor.role,
    action,
    details: clean,
    at: FieldValue.serverTimestamp()
  });
}


function assertSafeConfigValue(value, path = 'config', depth = 0) {
  if (depth > 12) throw new HttpsError('invalid-argument', 'Configurazione troppo annidata.');
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return;
  if (typeof value === 'string') {
    if (value.length > 8000) throw new HttpsError('invalid-argument', `Valore troppo lungo: ${path}.`);
    if (/[<>`"]/.test(value) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
      throw new HttpsError('invalid-argument', `Caratteri non ammessi nella configurazione: ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 1000) throw new HttpsError('invalid-argument', `Troppi elementi: ${path}.`);
    value.forEach((v, i) => assertSafeConfigValue(v, `${path}[${i}]`, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(k)) throw new HttpsError('invalid-argument', 'Chiave di configurazione non ammessa.');
      assertSafeConfigValue(v, `${path}.${k}`, depth + 1);
    }
    return;
  }
  throw new HttpsError('invalid-argument', `Tipo non ammesso: ${path}.`);
}
function verifyScryptPassword(password, record) {
  if (!record || !record.passwordHash || !record.passwordSalt) return false;
  const derived = crypto.scryptSync(String(password), String(record.passwordSalt), 64).toString('hex');
  return safeEqualHex(derived, record.passwordHash);
}

function legacyPasswordMatches(password, record) {
  // Solo per migrazione di eventuali account creati dalla vecchia versione.
  // Un accesso valido viene immediatamente aggiornato a scrypt+salt.
  return !!record?.passwordHash && !record?.passwordSalt && safeEqualHex(sha256(password), record.passwordHash);
}

function defaultManagementExpiryDate(year) {
  const match = String(year || '').match(/^(20\d{2})\/(20\d{2})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new HttpsError('invalid-argument', 'Anno scolastico non valido per la scadenza delle credenziali.');
  }
  // Valida fino al 31 agosto incluso: scade alle 00:00 del 1 settembre successivo (Europe/Rome).
  const expiry = parseItalianDate(`01/09/${match[2]}`, '00:00');
  if (!expiry) throw new HttpsError('internal', 'Impossibile calcolare la scadenza delle credenziali.');
  return expiry;
}

function storedExpiryToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function managementExpiryForRecord(record, year, role) {
  if (!MANAGEMENT_ROLES.has(role)) return null;
  return storedExpiryToDate(record?.expiresAt) || defaultManagementExpiryDate(year);
}

function expiryLabel(expiry) {
  if (!expiry) return null;
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date(expiry.getTime() - 1000));
}

function emptyRegularityState() {
  return {
    annualCircularRecorded:false,commissionAppointed:false,voterRollFinal:false,candidateListsValidated:false,
    ballotApproved:false,privacyChecked:false,technicalTestPassed:false,softwareFrozen:false,
    backupPlanReady:false,incidentPlanReady:false,communicationPublished:false,resultsPublished:false,
    appealWindowClosed:false,finalArchiveSealed:false,legalHold:false,procedureClosed:false,
    emergencySuspended:false,notes:{}
  };
}
async function loadRegularityState(year) {
  const snap = await regularityStateRef(year).get();
  return {...emptyRegularityState(),...(snap.exists ? snap.data() : {})};
}
function regularityMissing(state) { return REGULARITY_PRE_VOTE_CONTROLS.filter(k => state[k] !== true); }
function timestampIso(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function serializeRegularityState(state) {
  const out={...state}; ['updatedAt','resultsPublishedAt','procedureClosedAt','lastIncidentAt'].forEach(k=>{if(out[k])out[k]=timestampIso(out[k]);}); return out;
}
async function assertElectionReadyForVoting(year) {
  const s=await loadRegularityState(year), missing=regularityMissing(s);
  if(s.procedureClosed) throw new HttpsError('failed-precondition','Procedimento elettorale definitivamente chiuso.');
  if(s.emergencySuspended) throw new HttpsError('failed-precondition','Votazione sospesa dalla Commissione per evento verbalizzato.');
  if(missing.length) throw new HttpsError('failed-precondition',`Apertura bloccata: controlli di regolarità incompleti (${missing.join(', ')}).`);
}
async function authenticateStaff({ username, password, requestedRole, year }) {
  const role = normalize(requestedRole);
  const uname = String(username || '').trim().toLowerCase();
  if (!ALLOWED_STAFF_ROLES.has(role) || !uname || !password) {
    throw new HttpsError('invalid-argument', 'Credenziali incomplete.');
  }
  const snap = await yearlyCollection('gestione_accessi', year)
    .where('username', '==', uname)
    .where('role', '==', role)
    .limit(1)
    .get();
  if (snap.empty) throw new HttpsError('permission-denied', 'Credenziali non valide.');
  const docSnap = snap.docs[0];
  const record = docSnap.data() || {};
  if (record.active === false) throw new HttpsError('permission-denied', 'Account disattivato.');

  let valid = verifyScryptPassword(password, record);
  if (!valid && legacyPasswordMatches(password, record)) {
    valid = true;
    const salt = crypto.randomBytes(24).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    await docSnap.ref.update({ passwordSalt: salt, passwordHash: hash, migratedAt: FieldValue.serverTimestamp() });
  }
  if (!valid) throw new HttpsError('permission-denied', 'Credenziali non valide.');

  const expiresAt = managementExpiryForRecord(record, year, role);
  if (expiresAt && Date.now() >= expiresAt.getTime()) {
    throw new HttpsError('permission-denied', `Credenziali scadute il ${expiryLabel(expiresAt)}. Richiedere una nuova credenziale per l'anno scolastico corrente.`);
  }
  // Backfill automatico per gli account gestionali creati prima dell'introduzione della policy.
  if (expiresAt && !record.expiresAt) {
    await docSnap.ref.update({
      expiresAt: Timestamp.fromDate(expiresAt),
      expiryPolicy: 'FINE_ANNO_SCOLASTICO',
      expiryPolicyAppliedAt: FieldValue.serverTimestamp()
    });
  }

  const claims = {
    role,
    scopeClass: record.scopeClass || 'TUTTE',
    staffAccountId: docSnap.id,
    mustChangePassword: record.mustChangePassword === true,
    ...(expiresAt ? { staffExpiresAt: Math.floor(expiresAt.getTime() / 1000) } : {})
  };
  const customToken = await getAuth().createCustomToken(`staff-${docSnap.id}-${crypto.randomUUID()}`, claims);
  return {
    customToken,
    profile: {
      id: docSnap.id,
      name: record.name || uname,
      username: uname,
      role,
      scopeClass: record.scopeClass || 'TUTTE',
      mustChangePassword: record.mustChangePassword === true,
      ...(expiresAt ? { expiresAt: expiresAt.toISOString(), expiresOn: expiryLabel(expiresAt) } : {})
    }
  };
}

function getListConfig(config, component, voterType) {
  if (component === 'consiglio') return (config.listeConsiglio || {})[voterType] || {};
  if (component === 'istituto') return config.listeIstituto || {};
  if (component === 'consulta') return config.listeConsulta || {};
  return {};
}

function validateListBallot(ballot, config, component, voterType) {
  if (!ballot || typeof ballot !== 'object') return null;
  const lists = getListConfig(config, component, voterType);
  const listKey = String(ballot.lista || '');
  if (!listKey || !Object.prototype.hasOwnProperty.call(lists, listKey)) {
    throw new HttpsError('invalid-argument', `Lista non valida per ${component}.`);
  }
  const maxMap = {
    consiglio: Number(config.maxPrefConsiglio || 0),
    istituto: Number(config.maxPrefIstituto || 0),
    consulta: Number(config.maxPrefConsulta || 0)
  };
  const max = Math.max(0, Math.min(10, maxMap[component] || 0));
  const allowedCandidates = new Set((lists[listKey].candidati || []).map(canonicalName));
  const prefs = [];
  for (let i = 1; i <= max; i++) {
    const value = normalize(ballot[`p${i}`]);
    if (!value) continue;
    if (!allowedCandidates.has(canonicalName(value))) {
      throw new HttpsError('invalid-argument', `Preferenza non valida per ${component}.`);
    }
    if (prefs.some((x) => canonicalName(x) === canonicalName(value))) {
      throw new HttpsError('invalid-argument', 'Preferenze duplicate non ammesse.');
    }
    prefs.push(value);
  }
  const clean = { lista: listKey };
  prefs.forEach((p, idx) => { clean[`p${idx + 1}`] = p; });
  return clean;
}

async function validateClassBallot(ballot, config, voterType, voterClass, year) {
  if (!ballot || typeof ballot !== 'object') return null;
  const isStudent = voterType === 'STUDENTE';
  const max = Math.max(1, Math.min(4, Number(isStudent ? config.maxPrefClasseStudenti : config.maxPrefClasseGenitori) || 1));
  const values = [];
  for (let i = 1; i <= max; i++) {
    const value = normalize(ballot[`candidate${i}`]);
    if (value) values.push(value);
  }
  if (!values.length) return { isBianca: true };
  if (new Set(values.map(canonicalName)).size !== values.length) {
    throw new HttpsError('invalid-argument', 'Candidati duplicati non ammessi.');
  }

  // Controllo server-side: il nominativo deve appartenere alla stessa componente/classe
  // degli aventi diritto caricati nel registro elettorale.
  const candidatesSnap = await yearlyCollection('tokens', year)
    .where('tipo', '==', voterType)
    .where('classe', '==', voterClass)
    .get();
  const eligible = new Set();
  candidatesSnap.forEach((d) => {
    const name = d.data()?.nome;
    if (name && normalize(name) !== 'ELETTORE ANONIMO') eligible.add(canonicalName(name));
  });
  if (eligible.size) {
    for (const value of values) {
      if (!eligible.has(canonicalName(value))) {
        throw new HttpsError('invalid-argument', 'Il candidato indicato non risulta tra gli aventi diritto della classe.');
      }
    }
  }
  const clean = { isBianca: false };
  values.forEach((value, idx) => { clean[`candidate${idx + 1}`] = value; });
  return clean;
}

function sanitizeStoredBallot(raw) {
  const forbidden = new Set([
    'token', 'tokenHash', 'tokenDocId', 'sessionId', 'sessionHash', 'nome', 'email',
    'uid', 'userId', 'createdAt', 'updatedAt', 'timestamp', 'dataVoto', 'ip', 'userAgent',
    'ballotId', 'documentId'
  ]);
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (!forbidden.has(key)) out[key] = value;
  }
  return out;
}

function makeTurnoutProjection(rows) {
  return rows.map((row) => ({
    ...(row.classe ? { classe: row.classe } : {}),
    ...(row.tipo ? { tipo: row.tipo } : {}),
    isBianca: false,
    _aggregateOnly: true,
    _turnoutOnly: true
  }));
}

function distributePreferences(targetRows, preferenceCounts, prefix, maxSlots) {
  if (!targetRows.length) return;
  const pool = [];
  for (const [name, count] of Object.entries(preferenceCounts)) {
    for (let i = 0; i < count; i++) pool.push(name);
  }
  let cursor = 0;
  for (const pref of pool) {
    let attempts = 0;
    while (attempts < targetRows.length * maxSlots) {
      const row = targetRows[cursor % targetRows.length];
      cursor++;
      attempts++;
      let placed = false;
      for (let slot = 1; slot <= maxSlots; slot++) {
        if (!row[`${prefix}${slot}`]) {
          row[`${prefix}${slot}`] = pref;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }
}

function makeAggregateProjection(rows, collectionName) {
  // Ricrea esclusivamente le distribuzioni aggregate necessarie all'interfaccia.
  // Le combinazioni originarie delle singole schede vengono intenzionalmente distrutte.
  const isClass = collectionName === 'voti_classe_studenti' || collectionName === 'voti_classe_genitori';
  const grouped = new Map();
  for (const row of rows) {
    const key = isClass ? String(row.classe || 'GEN') : (collectionName === 'voti_consiglio' ? String(row.tipo || 'GEN') : 'ALL');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const output = [];
  for (const [groupKey, groupRows] of grouped.entries()) {
    const common = isClass ? { classe: groupKey } : (collectionName === 'voti_consiglio' ? { tipo: groupKey } : {});
    const blanks = groupRows.filter((r) => r.isBianca === true).length;
    for (let i = 0; i < blanks; i++) output.push({ ...common, isBianca: true, _aggregateOnly: true });
    const validRows = groupRows.filter((r) => r.isBianca !== true);

    if (isClass) {
      const synthetic = validRows.map(() => ({ ...common, isBianca: false, _aggregateOnly: true }));
      const counts = {};
      for (const r of validRows) {
        for (let i = 1; i <= 4; i++) {
          const c = normalize(r[`candidate${i}`]);
          if (c) counts[c] = (counts[c] || 0) + 1;
        }
      }
      distributePreferences(synthetic, counts, 'candidate', 4);
      output.push(...synthetic);
      continue;
    }

    const listCounts = {};
    const prefByList = {};
    let noListCount = 0;
    for (const r of validRows) {
      const list = r.lista ? String(r.lista) : '';
      if (list) {
        listCounts[list] = (listCounts[list] || 0) + 1;
        if (!prefByList[list]) prefByList[list] = {};
        for (let i = 1; i <= 10; i++) {
          const p = normalize(r[`p${i}`]);
          if (p) prefByList[list][p] = (prefByList[list][p] || 0) + 1;
        }
      } else {
        noListCount++;
      }
    }
    for (const [list, count] of Object.entries(listCounts)) {
      const synthetic = Array.from({ length: count }, () => ({ ...common, lista: list, isBianca: false, _aggregateOnly: true }));
      distributePreferences(synthetic, prefByList[list] || {}, 'p', 10);
      output.push(...synthetic);
    }
    for (let i = 0; i < noListCount; i++) output.push({ ...common, isBianca: false, _aggregateOnly: true });
  }
  return output;
}

exports.validateVoterToken = onCall({ region: REGION, enforceAppCheck: false }, async (request) => {
  const token = normalize(request.data?.token);
  const year = request.data?.annoScolastico;
  if (!token || token.length > 80) throw new HttpsError('invalid-argument', 'Token non valido.');
  const config = await loadElectionConfig(year);
  await assertElectionReadyForVoting(year);
  assertVotingOpen(config);

  const tokenRef = yearlyCollection('tokens', year).doc(token);
  const sessionId = crypto.randomBytes(32).toString('base64url');
  const sessionHash = sha256(sessionId);
  let voterData;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(tokenRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Token non valido.');
    voterData = snap.data() || {};
    const expires = voterData.sessionExpiresAt?.toMillis?.() || 0;
    if (voterData.activeSessionHash && expires > Date.now()) {
      throw new HttpsError('already-exists', 'Esiste già una sessione di voto attiva per questa credenziale. Attendere la scadenza o completare la sessione aperta.');
    }
    tx.update(tokenRef, {
      activeSessionHash: sessionHash,
      sessionExpiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000)
    });
  });

  return {
    sessionId,
    tipo: voterData.tipo,
    classe: voterData.classe || null,
    indirizzo: voterData.indirizzo || null,
    voted_consiglio: !!voterData.voted_consiglio,
    voted_istituto: !!voterData.voted_istituto,
    voted_consulta: !!voterData.voted_consulta,
    voted_classe_studente: !!voterData.voted_classe_studente,
    voted_classe_genitore: !!voterData.voted_classe_genitore
  };
});

exports.castVote = onCall({ region: REGION, enforceAppCheck: false }, async (request) => {
  const sessionId = String(request.data?.sessionId || '');
  const year = request.data?.annoScolastico;
  const submitted = request.data?.ballots || {};
  if (!sessionId || sessionId.length > 200) throw new HttpsError('unauthenticated', 'Sessione di voto non valida.');
  const config = await loadElectionConfig(year);
  await assertElectionReadyForVoting(year);
  assertVotingOpen(config);
  const sessionHash = sha256(sessionId);

  const q = await yearlyCollection('tokens', year).where('activeSessionHash', '==', sessionHash).limit(1).get();
  if (q.empty) throw new HttpsError('unauthenticated', 'Sessione di voto non valida o già utilizzata.');
  const tokenRef = q.docs[0].ref;
  const tokenSnapshot = q.docs[0];
  const tokenDataBefore = tokenSnapshot.data() || {};

  // Validazione contenuti fuori dalla transazione per le query dei candidati di classe.
  const cleanBallots = {};
  const voterType = normalize(tokenDataBefore.tipo);
  const voterClass = normalize(tokenDataBefore.classe);

  if (submitted.consiglio && config.consiglioAttivo && voterType !== 'STUDENTE') {
    cleanBallots.consiglio = validateListBallot(submitted.consiglio, config, 'consiglio', voterType);
  }
  if (submitted.istituto && config.rappresentantiIstitutoAttivo && voterType === 'STUDENTE') {
    cleanBallots.istituto = validateListBallot(submitted.istituto, config, 'istituto', voterType);
  }
  if (submitted.consulta && config.consultaAttiva && voterType === 'STUDENTE') {
    cleanBallots.consulta = validateListBallot(submitted.consulta, config, 'consulta', voterType);
  }
  if (submitted.classeStudente && config.rappresentantiClasseStudentiAttivo && voterType === 'STUDENTE') {
    cleanBallots.classeStudente = await validateClassBallot(submitted.classeStudente, config, 'STUDENTE', voterClass, year);
  }
  if (submitted.classeGenitore && config.rappresentantiClasseGenitoriAttivo && voterType === 'GENITORE') {
    cleanBallots.classeGenitore = await validateClassBallot(submitted.classeGenitore, config, 'GENITORE', voterClass, year);
  }

  const result = await db.runTransaction(async (tx) => {
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists) throw new HttpsError('not-found', 'Credenziale non disponibile.');
    const t = tokenSnap.data() || {};
    if (t.activeSessionHash !== sessionHash || !t.sessionExpiresAt || t.sessionExpiresAt.toMillis() < Date.now()) {
      throw new HttpsError('deadline-exceeded', 'Sessione scaduta o non valida.');
    }

    const updates = {
      activeSessionHash: FieldValue.delete(),
      sessionExpiresAt: FieldValue.delete()
    };
    const writes = [];
    const addBallot = (key, collectionName, flag, extra = {}) => {
      const ballot = cleanBallots[key];
      if (!ballot || t[flag]) return;
      const ref = yearlyCollection(collectionName, year).doc(crypto.randomUUID());
      const clean = sanitizeStoredBallot({ ...ballot, ...extra });
      writes.push([ref, clean]);
      updates[flag] = true;
    };

    addBallot('consiglio', 'voti_consiglio', 'voted_consiglio', { tipo: voterType });
    addBallot('istituto', 'voti_istituto', 'voted_istituto', { tipo: 'STUDENTE' });
    addBallot('consulta', 'voti_consulta', 'voted_consulta', { tipo: 'STUDENTE' });
    addBallot('classeStudente', 'voti_classe_studenti', 'voted_classe_studente', { classe: voterClass, tipo: 'STUDENTE' });
    addBallot('classeGenitore', 'voti_classe_genitori', 'voted_classe_genitore', { classe: voterClass, tipo: 'GENITORE' });

    if (!writes.length) throw new HttpsError('failed-precondition', 'Nessuna nuova scheda valida da registrare.');
    writes.forEach(([ref, value]) => tx.create(ref, value));

    const flag = (name) => updates[name] === true || t[name] === true;
    let eligible = 0;
    let completed = 0;
    const count = (active, done) => { if (active) { eligible++; if (done) completed++; } };
    count(config.consiglioAttivo && voterType !== 'STUDENTE', flag('voted_consiglio'));
    count(config.rappresentantiIstitutoAttivo && voterType === 'STUDENTE', flag('voted_istituto'));
    count(config.consultaAttiva && voterType === 'STUDENTE', flag('voted_consulta'));
    count(config.rappresentantiClasseStudentiAttivo && voterType === 'STUDENTE', flag('voted_classe_studente'));
    count(config.rappresentantiClasseGenitoriAttivo && voterType === 'GENITORE', flag('voted_classe_genitore'));
    updates.hasVoted = eligible > 0 && completed >= eligible;
    tx.update(tokenRef, updates);
    return { fullyCompleted: updates.hasVoted, recordedBallots: writes.length };
  });

  // Nessun audit individuale del voto: evita correlazioni temporali elettore/scheda.
  return { ok: true, ...result };
});

exports.commissionLogin = onCall({ region: REGION }, async (request) => {
  const year = request.data?.annoScolastico;
  const username = String(request.data?.username || '').trim().toLowerCase();
  const password = String(request.data?.password || '');
  const result = await authenticateStaff({ username, password, requestedRole: 'COMMISSIONE', year });
  await auditAdmin({ uid: result.profile.id, role: 'COMMISSIONE' }, 'COMMISSION_LOGIN', { username });
  return result;
});


exports.changeCommissionPassword = onCall({ region: REGION }, async (request) => {
  if (!request.auth || normalize(request.auth.token.role) !== 'COMMISSIONE') {
    throw new HttpsError('unauthenticated', 'Sessione Commissione richiesta.');
  }
  const accountId = String(request.auth.token.staffAccountId || '').trim();
  const year = String(request.data?.annoScolastico || '').trim();
  const newPassword = String(request.data?.newPassword || '');
  const confirmPassword = String(request.data?.confirmPassword || '');
  if (!accountId || !/^20\d{2}\/20\d{2}$/.test(year)) {
    throw new HttpsError('invalid-argument', 'Account o anno scolastico non validi.');
  }
  if (newPassword !== confirmPassword) {
    throw new HttpsError('invalid-argument', 'Le due password non coincidono.');
  }
  if (newPassword.length < 16 || newPassword.length > 128 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    throw new HttpsError('invalid-argument', 'La nuova password deve contenere almeno 16 caratteri, maiuscole, minuscole, numeri e simboli.');
  }

  const ref = yearlyCollection('gestione_accessi', year).doc(accountId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Account Commissione non trovato.');
  const record = snap.data() || {};
  if (normalize(record.role) !== 'COMMISSIONE' || record.active === false) {
    throw new HttpsError('permission-denied', 'Account Commissione non autorizzato.');
  }
  if (!verifyScryptPassword(newPassword, record) && !legacyPasswordMatches(newPassword, record)) {
    const salt = crypto.randomBytes(24).toString('hex');
    const passwordHash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
    await ref.update({
      passwordSalt: salt,
      passwordHash,
      mustChangePassword: false,
      bootstrapAccount: false,
      passwordChangedAt: FieldValue.serverTimestamp(),
      passwordChangedBy: accountId
    });
  } else {
    throw new HttpsError('invalid-argument', 'La nuova password deve essere diversa dalla password temporanea o precedente.');
  }

  const claims = {
    role: 'COMMISSIONE',
    scopeClass: record.scopeClass || 'TUTTE',
    staffAccountId: accountId,
    mustChangePassword: false
  };
  const customToken = await getAuth().createCustomToken(`staff-${accountId}-${crypto.randomUUID()}`, claims);
  await auditAdmin({ uid: accountId, role: 'COMMISSIONE' }, 'COMMISSION_PASSWORD_CHANGED', { accountId });
  return {
    ok: true,
    customToken,
    profile: {
      id: accountId,
      name: record.name || 'Commissione Elettorale',
      username: record.username || '',
      role: 'COMMISSIONE',
      mustChangePassword: false
    }
  };
});

exports.managementLogin = onCall({ region: REGION }, async (request) => {
  const result = await authenticateStaff({
    username: request.data?.username,
    password: request.data?.password,
    requestedRole: request.data?.requestedRole,
    year: request.data?.annoScolastico
  });
  await auditAdmin({ uid: result.profile.id, role: result.profile.role }, 'STAFF_LOGIN', { username: result.profile.username });
  return result;
});

exports.referentLogin = onCall({ region: REGION }, async (request) => {
  const token = normalize(request.data?.token);
  const type = normalize(request.data?.tipo);
  const year = request.data?.annoScolastico;
  if (!token || !['STUDENTE', 'GENITORE'].includes(type)) throw new HttpsError('invalid-argument', 'Dati non validi.');
  const snap = await yearlyCollection('config', year).doc('referenti_keys').get();
  const map = snap.exists ? (snap.data() || {}) : {};
  const rec = map[token];
  if (!rec || normalize(rec.tipo) !== type) throw new HttpsError('permission-denied', 'Codice referente non valido.');
  const customToken = await getAuth().createCustomToken(`referent-${crypto.randomUUID()}`, {
    role: 'REFERENTE', scopeClass: rec.classe, referentType: rec.tipo
  });
  return { customToken, classe: rec.classe, tipo: rec.tipo };
});

exports.getAnonymousBallots = onCall({ region: REGION }, async (request) => {
  const actor = requireAuth(request, ['COMMISSIONE', 'DIRIGENTE', 'VICEPRESIDE', 'DSGA', 'SEGRETERIA', 'REFERENTE']);
  const collectionName = String(request.data?.collection || '');
  const year = request.data?.annoScolastico;
  if (!BALLOT_COLLECTIONS.has(collectionName)) throw new HttpsError('invalid-argument', 'Urna non valida.');

  const config = await loadElectionConfig(year);
  const phase = electionPhase(config);
  let query = yearlyCollection(collectionName, year);

  if (actor.role === 'REFERENTE') {
    const required = actor.claims.referentType === 'STUDENTE' ? 'voti_classe_studenti' : 'voti_classe_genitori';
    if (collectionName !== required) throw new HttpsError('permission-denied', 'Componente non autorizzata.');
    query = query.where('classe', '==', actor.claims.scopeClass);
  }

  const snap = await query.get();
  const sanitized = snap.docs.map((docSnap) => sanitizeStoredBallot(docSnap.data()));

  // Durante la votazione nessun ruolo vede le preferenze parziali.
  if (phase === 'BEFORE' || phase === 'OPEN') {
    return { phase, ballots: makeTurnoutProjection(sanitized), aggregateOnly: true };
  }

  // La Commissione, a urne chiuse, può scrutinare schede già prive di identità e metadati.
  if (actor.role === 'COMMISSIONE') {
    return { phase, ballots: sanitized, aggregateOnly: false };
  }

  // Dirigenza/Segreteria e Referenti ricevono solo una proiezione aggregata,
  // e solo quando gli esiti sono stati formalmente rilasciati.
  if (phase !== 'RELEASED') {
    return { phase, ballots: makeTurnoutProjection(sanitized), aggregateOnly: true };
  }
  return { phase, ballots: makeAggregateProjection(sanitized, collectionName), aggregateOnly: true };
});

exports.createStaffAccount = onCall({ region: REGION }, async (request) => {
  const actor = requireAuth(request, ['COMMISSIONE']);
  const year = request.data?.annoScolastico;
  const name = String(request.data?.name || '').trim();
  const username = String(request.data?.username || '').trim().toLowerCase();
  const password = String(request.data?.password || '');
  const role = normalize(request.data?.role);
  const scopeClass = normalize(request.data?.scopeClass || 'TUTTE') || 'TUTTE';
  if (!name || !/^[a-z0-9._-]{3,64}$/.test(username) || /[<>`"]/.test(name) || !/^[A-Z0-9 ._\/-]{1,32}$/.test(scopeClass) || password.length < 12 || !ALLOWED_STAFF_ROLES.has(role)) {
    throw new HttpsError('invalid-argument', 'Dati account non validi. La password deve contenere almeno 12 caratteri.');
  }
  const collection = yearlyCollection('gestione_accessi', year);
  const existing = await collection.where('username', '==', username).limit(1).get();
  if (!existing.empty) throw new HttpsError('already-exists', 'Username già esistente.');
  const salt = crypto.randomBytes(24).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const expiresAt = MANAGEMENT_ROLES.has(role) ? defaultManagementExpiryDate(year) : null;
  const ref = collection.doc();
  await ref.set({
    name, username, passwordHash, passwordSalt: salt, role, scopeClass,
    active: true,
    ...(expiresAt ? {
      expiresAt: Timestamp.fromDate(expiresAt),
      expiryPolicy: 'FINE_ANNO_SCOLASTICO'
    } : {}),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.uid
  });
  await auditAdmin(actor, 'CREATE_STAFF_ACCOUNT', {
    accountId: ref.id, username, role, scopeClass,
    ...(expiresAt ? { expiresOn: expiryLabel(expiresAt) } : {})
  });
  return {
    ok: true,
    id: ref.id,
    ...(expiresAt ? { expiresAt: expiresAt.toISOString(), expiresOn: expiryLabel(expiresAt) } : {})
  };
});

exports.getStaffAccounts = onCall({ region: REGION }, async (request) => {
  requireAuth(request, ['COMMISSIONE']);
  const year = request.data?.annoScolastico;
  const snap = await yearlyCollection('gestione_accessi', year).get();
  const accounts = [];
  for (const docSnap of snap.docs) {
    const record = docSnap.data() || {};
    const role = normalize(record.role);
    if (!MANAGEMENT_ROLES.has(role)) continue;
    const expiresAt = managementExpiryForRecord(record, year, role);
    accounts.push({
      id: docSnap.id,
      name: record.name || '',
      username: record.username || '',
      role,
      scopeClass: record.scopeClass || 'TUTTE',
      active: record.active !== false,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      expiresOn: expiresAt ? expiryLabel(expiresAt) : null,
      isExpired: !!expiresAt && Date.now() >= expiresAt.getTime()
    });
  }
  accounts.sort((a, b) => a.role.localeCompare(b.role) || a.username.localeCompare(b.username));
  return { accounts };
});

exports.setStaffAccountActive = onCall({ region: REGION }, async (request) => {
  const actor = requireAuth(request, ['COMMISSIONE']);
  const year = request.data?.annoScolastico;
  const id = String(request.data?.id || '');
  const active = request.data?.active === true;
  if (!id) throw new HttpsError('invalid-argument', 'Account mancante.');
  await yearlyCollection('gestione_accessi', year).doc(id).update({ active, updatedAt: FieldValue.serverTimestamp() });
  await auditAdmin(actor, 'SET_STAFF_ACCOUNT_ACTIVE', { accountId: id, active });
  return { ok: true };
});

exports.getRegularityState = onCall({region:REGION}, async request => {
  requireAuth(request,['COMMISSIONE','DIRIGENTE','VICEPRESIDE','DSGA','SEGRETERIA']);
  const year=request.data?.annoScolastico, state=await loadRegularityState(year);
  const snap=await regularityAppeals(year).orderBy('filedAt','desc').limit(100).get();
  const appeals=snap.docs.map(d=>{const x=d.data()||{};return{id:d.id,protocolRef:x.protocolRef||'',subject:x.subject||'',status:x.status||'OPEN',decisionRef:x.decisionRef||'',filedAt:timestampIso(x.filedAt),decidedAt:timestampIso(x.decidedAt)}});
  const missing=regularityMissing(state);
  return{state:serializeRegularityState(state),appeals,missing,readyForVoting:missing.length===0&&!state.emergencySuspended&&!state.procedureClosed};
});

exports.setRegularityControl = onCall({region:REGION}, async request => {
  const actor=requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico;
  const control=String(request.data?.control||''),value=request.data?.value===true,note=String(request.data?.note||'').trim().slice(0,1000);
  if(!REGULARITY_ALL_CONTROLS.has(control)) throw new HttpsError('invalid-argument','Controllo non valido.');
  const config=await loadElectionConfig(year);
  if(REGULARITY_PRE_VOTE_CONTROLS.includes(control)&&electionPhase(config)!=='BEFORE') throw new HttpsError('failed-precondition','I controlli preliminari non sono modificabili dopo l’apertura della finestra elettorale.');
  const ref=regularityStateRef(year);
  await db.runTransaction(async tx=>{const snap=await tx.get(ref),cur={...emptyRegularityState(),...(snap.exists?snap.data():{})};tx.set(ref,{[control]:value,notes:{...(cur.notes||{}),[control]:note},updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});});
  await regularityEvents(year).add({type:'CONTROL_UPDATE',control,value,note,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
  await auditAdmin(actor,'REGULARITY_CONTROL_UPDATE',{control,value}); return{ok:true};
});

exports.recordResultsPublication = onCall({region:REGION}, async request => {
  const actor=requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico;
  const protocolRef=String(request.data?.protocolRef||'').trim().slice(0,160), appealDeadline=String(request.data?.appealDeadline||'').trim();
  if(!protocolRef||!/^\d{4}-\d{2}-\d{2}$/.test(appealDeadline)) throw new HttpsError('invalid-argument','Inserire estremi pubblicazione e termine ricorsi AAAA-MM-GG.');
  if(electionPhase(await loadElectionConfig(year))==='OPEN') throw new HttpsError('failed-precondition','Non è possibile pubblicare risultati a urne aperte.');
  await regularityStateRef(year).set({resultsPublished:true,resultsPublishedAt:FieldValue.serverTimestamp(),resultsPublicationProtocol:protocolRef,appealDeadline,appealWindowClosed:false,legalHold:true,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
  await regularityEvents(year).add({type:'RESULTS_PUBLICATION',protocolRef,appealDeadline,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
  await auditAdmin(actor,'RESULTS_PUBLICATION_RECORDED',{protocolRef,appealDeadline}); return{ok:true};
});

exports.fileElectoralAppeal = onCall({region:REGION}, async request => {
  const actor=requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico;
  const protocolRef=String(request.data?.protocolRef||'').trim().slice(0,160),subject=String(request.data?.subject||'').trim().slice(0,1000);
  if(!protocolRef||!subject) throw new HttpsError('invalid-argument','Protocollo e oggetto obbligatori.');
  const ref=regularityAppeals(year).doc(); await ref.set({protocolRef,subject,status:'OPEN',filedAt:FieldValue.serverTimestamp(),createdBy:actor.uid});
  await regularityStateRef(year).set({legalHold:true,appealWindowClosed:false,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await auditAdmin(actor,'ELECTORAL_APPEAL_FILED',{appealId:ref.id,protocolRef}); return{ok:true,id:ref.id};
});

exports.resolveElectoralAppeal = onCall({region:REGION}, async request => {
  const actor=requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico,id=String(request.data?.id||''),decisionRef=String(request.data?.decisionRef||'').trim().slice(0,200);
  if(!id||!decisionRef) throw new HttpsError('invalid-argument','Ricorso e decisione obbligatori.');
  const ref=regularityAppeals(year).doc(id),snap=await ref.get(); if(!snap.exists) throw new HttpsError('not-found','Ricorso non trovato.');
  await ref.update({status:'RESOLVED',decisionRef,decidedAt:FieldValue.serverTimestamp(),decidedBy:actor.uid});
  await auditAdmin(actor,'ELECTORAL_APPEAL_RESOLVED',{appealId:id,decisionRef}); return{ok:true};
});

exports.recordElectoralIncident = onCall({region:REGION}, async request => {
  const actor=requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico;
  const protocolRef=String(request.data?.protocolRef||'').trim().slice(0,160),title=String(request.data?.title||'').trim().slice(0,200),details=String(request.data?.details||'').trim().slice(0,2000),suspend=request.data?.suspend===true;
  if(!title||!details) throw new HttpsError('invalid-argument','Titolo e descrizione obbligatori.');
  await regularityEvents(year).add({type:'INCIDENT',protocolRef,title,details,suspend,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
  await regularityStateRef(year).set({emergencySuspended:suspend,lastIncidentAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
  await auditAdmin(actor,'ELECTORAL_INCIDENT_RECORDED',{protocolRef,title,suspend}); return{ok:true};
});

exports.setEmergencySuspension = onCall({region:REGION}, async request => {
  const actor=requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico,suspended=request.data?.suspended===true,reason=String(request.data?.reason||'').trim().slice(0,1000);
  if(!reason) throw new HttpsError('invalid-argument','Motivazione obbligatoria.');
  await regularityStateRef(year).set({emergencySuspended:suspended,suspensionReason:reason,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
  await regularityEvents(year).add({type:suspended?'SUSPENSION':'RESUMPTION',reason,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
  await auditAdmin(actor,suspended?'ELECTION_SUSPENDED':'ELECTION_RESUMED',{}); return{ok:true};
});

exports.closeElectoralProcedure = onCall({region:REGION}, async request => {
  const actor=requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico,closureRef=String(request.data?.closureRef||'').trim().slice(0,200);
  if(!closureRef) throw new HttpsError('invalid-argument','Estremi verbale di chiusura obbligatori.');
  if(electionPhase(await loadElectionConfig(year))==='OPEN') throw new HttpsError('failed-precondition','Le urne sono ancora aperte.');
  const state=await loadRegularityState(year); if(!state.resultsPublished||!state.appealWindowClosed||!state.finalArchiveSealed) throw new HttpsError('failed-precondition','Completare pubblicazione, ricorsi e sigillo fascicolo.');
  const open=await regularityAppeals(year).where('status','==','OPEN').limit(1).get(); if(!open.empty) throw new HttpsError('failed-precondition','Esistono ricorsi ancora aperti.');
  const accounts=await yearlyCollection('gestione_accessi',year).get(); let count=0,batch=db.batch();
  for(const d of accounts.docs){if(MANAGEMENT_ROLES.has(normalize(d.data()?.role))){batch.update(d.ref,{active:false,closedProcedureRevocationAt:FieldValue.serverTimestamp(),closedProcedureRevocationRef:closureRef});count++;if(count%400===0){await batch.commit();batch=db.batch();}}}
  if(count%400!==0) await batch.commit();
  await regularityStateRef(year).set({procedureClosed:true,procedureClosedAt:FieldValue.serverTimestamp(),closureRef,legalHold:false,emergencySuspended:false,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
  await regularityEvents(year).add({type:'PROCEDURE_CLOSED',closureRef,revokedManagementAccounts:count,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
  await auditAdmin(actor,'ELECTORAL_PROCEDURE_CLOSED',{closureRef,revokedManagementAccounts:count}); return{ok:true,revokedManagementAccounts:count};
});
exports.getSecurityStatus = onCall({ region: REGION }, async (request) => {
  const actor = requireAuth(request, ['COMMISSIONE', 'DIRIGENTE', 'VICEPRESIDE', 'DSGA', 'SEGRETERIA']);
  const year = request.data?.annoScolastico;
  const config = await loadElectionConfig(year);
  return {
    ok: true,
    role: actor.role,
    phase: electionPhase(config),
    controls: {
      directBallotClientRead: false,
      directBallotClientWrite: false,
      ballotIdentityFields: false,
      ballotTimestampFields: false,
      staffRoleClaims: true,
      adminAudit: true,
      serverSideValidation: true,
      serverSideVotingWindow: true,
      managementCredentialExpiry: true,
      managementCredentialExpiryPolicy: '31_AGOSTO_ANNO_SCOLASTICO',
      sessionExpiryMinutes: 15
    }
  };
});

exports.destructiveAction = onCall({ region: REGION }, async (request) => {
  const actor = requireAuth(request, ['COMMISSIONE']);
  await auditAdmin(actor, 'BLOCKED_DESTRUCTIVE_ACTION', { requestedAction: String(request.data?.action || 'unspecified') });
  throw new HttpsError(
    'failed-precondition',
    'Operazione distruttiva disabilitata dal canale web. È richiesta una procedura straordinaria offline, autorizzata e verbalizzata.'
  );
});

exports.saveElectionConfig = onCall({ region: REGION }, async (request) => {
  const actor = requireAuth(request, ['COMMISSIONE']);
  const config = request.data?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new HttpsError('invalid-argument', 'Configurazione non valida.');
  }
  const year = String(config.annoScolastico || request.data?.annoScolastico || '').trim();
  if (!/^20\d{2}\/20\d{2}$/.test(year)) throw new HttpsError('invalid-argument', 'Anno scolastico non valido.');
  // Limite difensivo contro payload anomali.
  assertSafeConfigValue(config);
  const serialized = JSON.stringify(config);
  if (serialized.length > 700000) throw new HttpsError('invalid-argument', 'Configurazione troppo grande.');
  await db.runTransaction(async (tx) => {
    tx.set(globalConfigRef(), { annoScolastico: year }, { merge: true });
    tx.set(yearlyConfigRef(year), { ...config, annoScolastico: year }, { merge: false });
  });
  await auditAdmin(actor, 'SAVE_ELECTION_CONFIG', { annoScolastico: year });
  return { ok: true };
});

exports.ensureReferentKeys = onCall({ region: REGION }, async (request) => {
  const actor = requireAuth(request, ['COMMISSIONE']);
  const year = request.data?.annoScolastico;
  const type = normalize(request.data?.tipo);
  const classes = Array.isArray(request.data?.classes)
    ? [...new Set(request.data.classes.map(normalize).filter(Boolean))].slice(0, 200)
    : [];
  if (!['STUDENTE', 'GENITORE'].includes(type) || !classes.length) {
    throw new HttpsError('invalid-argument', 'Classi o componente non valide.');
  }
  const ref = yearlyCollection('config', year).doc('referenti_keys');
  let result = {};
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() || {}) : {};
    for (const cls of classes) {
      let found = Object.entries(current).find(([, v]) => normalize(v?.classe) === cls && normalize(v?.tipo) === type);
      if (!found) {
        let key = null;
        const prefix = type === 'STUDENTE' ? 'REF-STU' : 'REF-REF';
        for (let attempt = 0; attempt < 2500 && !key; attempt++) {
          const n = crypto.randomInt(0, 1000).toString().padStart(3, '0');
          const candidate = prefix + n;
          if (!current[candidate]) key = candidate;
        }
        if (!key) {
          for (let i = 0; i < 1000 && !key; i++) {
            const candidate = prefix + String(i).padStart(3, '0');
            if (!current[candidate]) key = candidate;
          }
        }
        if (!key) throw new HttpsError('resource-exhausted', 'Esauriti i codici referente disponibili per ' + prefix + '.');
        current[key] = { classe: cls, tipo: type };
        found = [key, current[key]];
      }
      result[found[0]] = found[1];
    }
    tx.set(ref, current, { merge: false });
  });
  await auditAdmin(actor, 'ENSURE_REFERENT_KEYS', { tipo: type, classCount: classes.length });
  return { keys: result };
});
