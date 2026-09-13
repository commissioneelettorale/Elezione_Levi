'use strict';

/**
 * Modulo condiviso delle operazioni elettorali.
 * Firebase Functions lo espone tramite functions/index.js.
 * Vercel lo invoca tramite api/call.js.
 */

/**
 * ITSCG Primo Levi - Piattaforma elettorale
 * Backend applicativo condiviso (Firebase Functions / Vercel)
 *
 * Principi di progetto:
 * - nessun segreto nel browser/repository;
 * - nessun identificativo dell'elettore nella scheda;
 * - nessun timestamp nella scheda;
 * - separazione persistente tra diritto di voto e contenuto del voto;
 * - autorizzazioni server-side per ruolo;
 * - risultati parziali non esposti durante la votazione;
 * - audit solo per operazioni amministrative e checkpoint tecnici (mai per il contenuto del voto).
 */

const { HttpsError } = require('firebase-functions/v2/https');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const crypto = require('crypto');
const ElectionPolicy = require('../lib/election-policy');
const BallotVault = require('../lib/ballot-vault');
const LegalReadiness = require('../lib/legal-readiness');
const VotingAdmission = require('../lib/voting-admission');

function initializeFirebaseAdmin() {
  if (getApps().length) return;

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || process.env.FIREBASE_SERVICE_ACCOUNT_VOTAZIONI_LEVI;

  if (rawServiceAccount) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(rawServiceAccount);
    } catch (_) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON non contiene JSON valido.');
    }
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || 'votazioni-levi'
    });
    return;
  }

  // Firebase Functions usa le credenziali applicative dell'ambiente Google.
  initializeApp();
}
initializeFirebaseAdmin();
const db = getFirestore();
const APP_ID = 'iis-levi-electoral-v3';
const REGION = 'europe-west1';

const ALLOWED_STAFF_ROLES = new Set([
  'COMMISSIONE', 'DIRIGENTE', 'VICEPRESIDE', 'DSGA', 'SEGRETERIA', 'ASSISTENTE_TECNICO'
]);
const MANAGEMENT_ROLES = new Set(['DIRIGENTE', 'VICEPRESIDE', 'DSGA', 'SEGRETERIA', 'ASSISTENTE_TECNICO']);
const BALLOT_COLLECTIONS = new Set([
  'voti_consiglio', 'voti_istituto', 'voti_consulta',
  'voti_classe_studenti', 'voti_classe_genitori'
]);

const REGULARITY_PRE_VOTE_CONTROLS = Object.freeze([
  'annualCircularRecorded','commissionAppointed','voterRollFinal','candidateListsValidated',
  'ballotApproved','privacyChecked','technicalTestPassed','softwareFrozen',
  'backupPlanReady','incidentPlanReady','communicationPublished',...Object.keys(LegalReadiness.CONTROLS)
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

async function requireAuth(request, allowedRoles = []) {
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
  if (ALLOWED_STAFF_ROLES.has(role)) {
    const claims = request.auth.token;
    const year = String(claims.staffYear || '');
    const requestedYear = request.data?.annoScolastico || request.data?.config?.annoScolastico || year;
    if (!/^20\d{2}\/20\d{2}$/.test(year) || requestedYear !== year || !claims.staffAccountId) {
      throw new HttpsError('permission-denied', 'Sessione non valida per questo anno. Effettuare nuovamente il login.');
    }
    const snap = await yearlyCollection('gestione_accessi', year).doc(claims.staffAccountId).get();
    const record = snap.exists ? snap.data() : null;
    if (!record || record.active === false || normalize(record.role) !== role ||
        Number(record.sessionVersion || 0) !== Number(claims.sessionVersion || 0)) {
      throw new HttpsError('permission-denied', 'Accesso revocato. Effettuare nuovamente il login.');
    }
    if (record.mustChangePassword === true) throw new HttpsError('failed-precondition', 'Cambio password obbligatorio.');
    const expiry = managementExpiryForRecord(record, year, role);
    if (expiry && Date.now() >= expiry.getTime()) throw new HttpsError('permission-denied', 'Incarico scaduto.');
  }
  return { uid: request.auth.uid, role, claims: request.auth.token };
}

function enforceTechnicalYear(actor, year) {
  if (actor?.role !== 'ASSISTENTE_TECNICO') return;
  const boundYear = String(actor.claims?.staffYear || '').trim();
  const requestedYear = String(year || '').trim();
  if (!boundYear || !requestedYear || yearSuffix(boundYear) !== yearSuffix(requestedYear)) {
    throw new HttpsError('permission-denied', 'L’account tecnico è limitato all’anno scolastico assegnato.');
  }
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

function electionPhase(config, key) {
  return key ? ElectionPolicy.phase(config,key) : ElectionPolicy.globalPhase(config);
}
function assertVotingOpen(config, key) {
  if (electionPhase(config,key)!=='OPEN') throw new HttpsError('failed-precondition','La consultazione non è aperta in questa fascia oraria (Europe/Rome).');
}
function activeVoterKeys(config,type) {
  return ElectionPolicy.enabled(config).filter(k=>k==='consiglio'?type!=='STUDENTE':k==='classeGenitore'?type==='GENITORE':type==='STUDENTE');
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
function admissionBinding(config,state={}){return {commit:releaseIdentity().commit,configurationSha256:configurationHash(config),credentialRevision:state.credentialRevision||null};}
function regularityMissing(state,config={}) {
  return [...REGULARITY_PRE_VOTE_CONTROLS.filter(k => state[k] !== true),...VotingAdmission.blockers(config,state,admissionBinding(config,state))];
}
function releaseIdentity(){
  const commit=String(process.env.VERCEL_GIT_COMMIT_SHA||'');
  return {policyVersion:LegalReadiness.VERSION,commit:/^[a-f0-9]{40}$/.test(commit)?commit:null,environment:process.env.VERCEL_ENV==='production'?'production':'non-attestato'};
}
function configurationHash(config){return sha256(JSON.stringify(config));}
function legalAssessment(config,state){
  return {version:LegalReadiness.VERSION,sourceDocument:'ALLEGATO_A_Note_Legali.docx',sourceSha256:LegalReadiness.SOURCE_SHA256,assessedAt:new Date().toISOString(),
    release:releaseIdentity(),configurationSha256:configurationHash(config),admittedToSecretVoting:regularityMissing(state,config).length===0&&!state.emergencySuspended&&!state.procedureClosed,
    blockers:VotingAdmission.blockers(config,state,admissionBinding(config,state)).map(id=>({id,detail:LegalReadiness.BLOCKER_LABELS[id]})),
    controls:REGULARITY_PRE_VOTE_CONTROLS.map(id=>({id,status:state[id]===true?'DICHIARATO_VERIFICATO':'NON_VERIFICATO',note:evidenceText(state.notes?.[id]),evidence:state.evidence?.[id]||null})),
    scope:ElectionPolicy.enabled(config).map(key=>({key,label:ElectionPolicy.ELECTIONS[key].label,profile:ElectionPolicy.profile(config,key)})),
    limitation:'Le dichiarazioni richiedono riscontro nel fascicolo. La pubblicazione del software non costituisce adozione dell’Allegato A o autorizzazione delle elezioni digitali.'};
}
exports.getPublicServiceStatus = async () => {
  const global=await globalConfigRef().get(),year=global.data()?.annoScolastico;
  if(!/^20\d{2}\/20\d{2}$/.test(year||''))return {ok:true,serviceState:'PREPARATION_ONLY',secretVotingEnabled:false,release:releaseIdentity()};
  const config=await loadElectionConfig(year),state=await loadRegularityState(year);
  const missing=regularityMissing(state,config),ready=!missing.length&&!state.emergencySuspended&&!state.procedureClosed;
  return {ok:true,serviceState:state.emergencySuspended?'SUSPENDED':ready?'ADMITTED':'PREPARATION_ONLY',secretVotingEnabled:ready,
    phase:electionPhase(config),policyVersion:LegalReadiness.VERSION,release:releaseIdentity(),blockerCodes:missing,informationPath:'note-legali.html'};
};
function timestampIso(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function serializeRegularityState(state) {
  const out={...state}; ['updatedAt','resultsPublishedAt','procedureClosedAt','lastIncidentAt'].forEach(k=>{if(out[k])out[k]=timestampIso(out[k]);});
  out.publications=Object.fromEntries(Object.entries(state.publications||{}).map(([key,p])=>[key,{...p,resultsPublishedAt:timestampIso(p.resultsPublishedAt)}]));
  return out;
}
function requestElectionKey(request) {
  const key=String(request.data?.electionKey||'');
  if(key&&!Object.hasOwn(ElectionPolicy.ELECTIONS,key)) throw new HttpsError('invalid-argument','Consultazione non valida.');
  return key;
}
function assertAllPublicationDeadlines(config,state) {
  const keys=ElectionPolicy.enabled(config);
  if(!keys.length) throw new HttpsError('failed-precondition','Nessuna consultazione configurata.');
  for(const key of keys) {
    if(!['CLOSED','RELEASED'].includes(electionPhase(config,key))) throw new HttpsError('failed-precondition','Attendere la chiusura di tutte le consultazioni.');
    const publication=state.publications?.[key]||(ElectionPolicy.profile(config,key).dedicated?{}:state);
    try {assertAppealDeadlineElapsed(publication);}
    catch(_) {throw new HttpsError('failed-precondition','Pubblicazione o termine ricorsi da completare per '+ElectionPolicy.ELECTIONS[key].label+'.');}
  }
}
async function assertElectionReadyForVoting(year,config) {
  const s=await loadRegularityState(year), missing=regularityMissing(s,config);
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
  if (snap.empty) {
    console.warn('[staff-auth]', JSON.stringify({
      reason: 'account-not-found', role, year: yearSuffix(year), projectId: db.projectId
    }));
    throw new HttpsError('permission-denied', 'Credenziali non valide.');
  }
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
  if (!valid) {
    console.warn('[staff-auth]', JSON.stringify({
      reason: record.passwordHash ? 'password-mismatch' : 'password-record-missing',
      role, year: yearSuffix(year), projectId: db.projectId
    }));
    throw new HttpsError('permission-denied', 'Credenziali non valide.');
  }

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
    staffDisplayName: record.name || uname,
    staffYear: String(year || ''),
    sessionVersion: Number(record.sessionVersion || 0),
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

function rejectExtraPreferences(ballot, prefix, max) {
  for (const [key, value] of Object.entries(ballot)) {
    if (key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length)) &&
        Number(key.slice(prefix.length)) > max && normalize(value)) {
      throw new HttpsError('invalid-argument', 'Numero di preferenze superiore al limite della scheda.');
    }
  }
}
function romeToday() {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Rome', year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function assertAppealDeadlineElapsed(state) {
  if (!state.resultsPublished || !/^\d{4}-\d{2}-\d{2}$/.test(state.appealDeadline || '') || romeToday() <= state.appealDeadline) {
    throw new HttpsError('failed-precondition', 'Il termine dei ricorsi non è ancora trascorso (ora italiana).');
  }
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
  rejectExtraPreferences(ballot, 'p', max);
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
  rejectExtraPreferences(ballot, 'candidate', max);
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
  if (!eligible.size) throw new HttpsError('failed-precondition', 'Elenco eleggibili non disponibile: scheda non registrata.');
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
  const allowed=new Set(['lista','classe','tipo','isBianca',...Array.from({length:10},(_,i)=>'p'+(i+1)),...Array.from({length:4},(_,i)=>'candidate'+(i+1))]);
  return Object.fromEntries(Object.entries(raw||{}).filter(([key])=>allowed.has(key)));
}
function readStoredBallot(raw,year,collection) {
  try {return sanitizeStoredBallot(raw?.schema==='LEVI_SEALED_V1'?BallotVault.open(raw,year,collection):raw);}
  catch(error) {throw new HttpsError('failed-precondition','Lettura protetta non riuscita. Verificare la chiave storica e l’integrità delle schede prima dello scrutinio.');}
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
  for (const [name, count] of Object.entries(preferenceCounts).sort(([a],[b])=>a.localeCompare(b))) {
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
  // The response is computed only from marginals, never from original pairings.
  // Original encrypted ballots stay in the protected archive for formal audit.
  const isClass = collectionName === 'voti_classe_studenti' || collectionName === 'voti_classe_genitori';
  const grouped = new Map();
  for (const row of rows) {
    const key = isClass ? String(row.classe || 'GEN') : (collectionName === 'voti_consiglio' ? String(row.tipo || 'GEN') : 'ALL');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const output = [];
  for (const [groupKey, groupRows] of [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b))) {
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
    for (const [list, count] of Object.entries(listCounts).sort(([a],[b])=>a.localeCompare(b))) {
      const synthetic = Array.from({ length: count }, () => ({ ...common, lista: list, isBianca: false, _aggregateOnly: true }));
      distributePreferences(synthetic, prefByList[list] || {}, 'p', 10);
      output.push(...synthetic);
    }
    for (let i = 0; i < noListCount; i++) output.push({ ...common, isBianca: false, _aggregateOnly: true });
  }
  return output.map(row=>({...row,_synthetic:true}));
}

exports.validateVoterToken = async (request) => {
  const token = normalize(request.data?.token);
  const year = request.data?.annoScolastico;
  if (!token || token.length > 80) throw new HttpsError('invalid-argument', 'Token non valido.');
  const config = await loadElectionConfig(year);
  await assertElectionReadyForVoting(year,config);
  assertVotingOpen(config);

  const anonymous=config.privacyMode===LegalReadiness.ANONYMOUS_MODE;
  const tokenRef = yearlyCollection(anonymous?'credenziali_anonime':'tokens', year).doc(anonymous?sha256(year+':'+token.replace(/[ -]/g,'')):token);
  const sessionId = crypto.randomBytes(32).toString('base64url');
  const sessionHash = sha256(sessionId);
  let voterData;

  await db.runTransaction(async (tx) => {
    const [snap,c,s] = await Promise.all([tx.get(tokenRef),tx.get(yearlyConfigRef(year)),tx.get(regularityStateRef(year))]);
    const current=c.data()||{},state=s.data()||{};
    if(state.emergencySuspended||state.procedureClosed||regularityMissing(state,current).length)throw new HttpsError('failed-precondition','Voto non ammesso: stato modificato durante l’accesso.');
    assertVotingOpen(current);
    if (!snap.exists) throw new HttpsError('not-found', 'Token non valido.');
    voterData = snap.data() || {};
    if(anonymous&&!VotingAdmission.anonymousRecord(voterData))throw new HttpsError('failed-precondition','Archivio credenziali non valido.');
    if(!activeVoterKeys(config,normalize(voterData.tipo)).some(k=>electionPhase(config,k)==='OPEN')) throw new HttpsError('failed-precondition','Nessuna scheda della tua componente è aperta in questa fascia oraria.');
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
    openElections: activeVoterKeys(config,normalize(voterData.tipo)).filter(k=>electionPhase(config,k)==='OPEN'),
    tipo: voterData.tipo,
    classe: voterData.classe || null,
    indirizzo: voterData.indirizzo || null,
    voted_consiglio: !!voterData.voted_consiglio,
    voted_istituto: !!voterData.voted_istituto,
    voted_consulta: !!voterData.voted_consulta,
    voted_classe_studente: !!voterData.voted_classe_studente,
    voted_classe_genitore: !!voterData.voted_classe_genitore
  };
};

exports.castVote = async (request) => {
  const sessionId = String(request.data?.sessionId || '');
  const year = request.data?.annoScolastico;
  const submitted = request.data?.ballots || {};
  if (!sessionId || sessionId.length > 200) throw new HttpsError('unauthenticated', 'Sessione di voto non valida.');
  const config = await loadElectionConfig(year);
  await assertElectionReadyForVoting(year,config);
  assertVotingOpen(config);
  const sessionHash = sha256(sessionId);

  const q = await yearlyCollection(config.privacyMode===LegalReadiness.ANONYMOUS_MODE?'credenziali_anonime':'tokens', year).where('activeSessionHash', '==', sessionHash).limit(1).get();
  if (q.empty) throw new HttpsError('unauthenticated', 'Sessione di voto non valida o già utilizzata.');
  const tokenRef = q.docs[0].ref;
  const tokenSnapshot = q.docs[0];
  const tokenDataBefore = tokenSnapshot.data() || {};

  // Validazione contenuti fuori dalla transazione per le query dei candidati di classe.
  const cleanBallots = {};
  const voterType = normalize(tokenDataBefore.tipo);
  const voterClass = normalize(tokenDataBefore.classe);
  const eligibleKeys=activeVoterKeys(config,voterType);
  for(const key of Object.keys(submitted)) {
    if(!submitted[key]) continue;
    if(!eligibleKeys.includes(key)) throw new HttpsError('permission-denied','Scheda non prevista per la componente.');
    assertVotingOpen(config,key);
  }


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
    const [tokenSnap,currentConfig,currentState] = await Promise.all([tx.get(tokenRef),tx.get(yearlyConfigRef(year)),tx.get(regularityStateRef(year))]);
    const current=currentConfig.data()||{};
    const state=currentState.data()||{};
    if(state.emergencySuspended||state.procedureClosed) throw new HttpsError('failed-precondition','Votazione sospesa o chiusa.');
    if(regularityMissing(state,current).length) throw new HttpsError('failed-precondition','I controlli di regolarità non sono completi.');
    for(const key of Object.keys(cleanBallots)) {
      if(!activeVoterKeys(current,voterType).includes(key)) throw new HttpsError('failed-precondition','La consultazione non è più abilitata.');
      assertVotingOpen(current,key);
    }

    if (!tokenSnap.exists) throw new HttpsError('not-found', 'Credenziale non disponibile.');
    const t = tokenSnap.data() || {};
    if(current.privacyMode===LegalReadiness.ANONYMOUS_MODE&&!VotingAdmission.anonymousRecord(t))throw new HttpsError('failed-precondition','Archivio credenziali non valido.');
    if(normalize(t.tipo)!==voterType||normalize(t.classe)!==voterClass) throw new HttpsError('failed-precondition','Credenziale modificata: accedere nuovamente.');
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
      let sealed;
      try {sealed=BallotVault.seal(clean,year,collectionName);}
      catch(error) {throw new HttpsError('failed-precondition','Cifratura delle schede non disponibile. Nessun voto è stato registrato.');}
      writes.push([ref, sealed]);
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
    // Receipt identifies only the random session, never a ballot or a choice.
    updates.completedSessionHash=sessionHash;
    updates.lastReceipt={fullyCompleted:updates.hasVoted,recordedBallots:writes.length};
    tx.update(tokenRef, updates);
    return { fullyCompleted: updates.hasVoted, recordedBallots: writes.length };
  });

  // Nessun audit individuale del voto: evita correlazioni temporali elettore/scheda.
  return { ok: true, ...result };
};

exports.getVoterSessionStatus=async request=>{
  const session=String(request.data?.sessionId||''),year=request.data?.annoScolastico;
  if(!/^[A-Za-z0-9_-]{43}$/.test(session)||!/^20\d{2}\/20\d{2}$/.test(year||''))throw new HttpsError('invalid-argument','Sessione non valida.');
  const config=await loadElectionConfig(year),collection=yearlyCollection(config.privacyMode===LegalReadiness.ANONYMOUS_MODE?'credenziali_anonime':'tokens',year),hash=sha256(session);
  const completed=await collection.where('completedSessionHash','==',hash).limit(1).get();
  if(!completed.empty){const receipt=completed.docs[0].data().lastReceipt||{};return {status:'COMMITTED',fullyCompleted:receipt.fullyCompleted===true,recordedBallots:Number(receipt.recordedBallots)||0};}
  const pending=await collection.where('activeSessionHash','==',hash).limit(1).get();
  return {status:!pending.empty&&pending.docs[0].data().sessionExpiresAt?.toMillis?.()>Date.now()?'PENDING':'UNKNOWN_OR_EXPIRED'};
};

exports.commissionLogin = async (request) => {
  const year = request.data?.annoScolastico;
  const username = String(request.data?.username || '').trim().toLowerCase();
  const password = String(request.data?.password || '');
  const result = await authenticateStaff({ username, password, requestedRole: 'COMMISSIONE', year });
  await auditAdmin({ uid: result.profile.id, role: 'COMMISSIONE' }, 'COMMISSION_LOGIN', { username });
  return result;
};


exports.technicalLogin = async (request) => {
  const result = await authenticateStaff({
    username: request.data?.username,
    password: request.data?.password,
    requestedRole: 'ASSISTENTE_TECNICO',
    year: request.data?.annoScolastico
  });
  await auditAdmin({ uid: result.profile.id, role: 'ASSISTENTE_TECNICO' }, 'TECHNICAL_LOGIN', { username: result.profile.username });
  return result;
};

function technicalActorName(actor) {
  return String(actor?.claims?.staffDisplayName || actor?.claims?.staffAccountId || 'Assistente tecnico').trim().slice(0, 160);
}

function technicalStation(config) {
  return String(config?.assistenteTecnico?.postazione || 'Postazione PC laboratoriale designata dall’Istituto').trim().slice(0, 200);
}

function technicalControls(config, state) {
  return {
    backendReachable: true,
    firebaseReachable: true,
    serverSideAuth: true,
    // Admin SDK bypasses Rules; this endpoint cannot certify deployed rules or anonymity.
    firestoreFailClosed: null,
    auditEnabled: null,
    anonymousBallotStorage: null,
    testMode: config.modalitaProva === true,
    regularityMissing: regularityMissing(state,config)
  };
}

function technicalControlsOk(controls) {
  return Object.entries(controls || {}).every(([key, value]) => {
    if (key === 'regularityMissing') return Array.isArray(value) ? value.length === 0 : value === false;
    if (key === 'testMode') return value !== true;
    return value === true;
  });
}

function privacyArchitectureAssessment(config={}) {
  const anonymous=config.privacyMode===LegalReadiness.ANONYMOUS_MODE;
  // Source-derived capability boundary, never a user-editable conformity flag.
  return {
    policyVersion:'LEVI_PRIVACY_BOUNDARY_V1',
    assessmentType:'ARCHITECTURE_CAPABILITIES',
    applicationResults:'AGGREGATES_ONLY_ALL_ROLES',
    originalBallotsExposedByApi:false,
    clientSideBallotEncryption:false,
    independentDecryptionTrustees:false,
    unlinkableVotingCredentials:false,
    namedCredentialMapping:!anonymous,credentialMode:anonymous?LegalReadiness.ANONYMOUS_MODE:'LEGACY_NAMED',
    databaseTransactionCorrelationPossible:true,
    structuralAnonymityVerified:false,
    limitation:anonymous?'Il database delle credenziali non contiene nomi né collegamenti al registro. La segretezza dipende anche dalla distribuzione casuale in presenza: IP, orari, piccoli gruppi, copie e privilegi cloud richiedono verifica indipendente. Il server vede le scelte e detiene la chiave; non è cifratura end-to-end.':'Il backend tratta identità e scelte e dispone della chiave. I metadati del database e del fornitore non sono resi non correlabili dalla sola cifratura.',
    requiredArchitecture:'Cifratura nel dispositivo, scrutinio verificabile sui soli totali, custodi indipendenti delle chiavi e separazione delle credenziali e dei metadati.',
    guidancePath:'anonimato.html'
  };
}

async function databasePrivacyStatus(year) {
  let total=0,legacy=0,unavailableKey=0,keyId='';
  try {keyId=BallotVault.keyMaterial().keyId;} catch (_) {}
  for(const name of BALLOT_COLLECTIONS) {
    const snapshot=await yearlyCollection(name,year).select('schema','keyId').get();
    total+=snapshot.size;
    legacy+=snapshot.docs.filter(d=>d.data()?.schema!=='LEVI_SEALED_V1').length;
    unavailableKey+=snapshot.docs.filter(d=>d.data()?.schema==='LEVI_SEALED_V1'&&d.data()?.keyId!==keyId).length;
  }
  return {total,legacy,unavailableKey};
}
function vaultSelfTest(year) {
  try {
    const sample={lista:'SELF_TEST',p1:'DATI_FITTIZI'};
    const encrypted=BallotVault.seal(sample,year,'self_test');
    return JSON.stringify(BallotVault.open(encrypted,year,'self_test'))===JSON.stringify(sample);
  } catch (_) {return false;}
}
async function technicalDiagnostics(config,state,year) {
  const privacy=await databasePrivacyStatus(year);
  const scheduleOk=ElectionPolicy.enabled(config).length>0 && ElectionPolicy.enabled(config).every(k=>{
    try {ElectionPolicy.validateProfile(ElectionPolicy.profile(config,k));return ElectionPolicy.windows(config,k).length>0;}catch(_){return false;}
  });
  return [
    {id:'connectivity',ok:true,label:'Collegamento autenticato ai servizi',action:'recheck',detail:'Risposta ricevuta dal backend e dal database.'},
    {id:'vault',ok:vaultSelfTest(year),label:'Cifratura delle nuove schede',action:'recheck',detail:'Prova di cifratura e lettura su dati fittizi; nessuna scheda reale modificata.'},
    {id:'databasePrivacy',ok:privacy.legacy===0,label:'Contenuti delle schede protetti nel database',action:privacy.legacy?'protectDatabase':'recheck',detail:privacy.legacy?privacy.legacy+' schede pregresse da cifrare. Operazione riservata alla Commissione a votazioni non in corso.':'Nessuna scheda in chiaro rilevata. Non certifica l’anonimato irreversibile.'},
    {id:'historicalKeys',ok:privacy.unavailableKey===0,label:'Chiavi delle schede archiviate',action:'review',detail:privacy.unavailableKey?privacy.unavailableKey+' schede richiedono la chiave storica: ripristinare la configurazione protetta. Non rigenerare le urne.':'Nessuna versione di chiave mancante rilevata. Custodire la chiave prima di ruotare le credenziali server.'},
    {id:'schedule',ok:scheduleOk,label:'Fasce orarie delle consultazioni',action:'configure',detail:'Date, orari e atti devono essere compilati per ciascuna consultazione.'},
    {id:'evidence',ok:!!state.technicalReportId&&state.technicalTestPassed===true,label:'Rapporto di collaudo richiamato dalla Commissione',action:'report',detail:'Richiede prove documentate; non può essere confermato automaticamente.'},
    {id:'aggregateAccess',ok:true,label:'Risultati aggregati anche per la Commissione',action:'recheck',detail:'Le API non restituiscono le schede originali o gli abbinamenti reali tra preferenze; restituiscono proiezioni dei conteggi.'},
    {id:'anonymity',ok:VotingAdmission.blockers(config,state,admissionBinding(config,state)).length===0,label:'Revisione del processo di segretezza',action:'privacyArchitecture',detail:privacyArchitectureAssessment(config).limitation}
  ];
}
exports.resolveTechnicalIssue = async (request) => {
  const actor=await requireAuth(request,['ASSISTENTE_TECNICO','COMMISSIONE']);
  const year=actor.claims.staffYear,action=String(request.data?.action||'');
  if(action==='recheck') {
    const config=await loadElectionConfig(year),state=await loadRegularityState(year);
    return {ok:true,diagnostics:await technicalDiagnostics(config,state,year),message:'Controlli rieseguiti: nessuna attestazione modificata.'};
  }
  if(action!=='protectDatabase') throw new HttpsError('invalid-argument','La correzione richiede un intervento documentale o una verifica della scuola.');
  if(actor.role!=='COMMISSIONE') throw new HttpsError('permission-denied','La cifratura delle schede pregresse deve essere avviata dalla Commissione.');
  const config=await loadElectionConfig(year);
  if(['OPEN','PAUSED'].includes(electionPhase(config))) throw new HttpsError('failed-precondition','Operazione bloccata durante le fasce di voto o le pause fra giornate elettorali.');
  if(!vaultSelfTest(year)) throw new HttpsError('failed-precondition','Chiave di cifratura non disponibile. Nessuna scheda è stata modificata.');
  const refs=[];let legacy=0;
  for(const name of BALLOT_COLLECTIONS) {
    const meta=await yearlyCollection(name,year).select('schema').get();
    const pending=meta.docs.filter(d=>d.data()?.schema!=='LEVI_SEALED_V1');legacy+=pending.length;
    for(const d of pending) if(refs.length<100) refs.push({ref:d.ref,name});
  }
  const processed=await db.runTransaction(async tx=>{
    const freshConfig=await tx.get(yearlyConfigRef(year));
    if(['OPEN','PAUSED'].includes(electionPhase(freshConfig.data()||{}))) throw new HttpsError('failed-precondition','Le operazioni elettorali sono in corso.');
    const snapshots=await Promise.all(refs.map(item=>tx.get(item.ref)));
    let count=0;
    for(let i=0;i<snapshots.length;i++) {
      const snapshot=snapshots[i];if(!snapshot.exists||snapshot.data()?.schema==='LEVI_SEALED_V1')continue;
      const clean=sanitizeStoredBallot(snapshot.data()),sealed=BallotVault.seal(clean,year,refs[i].name);
      if(JSON.stringify(BallotVault.open(sealed,year,refs[i].name))!==JSON.stringify(clean)) throw new HttpsError('internal','Verifica di integrità non superata.');
      tx.set(refs[i].ref,sealed);count++;
    }
    return count;
  });
  await auditAdmin(actor,'PROTECT_DATABASE_BALLOTS',{annoScolastico:year,processed});
  return {ok:true,processed,more:legacy>refs.length,message:'Schede cifrate con verifica del contenuto; le copie storiche esterne devono essere gestite separatamente.'};
};

exports.getTechnicalStatus = async (request) => {
  const actor = await requireAuth(request, ['ASSISTENTE_TECNICO', 'COMMISSIONE']);
  const year = request.data?.annoScolastico || actor.claims?.staffYear;
  enforceTechnicalYear(actor, year);
  const config = await loadElectionConfig(year);
  const state = await loadRegularityState(year);
  const eventsSnap = await yearlyCollection('audit_tecnico', year).orderBy('at', 'desc').limit(20).get();
  return {
    ok: true,
    role: actor.role,
    technicianName: technicalActorName(actor),
    year: String(year || '2026/2027'),
    phase: electionPhase(config),
    station: technicalStation(config),
    controls: technicalControls(config, state),
    privacyAssessment: {...privacyArchitectureAssessment(config),assessedAt:new Date().toISOString()},
    legalAssessment:legalAssessment(config,state),
    diagnostics: await technicalDiagnostics(config,state,year),
    recentEvents: eventsSnap.docs.map(d => ({
      id: d.id,
      event: d.data()?.event || '',
      technicianName: d.data()?.technicianName || '',
      station: d.data()?.station || '',
      phase: d.data()?.phase || '',
      result: d.data()?.result || '',
      note: d.data()?.note || '',
      at: timestampIso(d.data()?.at)
    }))
  };
};

exports.recordTechnicalCheckpoint = async (request) => {
  const actor = await requireAuth(request, ['ASSISTENTE_TECNICO', 'COMMISSIONE']);
  const year = request.data?.annoScolastico || actor.claims?.staffYear;
  enforceTechnicalYear(actor, year);
  const event = String(request.data?.event || '').trim().toUpperCase();
  const note = String(request.data?.note || '').replace(/[<>`"]/g, ' ').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!['OPENING', 'CLOSING'].includes(event)) throw new HttpsError('invalid-argument', 'Checkpoint tecnico non valido.');
  const config = await loadElectionConfig(year);
  const state = await loadRegularityState(year);
  const technicianName = technicalActorName(actor);
  const station = technicalStation(config);
  const controls = technicalControls(config, state);
  const result = technicalControlsOk(controls) ? 'OK' : 'ATTENZIONE';
  const ref = yearlyCollection('audit_tecnico', year).doc();
  await ref.create({
    event,
    technicianName,
    technicianAccountId: actor.claims?.staffAccountId || actor.uid,
    station,
    phase: electionPhase(config),
    result,
    note,
    controls,
    privacyAssessment:privacyArchitectureAssessment(config),
    release:releaseIdentity(),configurationSha256:configurationHash(config),credentialRevision:state.credentialRevision||null,
    admission:VotingAdmission.blockers(config,state,admissionBinding(config,state)).length?'VERIFICA_RICHIESTA':'AMMISSIONE_REGISTRATA',
    at: FieldValue.serverTimestamp()
  });
  await auditAdmin(actor, 'TECHNICAL_CHECKPOINT_RECORDED', { event, station, technicalLogId: ref.id });
  return { ok: true, id: ref.id, event, technicianName, station, phase: electionPhase(config), result, controls, recordedAt: new Date().toISOString() };
};

const TECHNICAL_TEST_IDS = Object.freeze([
  'identity','revokedAccess','duplicateVote','timeWindow','ballotValidation',
  'configurationFreeze','outageRecovery','tally','restore','accessibility','anonymity','cloudSecurity'
]);
const TEST_OUTCOMES = new Set(['PASS','FAIL','ISSUES','NOT_TESTED']);
function evidenceText(value, max = 1000) {
  return String(value || '').replace(/[<>`"\u0000-\u001F]/g, ' ').trim().slice(0, max);
}
function validateTechnicalReport(data) {
  const softwareVersion = evidenceText(data.softwareVersion, 160);
  const evidenceRef = evidenceText(data.evidenceRef, 300);
  if (!softwareVersion || !evidenceRef || data.testEnvironment !== 'ISOLATED_TEST') {
    throw new HttpsError('invalid-argument', 'Indicare versione, riferimento al verbale e ambiente di prova separato.');
  }
  const tests = TECHNICAL_TEST_IDS.map(id => {
    const source = data.tests?.[id];
    if (!source || !TEST_OUTCOMES.has(source.outcome)) throw new HttpsError('invalid-argument','Compilare l’esito di tutte le prove, anche quelle non eseguite.');
    const evidence = evidenceText(source.evidence, 600);
    if (source.outcome !== 'NOT_TESTED' && !evidence) throw new HttpsError('invalid-argument','Ogni prova eseguita richiede un riferimento all’evidenza o all’anomalia.');
    const method=evidenceText(source.method,500),expected=evidenceText(source.expected,500),observed=evidenceText(source.observed,600),testedAt=String(source.testedAt||'');
    if(source.outcome!=='NOT_TESTED'&&(!method||!expected||!observed||!Number.isFinite(Date.parse(testedAt))||Date.parse(testedAt)>Date.now()+60000))throw new HttpsError('invalid-argument','Ogni prova eseguita richiede metodo, atteso, osservato e data effettiva non futura.');
    return { id, outcome: source.outcome, evidence,method,expected,observed,testedAt:source.outcome==='NOT_TESTED'?null:new Date(testedAt).toISOString() };
  });
  const result = tests.some(t=>t.outcome==='FAIL') ? 'NON_SUPERATO'
    : tests.some(t=>t.outcome==='NOT_TESTED') ? 'NON_COMPLETO'
    : tests.some(t=>t.outcome==='ISSUES') ? 'CON_ANOMALIE' : 'PROVE_DICHIARATE_SUPERATE';
  return { softwareVersion, evidenceRef, testEnvironment:'ISOLATED_TEST', tests, result };
}

exports.recordTechnicalTestReport = async (request) => {
  const actor = await requireAuth(request, ['ASSISTENTE_TECNICO','COMMISSIONE']);
  const year = actor.claims.staffYear;
  const report = validateTechnicalReport(request.data || {});
  const config = await loadElectionConfig(year);
  const state=await loadRegularityState(year);
  const entry = {
    event:'COLLAUDO', technicianName:technicalActorName(actor),
    technicianAccountId:actor.claims.staffAccountId, station:technicalStation(config),
    phase:electionPhase(config), result:report.result,
    note:evidenceText(request.data?.note), report, privacyAssessment:privacyArchitectureAssessment(config),
    release:releaseIdentity(),configurationSha256:configurationHash(config),credentialRevision:state.credentialRevision||null,admission:VotingAdmission.blockers(config,state,admissionBinding(config,state)).length?'VERIFICA_RICHIESTA':'AMMISSIONE_REGISTRATA',
    at:FieldValue.serverTimestamp()
  };
  const ref = yearlyCollection('audit_tecnico', year).doc();
  await ref.create(entry);
  // La registrazione non conferma automaticamente technicalTestPassed.
  return { ok:true, id:ref.id, result:report.result };
};

exports.getTechnicalLogs = async (request) => {
  const actor = await requireAuth(request, ['ASSISTENTE_TECNICO', 'COMMISSIONE']);
  const year = request.data?.annoScolastico || actor.claims?.staffYear;
  enforceTechnicalYear(actor, year);
  const untilText = request.data?.snapshotUntil;
  const until = untilText ? new Date(untilText) : new Date();
  if (!Number.isFinite(until.getTime()) || until.getTime() > Date.now() + 1000) throw new HttpsError('invalid-argument','Intervallo dei log non valido.');
  const collection = yearlyCollection('audit_tecnico', year);
  let query = collection.where('at','<=',Timestamp.fromDate(until)).orderBy('at','desc');
  const cursor = String(request.data?.cursor || '');
  if (cursor) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(cursor)) throw new HttpsError('invalid-argument','Cursore non valido.');
    const previous = await collection.doc(cursor).get();
    if (!previous.exists) throw new HttpsError('invalid-argument','Il punto di continuazione non è più disponibile. Ripetere l’esportazione.');
    query = query.startAfter(previous);
  }
  const snap = await query.limit(101).get();
  const page = snap.docs.slice(0,100);
  return {
    ok:true, technicianName:technicalActorName(actor), year:String(year),
    snapshotUntil:until.toISOString(),
    nextCursor:snap.docs.length > 100 ? page[page.length-1].id : null,
    logs:page.map(d => {
      const v=d.data()||{};
      const report=v.event==='COLLAUDO' && v.report ? {
        softwareVersion:evidenceText(v.report.softwareVersion,160),
        evidenceRef:evidenceText(v.report.evidenceRef,300),
        testEnvironment:'ISOLATED_TEST',
        tests:(Array.isArray(v.report.tests)?v.report.tests:[])
          .filter(t=>TECHNICAL_TEST_IDS.includes(t.id)&&TEST_OUTCOMES.has(t.outcome))
          .map(t=>({id:t.id,outcome:t.outcome,evidence:evidenceText(t.evidence,600),method:evidenceText(t.method,500),expected:evidenceText(t.expected,500),observed:evidenceText(t.observed,600),testedAt:timestampIso(t.testedAt)}))
      }:null;
      return {id:d.id,event:v.event||'',technicianName:v.technicianName||'',station:v.station||'',
        phase:v.phase||'',result:v.result||'',note:v.note||'',at:timestampIso(v.at),report,
        release:v.release||null,configurationSha256:v.configurationSha256||null,admission:v.admission||'NON_ATTESTATO',
        privacyAssessment:v.privacyAssessment?.policyVersion==='LEVI_PRIVACY_BOUNDARY_V1'?{
          policyVersion:'LEVI_PRIVACY_BOUNDARY_V1',
          structuralAnonymityVerified:v.privacyAssessment.structuralAnonymityVerified===true,
          limitation:evidenceText(v.privacyAssessment.limitation,1000),
          applicationResults:evidenceText(v.privacyAssessment.applicationResults,100)
        }:null};
    })
  };
};

exports.changeCommissionPassword = async (request) => {
  if (!request.auth || normalize(request.auth.token.role) !== 'COMMISSIONE') {
    throw new HttpsError('unauthenticated', 'Sessione Commissione richiesta.');
  }
  const accountId = String(request.auth.token.staffAccountId || '').trim();
  const year = String(request.data?.annoScolastico || '').trim();
  if (request.auth.token.staffYear !== year) throw new HttpsError('permission-denied','Anno della sessione non valido. Effettuare nuovamente il login.');
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
  if (Number(record.sessionVersion || 0) !== Number(request.auth.token.sessionVersion || 0)) throw new HttpsError('permission-denied','Sessione revocata.');
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
      passwordChangedBy: accountId,
      sessionVersion: Number(record.sessionVersion || 0) + 1
    });
  } else {
    throw new HttpsError('invalid-argument', 'La nuova password deve essere diversa dalla password temporanea o precedente.');
  }

  const claims = {
    role: 'COMMISSIONE',
    scopeClass: record.scopeClass || 'TUTTE',
    staffAccountId: accountId,
    staffYear: String(year || ''),
    sessionVersion: Number(record.sessionVersion || 0) + 1,
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
};

exports.managementLogin = async (request) => {
  const result = await authenticateStaff({
    username: request.data?.username,
    password: request.data?.password,
    requestedRole: request.data?.requestedRole,
    year: request.data?.annoScolastico
  });
  await auditAdmin({ uid: result.profile.id, role: result.profile.role }, 'STAFF_LOGIN', { username: result.profile.username });
  return result;
};

exports.referentLogin = async (request) => {
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
};

exports.getAnonymousBallots = async (request) => {
  const actor = await requireAuth(request, ['COMMISSIONE', 'DIRIGENTE', 'VICEPRESIDE', 'DSGA', 'SEGRETERIA', 'REFERENTE']);
  const collectionName = String(request.data?.collection || '');
  const year = request.data?.annoScolastico;
  if (!BALLOT_COLLECTIONS.has(collectionName)) throw new HttpsError('invalid-argument', 'Urna non valida.');

  const config = await loadElectionConfig(year);
  const phase = electionPhase(config,ElectionPolicy.keyForCollection(collectionName));
  let query = yearlyCollection(collectionName, year);

  if (actor.role === 'REFERENTE') {
    const required = actor.claims.referentType === 'STUDENTE' ? 'voti_classe_studenti' : 'voti_classe_genitori';
    if (collectionName !== required) throw new HttpsError('permission-denied', 'Componente non autorizzata.');
    // Classe e tipo sono cifrati: il filtro viene applicato dopo la lettura protetta.
  }

  const snap = await query.get();
  let sanitized = BallotVault.shuffle(snap.docs.map(docSnap=>readStoredBallot(docSnap.data(),year,collectionName)));
  if(actor.role==='REFERENTE') sanitized=sanitized.filter(row=>normalize(row.classe)===normalize(actor.claims.scopeClass));

  // Durante la votazione nessun ruolo vede le preferenze parziali.
  if (!['CLOSED','RELEASED'].includes(phase)) {
    return { phase, ballots: makeTurnoutProjection(sanitized), aggregateOnly: true };
  }

  // No application role receives the original combinations of preferences.
  // The Commission counts the same marginals without individual ballot access.
  if (actor.role === 'COMMISSIONE') {
    return { phase, ballots: makeAggregateProjection(sanitized,collectionName), aggregateOnly: true, representation:'SYNTHETIC_AGGREGATES' };
  }

  // Dirigenza/Segreteria e Referenti ricevono solo una proiezione aggregata,
  // e solo quando gli esiti sono stati formalmente rilasciati.
  if (phase !== 'RELEASED') {
    return { phase, ballots: makeTurnoutProjection(sanitized), aggregateOnly: true };
  }
  return { phase, ballots: makeAggregateProjection(sanitized, collectionName), aggregateOnly: true, representation:'SYNTHETIC_AGGREGATES' };
};

exports.createStaffAccount = async (request) => {
  const actor = await requireAuth(request, ['COMMISSIONE']);
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
};

exports.getStaffAccounts = async (request) => {
  await requireAuth(request, ['COMMISSIONE']);
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
};

exports.setStaffAccountActive = async (request) => {
  const actor = await requireAuth(request, ['COMMISSIONE']);
  const year = request.data?.annoScolastico;
  const id = String(request.data?.id || '');
  const active = request.data?.active === true;
  if (!id) throw new HttpsError('invalid-argument', 'Account mancante.');
  await yearlyCollection('gestione_accessi', year).doc(id).update({ active, sessionVersion: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  await auditAdmin(actor, 'SET_STAFF_ACCOUNT_ACTIVE', { accountId: id, active });
  return { ok: true };
};

exports.getRegularityState = async (request) => {
  await requireAuth(request,['COMMISSIONE','DIRIGENTE','VICEPRESIDE','DSGA','SEGRETERIA']);
  const year=request.data?.annoScolastico, state=await loadRegularityState(year);
  const snap=await regularityAppeals(year).orderBy('filedAt','desc').limit(100).get();
  const appeals=snap.docs.map(d=>{const x=d.data()||{};return{id:d.id,electionKey:x.electionKey||'',protocolRef:x.protocolRef||'',subject:x.subject||'',status:x.status||'OPEN',decisionRef:x.decisionRef||'',filedAt:timestampIso(x.filedAt),decidedAt:timestampIso(x.decidedAt)}});
  const config=await loadElectionConfig(year);
  const missing=regularityMissing(state,config);
  return{state:serializeRegularityState(state),appeals,missing,legalAssessment:legalAssessment(config,state),readyForVoting:missing.length===0&&!state.emergencySuspended&&!state.procedureClosed};
};

// Anonymous credentials are created independently of individuals. No code/name export exists.
exports.createAnonymousCredentials=async request=>{
  const actor=await requireAuth(request,['COMMISSIONE']),year=actor.claims.staffYear;
  const tipo=normalize(request.data?.tipo),classe=normalize(request.data?.classe),count=Number(request.data?.count),protocolRef=evidenceText(request.data?.protocolRef,200);
  if(!['STUDENTE','GENITORE','DOCENTE','ATA'].includes(tipo)||!Number.isInteger(count)||count<1||count>250||!protocolRef||!/^[A-Z0-9 -]{0,30}$/.test(classe))throw new HttpsError('invalid-argument','Componente, classe, quantità (1–250) e verbale richiesti.');
  if(['STUDENTE','GENITORE'].includes(tipo)&&!classe)throw new HttpsError('invalid-argument','Classe obbligatoria.');
  const codes=Array.from({length:count},()=>crypto.randomBytes(16).toString('hex').toUpperCase());
  const poolRef=yearlyCollection('lotti_credenziali',year).doc(sha256(tipo+':'+classe)),eventRef=regularityEvents(year).doc();
  await db.runTransaction(async tx=>{
    const [c,s,pool,roll]=await Promise.all([tx.get(yearlyConfigRef(year)),tx.get(regularityStateRef(year)),tx.get(poolRef),tx.get(yearlyCollection('tokens',year).where('tipo','==',tipo).where('classe','==',classe))]);
    const config=c.data()||{},state=s.data()||{},issued=Number(pool.data()?.issued)||0;
    if(config.privacyMode!==LegalReadiness.ANONYMOUS_MODE||!['BEFORE','UNCONFIGURED'].includes(electionPhase(config))||state.voterRollFinal!==true||state.votingReview?.stage==='AUTHORIZED')throw new HttpsError('failed-precondition','Prima definire gli elenchi, scegliere i codici non nominativi e restare nella fase preparatoria, prima dell’autorizzazione.');
    if(issued+count>roll.size)throw new HttpsError('failed-precondition','La quantità supera gli aventi diritto del gruppo o i codici sono già stati emessi. Nessuna rigenerazione automatica.');
    for(const code of codes)tx.create(yearlyCollection('credenziali_anonime',year).doc(sha256(year+':'+code)),{schema:LegalReadiness.ANONYMOUS_MODE,tipo,classe,hasVoted:false,voted_consiglio:false,voted_istituto:false,voted_consulta:false,voted_classe_studente:false,voted_classe_genitore:false});
    tx.set(poolRef,{tipo,classe,issued:issued+count,eligible:roll.size});
    tx.create(eventRef,{type:'ANONYMOUS_BATCH',tipo,classe,count,protocolRef,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
    tx.set(regularityStateRef(year),{votingReview:{stage:'PREPARATION'},credentialRevision:crypto.randomUUID(),technicalTestPassed:false},{merge:true});
  });
  return {ok:true,codes,tipo,classe,warning:'Stampa unica: mescolare cedolini chiusi e distribuirli casualmente dopo il riconoscimento in presenza. Non annotare il codice accanto al nome. Se il file va perso, i codici non sono recuperabili: verbalizzare la gestione del lotto prima di procedere.'};
};

function reviewPerson(actor){return {id:actor.claims.staffAccountId,name:technicalActorName(actor),role:actor.role};}
function assertDifferentPerson(actor,previous){
  if(!previous||previous.id===actor.claims.staffAccountId||canonicalName(previous.name)===canonicalName(technicalActorName(actor)))throw new HttpsError('permission-denied','La verifica richiede una persona diversa, con un proprio account nominativo.');
}
exports.getVotingReview=async request=>{
  const actor=await requireAuth(request,['COMMISSIONE','ASSISTENTE_TECNICO','DIRIGENTE']),year=actor.claims.staffYear;
  const config=await loadElectionConfig(year),state=await loadRegularityState(year);
  const batches=await yearlyCollection('lotti_credenziali',year).get();
  return {year,role:actor.role,release:releaseIdentity(),configurationSha256:configurationHash(config),credentialRevision:state.credentialRevision||null,privacyMode:config.privacyMode||'LEGACY_NAMED',review:state.votingReview||{stage:'PREPARATION'},suspended:state.emergencySuspended===true,closed:state.procedureClosed===true,
    assessment:legalAssessment(config,state),privacy:privacyArchitectureAssessment(config),batches:batches.docs.map(d=>{const x=d.data();return {tipo:x.tipo,classe:x.classe,issued:x.issued,eligible:x.eligible};})};
};
exports.getAnonymousParticipation=async request=>{
  const actor=await requireAuth(request,['COMMISSIONE','DIRIGENTE','VICEPRESIDE','DSGA','SEGRETERIA']),year=actor.claims.staffYear;
  const config=await loadElectionConfig(year);
  if(config.privacyMode!==LegalReadiness.ANONYMOUS_MODE)throw new HttpsError('failed-precondition','Riepilogo riservato al processo con codici non nominativi.');
  const flags=['voted_consiglio','voted_istituto','voted_consulta','voted_classe_studente','voted_classe_genitore'];
  const [roll,credentials]=await Promise.all([yearlyCollection('tokens',year).select('tipo').get(),yearlyCollection('credenziali_anonime',year).select('tipo','hasVoted',...flags).get()]);
  const stats=Object.fromEntries(['STUDENTE','GENITORE','DOCENTE','ATA'].map(k=>[k,{generated:0,issued:0,voted:0,completed:0}]));
  roll.forEach(d=>{const row=stats[d.data()?.tipo];if(row)row.generated++;});
  credentials.forEach(d=>{const value=d.data(),row=stats[value.tipo];if(row){row.issued++;if(flags.some(k=>value[k]===true))row.voted++;if(value.hasVoted===true)row.completed++;}});
  return {stats,totalEligible:roll.size,totalIssued:credentials.size,totalParticipated:Object.values(stats).reduce((n,s)=>n+s.voted,0),definition:'Codici con almeno una scheda depositata; conteggi aggregati senza collegamento al nome.'};
};
exports.getVotingReviewEvents=async request=>{
  const actor=await requireAuth(request,['COMMISSIONE','ASSISTENTE_TECNICO']),year=actor.claims.staffYear;
  const until=request.data?.snapshotUntil?new Date(request.data.snapshotUntil):new Date();
  if(!Number.isFinite(+until)||+until>Date.now()+1000)throw new HttpsError('invalid-argument','Intervallo non valido.');
  const collection=regularityEvents(year);let query=collection.where('at','<=',Timestamp.fromDate(until)).orderBy('at','desc');
  const cursor=String(request.data?.cursor||'');
  if(cursor){if(!/^[A-Za-z0-9_-]{1,128}$/.test(cursor))throw new HttpsError('invalid-argument','Cursore non valido.');const previous=await collection.doc(cursor).get();if(!previous.exists)throw new HttpsError('failed-precondition','Evento non più disponibile: ripetere l’esportazione.');query=query.startAfter(previous);}
  const snap=await query.limit(101).get(),page=snap.docs.slice(0,100);
  const allowed=['type','control','value','previousValue','note','evidence','review','previousReview','reason','protocolRef','title','details','suspend','actorUid','release','configurationSha256','sha256','previousSha256','tipo','classe','count'];
  const types=new Set(['CONTROL_UPDATE','INCIDENT','SUSPENSION','RESUMPTION','DPO_PROFILE_UPDATED','ANONYMOUS_BATCH','VOTING_REVIEW_PROPOSE','VOTING_REVIEW_VERIFY','VOTING_REVIEW_AUTHORIZE','VOTING_REVIEW_REJECT']);
  return {snapshotUntil:until.toISOString(),nextCursor:snap.docs.length>100?page.at(-1).id:null,
    events:page.filter(d=>types.has(d.data()?.type)).map(d=>({id:d.id,at:timestampIso(d.data().at),...Object.fromEntries(allowed.filter(k=>Object.hasOwn(d.data(),k)).map(k=>[k,d.data()[k]]))}))};
};
exports.advanceVotingReview=async request=>{
  const actor=await requireAuth(request,['COMMISSIONE','ASSISTENTE_TECNICO']),year=actor.claims.staffYear;
  const action=String(request.data?.action||''),note=evidenceText(request.data?.note,1500),protocolRef=evidenceText(request.data?.protocolRef,200),evidenceSha256=String(request.data?.evidenceSha256||'');
  if(!['PROPOSE','VERIFY','AUTHORIZE','REJECT'].includes(action)||!note||!protocolRef||!/^[a-f0-9]{64}$/i.test(evidenceSha256))throw new HttpsError('invalid-argument','Indicare azione, motivazione, protocollo ed impronta SHA-256 del documento di evidenza.');
  if(action==='AUTHORIZE'&&actor.role!=='COMMISSIONE')throw new HttpsError('permission-denied','La decisione operativa spetta alla Commissione.');
  const eventRef=regularityEvents(year).doc(),stateRef=regularityStateRef(year),now=new Date().toISOString();
  await db.runTransaction(async tx=>{
    const [c,s]=await Promise.all([tx.get(yearlyConfigRef(year)),tx.get(stateRef)]),config=c.data()||{},state=s.data()||{},binding=admissionBinding(config,state),previous=state.votingReview||{};
    if(state.procedureClosed)throw new HttpsError('failed-precondition','Procedimento chiuso.');
    if(!binding.commit)throw new HttpsError('failed-precondition','Versione distribuita non attestata. Eseguire la procedura sul rilascio Vercel identificato.');
    if(!['BEFORE','UNCONFIGURED'].includes(electionPhase(config))&&!state.emergencySuspended)throw new HttpsError('failed-precondition','Durante la votazione sospendere il servizio prima di rivedere il collaudo.');
    let review;
    const evidence={...reviewPerson(actor),at:now,note,protocolRef,evidenceSha256:evidenceSha256.toLowerCase()};
    if(action==='PROPOSE'){
      if(LegalReadiness.structuralBlockers(config).length||config.modalitaProva===true)throw new HttpsError('failed-precondition','Configurare il processo con credenziali non nominative, fuori dalla modalità prova.');
      const reportId=String(request.data?.reportId||'');
      if(!/^[A-Za-z0-9_-]{1,128}$/.test(reportId))throw new HttpsError('invalid-argument','ID del collaudo obbligatorio.');
      const reportSnap=await tx.get(yearlyCollection('audit_tecnico',year).doc(reportId)),report=reportSnap.data()||{};
      if(report.event!=='COLLAUDO'||report.result!=='PROVE_DICHIARATE_SUPERATE'||report.release?.commit!==binding.commit||report.report?.softwareVersion!==binding.commit||report.configurationSha256!==binding.configurationSha256||(report.credentialRevision||null)!==binding.credentialRevision)throw new HttpsError('failed-precondition','Servono tutte le prove dichiarate superate su questa versione e configurazione, comprese distribuzione dei codici, log e ripristino.');
      review={...binding,stage:'PROPOSED',proposal:evidence,reportId,reportAuthor:{id:report.technicianAccountId,name:report.technicianName},incidentId:state.blockingEventId||null};
    }else{
      if(action!=='REJECT'&&(previous.commit!==binding.commit||previous.configurationSha256!==binding.configurationSha256||previous.credentialRevision!==binding.credentialRevision))throw new HttpsError('failed-precondition','Versione o configurazione cambiata. Presentare una nuova proposta.');
      if(action==='VERIFY'){
        if(previous.stage!=='PROPOSED')throw new HttpsError('failed-precondition','Presentare prima una proposta di risoluzione.');
        assertDifferentPerson(actor,previous.proposal);assertDifferentPerson(actor,previous.reportAuthor);
        review={...previous,stage:'VERIFIED',verification:evidence};
      }else if(action==='AUTHORIZE'){
        if(previous.stage!=='VERIFIED')throw new HttpsError('failed-precondition','Verifica indipendente non completata.');
        assertDifferentPerson(actor,previous.verification);
        const missing=REGULARITY_PRE_VOTE_CONTROLS.filter(k=>state[k]!==true);
        if(missing.length)throw new HttpsError('failed-precondition','Completare i controlli di regolarità: '+missing.join(', '));
        review={...previous,stage:'AUTHORIZED',authorization:evidence};
      }else review={...previous,stage:'REJECTED',rejection:evidence};
    }
    tx.set(stateRef,{votingReview:review,...(action==='REJECT'?{emergencySuspended:true}:{}),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    tx.create(eventRef,{type:'VOTING_REVIEW_'+action,review,at:FieldValue.serverTimestamp(),actorUid:actor.uid});
  });
  return {ok:true};
};

const DPO_PROFILE_FIELDS=['legalBasis','dpoOpinion','providers','backups','retention','riskAssessment','incidentResponse','stationProcedure','evidenceCustody','accessibility'];
exports.getDpoDossierMaterials=async request=>{
  await requireAuth(request,['COMMISSIONE']);
  const fs=require('node:fs'),path=require('node:path'),definition=require('../lib/dpo-dossier');
  const read=name=>fs.readFileSync(path.join(__dirname,'..','docs',name),'utf8');
  return {version:definition.VERSION,fields:definition.fields,sections:definition.sections,release:releaseIdentity(),
    inventory:read('inventario-release.json'),development:read('verifiche-sviluppo.json'),procedure:read('19_FASCICOLO_DPO_E_RIPRESA.md')};
};
exports.getPrivateTechnicalDocument=async request=>{
  await requireAuth(request,['COMMISSIONE','ASSISTENTE_TECNICO']);
  const names={'checklist':'12_VERIFICHE_PRIMA_DEL_VOTO.md','consultazioni':'16_CONSULTAZIONI_E_PROTEZIONE_SCHEDE.md'};
  const name=names[request.data?.document];
  if(!name)throw new HttpsError('invalid-argument','Documento non disponibile.');
  return {name,content:require('node:fs').readFileSync(require('node:path').join(__dirname,'..','docs',name),'utf8')};
};
exports.getDpoReviewProfile=async request=>{
  const actor=await requireAuth(request,['COMMISSIONE']),year=actor.claims.staffYear;
  const snap=await yearlyCollection('fascicolo_privacy',year).doc('profile').get(),source=snap.data()||{};
  return {fields:Object.fromEntries(DPO_PROFILE_FIELDS.map(k=>[k,evidenceText(source.fields?.[k],4000)])),updatedAt:timestampIso(source.updatedAt),updatedBy:source.updatedBy||null,
    dpo:{name:'Vargiu Scuola S.r.l.',email:'dpo@vargiuscuola.it'},release:releaseIdentity()};
};
exports.saveDpoReviewProfile=async request=>{
  const actor=await requireAuth(request,['COMMISSIONE']),year=actor.claims.staffYear;
  const source=request.data?.fields;
  if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(k=>!DPO_PROFILE_FIELDS.includes(k)))throw new HttpsError('invalid-argument','Campi del fascicolo non validi.');
  const fields=Object.fromEntries(DPO_PROFILE_FIELDS.map(k=>[k,evidenceText(source[k],4000)])),ref=yearlyCollection('fascicolo_privacy',year).doc('profile'),eventRef=regularityEvents(year).doc();
  await db.runTransaction(async tx=>{
    const [s,c,old]=await Promise.all([tx.get(regularityStateRef(year)),tx.get(yearlyConfigRef(year)),tx.get(ref)]),state=s.data()||{},config=c.data()||{};
    if(state.procedureClosed||(!['BEFORE','UNCONFIGURED'].includes(electionPhase(config))&&!state.emergencySuspended))throw new HttpsError('failed-precondition','Modifica del fascicolo in preparazione o durante una sospensione verbalizzata.');
    tx.set(ref,{fields,updatedAt:FieldValue.serverTimestamp(),updatedBy:reviewPerson(actor)});
    tx.create(eventRef,{type:'DPO_PROFILE_UPDATED',previousSha256:sha256(JSON.stringify(old.data()?.fields||{})),sha256:sha256(JSON.stringify(fields)),actorUid:actor.uid,at:FieldValue.serverTimestamp()});
    tx.set(regularityStateRef(year),{votingReview:{stage:'PREPARATION'},credentialRevision:crypto.randomUUID()},{merge:true});
  });
  return {ok:true};
};

exports.setRegularityControl = async (request) => {
  const actor=await requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico;
  const control=String(request.data?.control||''),value=request.data?.value===true,note=String(request.data?.note||'').trim().slice(0,1000);
  if(!REGULARITY_ALL_CONTROLS.has(control)) throw new HttpsError('invalid-argument','Controllo non valido.');
  const config=await loadElectionConfig(year);
  if(REGULARITY_PRE_VOTE_CONTROLS.includes(control)&&!['BEFORE','UNCONFIGURED'].includes(electionPhase(config))) throw new HttpsError('failed-precondition','I controlli preliminari non sono modificabili dopo l’apertura della finestra elettorale.');
  if(value && !note) throw new HttpsError('invalid-argument','Indicare gli estremi del documento o della verifica che giustifica la conferma.');
  if(control==='appealWindowClosed' && value) assertAllPublicationDeadlines(config,await loadRegularityState(year));
  let reportId='';
  if(control==='technicalTestPassed' && value) {
    if(LegalReadiness.structuralBlockers(config).length) throw new HttpsError('failed-precondition',LegalReadiness.BLOCKER_LABELS.structuralSecrecy);
    reportId=String(request.data?.reportId||'');
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(reportId)) throw new HttpsError('invalid-argument','Indicare l’ID del rapporto di collaudo registrato nell’area tecnica.');
    const report=await yearlyCollection('audit_tecnico',year).doc(reportId).get();
    if(!report.exists || report.data()?.event!=='COLLAUDO' || report.data()?.result!=='PROVE_DICHIARATE_SUPERATE') throw new HttpsError('failed-precondition','Il rapporto indicato è assente oppure contiene prove non superate, anomalie o verifiche mancanti.');
  }
  const ref=regularityStateRef(year);
  const eventRef=regularityEvents(year).doc();
  const evidence={note,recordedAt:new Date().toISOString(),recordedBy:actor.claims.staffAccountId,release:releaseIdentity(),configurationSha256:configurationHash(config),historyId:eventRef.id};
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),cur={...emptyRegularityState(),...(snap.exists?snap.data():{})};
    tx.set(ref,{[control]:value,...(control==='technicalTestPassed'?{technicalReportId:reportId}:{}),notes:{...(cur.notes||{}),[control]:note},evidence:{...(cur.evidence||{}),[control]:evidence},updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
    tx.set(eventRef,{type:'CONTROL_UPDATE',control,value,previousValue:cur[control]===true,note,evidence,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
  });
  await auditAdmin(actor,'REGULARITY_CONTROL_UPDATE',{control,value}); return{ok:true};
};

exports.recordResultsPublication = async (request) => {
  const actor=await requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico;
  const electionKey=requestElectionKey(request);
  const protocolRef=String(request.data?.protocolRef||'').trim().slice(0,160), appealDeadline=String(request.data?.appealDeadline||'').trim();
  if(!protocolRef||!/^\d{4}-\d{2}-\d{2}$/.test(appealDeadline)) throw new HttpsError('invalid-argument','Inserire estremi pubblicazione e termine ricorsi AAAA-MM-GG.');
  if(!['CLOSED','RELEASED'].includes(electionPhase(await loadElectionConfig(year),electionKey))) throw new HttpsError('failed-precondition','Pubblicazione consentita solo dopo l’ultima chiusura della consultazione selezionata.');
  if(appealDeadline < romeToday() || new Date(appealDeadline+'T12:00:00Z').toISOString().slice(0,10)!==appealDeadline) throw new HttpsError('invalid-argument','Termine ricorsi non valido o già trascorso.');
  const publication={resultsPublished:true,resultsPublishedAt:FieldValue.serverTimestamp(),resultsPublicationProtocol:protocolRef,appealDeadline};
  await regularityStateRef(year).set({...(electionKey?{publications:{[electionKey]:publication}}:publication),appealWindowClosed:false,legalHold:true,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
  await regularityEvents(year).add({type:'RESULTS_PUBLICATION',electionKey,protocolRef,appealDeadline,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
  await auditAdmin(actor,'RESULTS_PUBLICATION_RECORDED',{electionKey,protocolRef,appealDeadline}); return{ok:true};
};

exports.fileElectoralAppeal = async (request) => {
  const actor=await requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico;
  const electionKey=requestElectionKey(request);
  const protocolRef=String(request.data?.protocolRef||'').trim().slice(0,160),subject=String(request.data?.subject||'').trim().slice(0,1000);
  if(!protocolRef||!subject) throw new HttpsError('invalid-argument','Protocollo e oggetto obbligatori.');
  const ref=regularityAppeals(year).doc(); await ref.set({electionKey,protocolRef,subject,status:'OPEN',filedAt:FieldValue.serverTimestamp(),createdBy:actor.uid});
  await regularityStateRef(year).set({legalHold:true,appealWindowClosed:false,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await auditAdmin(actor,'ELECTORAL_APPEAL_FILED',{appealId:ref.id,protocolRef}); return{ok:true,id:ref.id};
};

exports.resolveElectoralAppeal = async (request) => {
  const actor=await requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico,id=String(request.data?.id||''),decisionRef=String(request.data?.decisionRef||'').trim().slice(0,200);
  if(!id||!decisionRef) throw new HttpsError('invalid-argument','Ricorso e decisione obbligatori.');
  const ref=regularityAppeals(year).doc(id),snap=await ref.get(); if(!snap.exists) throw new HttpsError('not-found','Ricorso non trovato.');
  await ref.update({status:'RESOLVED',decisionRef,decidedAt:FieldValue.serverTimestamp(),decidedBy:actor.uid});
  await auditAdmin(actor,'ELECTORAL_APPEAL_RESOLVED',{appealId:id,decisionRef}); return{ok:true};
};

exports.recordElectoralIncident = async (request) => {
  const actor=await requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico;
  const protocolRef=String(request.data?.protocolRef||'').trim().slice(0,160),title=String(request.data?.title||'').trim().slice(0,200),details=String(request.data?.details||'').trim().slice(0,2000),suspend=request.data?.suspend===true;
  if(!title||!details) throw new HttpsError('invalid-argument','Titolo e descrizione obbligatori.');
  const eventRef=regularityEvents(year).doc();
  await db.runTransaction(async tx=>{
    const prior=await tx.get(regularityStateRef(year));
    tx.create(eventRef,{type:'INCIDENT',protocolRef,title,details,suspend,previousReview:prior.data()?.votingReview||null,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
    tx.set(regularityStateRef(year),{...(suspend?{emergencySuspended:true,blockingEventId:eventRef.id,votingReview:{stage:'SUSPENDED'}}:{}),lastIncidentAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
  });
  await auditAdmin(actor,'ELECTORAL_INCIDENT_RECORDED',{protocolRef,title,suspend}); return{ok:true};
};

exports.setEmergencySuspension = async request=>{
  const actor=await requireAuth(request,['COMMISSIONE']),year=actor.claims.staffYear,suspended=request.data?.suspended===true,reason=evidenceText(request.data?.reason,1000);
  if(!reason)throw new HttpsError('invalid-argument','Motivazione obbligatoria.');
  const eventRef=regularityEvents(year).doc();
  await db.runTransaction(async tx=>{
    const [s,c]=await Promise.all([tx.get(regularityStateRef(year)),tx.get(yearlyConfigRef(year))]),state=s.data()||{},config=c.data()||{};
    if(!suspended){
      if(state.procedureClosed||regularityMissing(state,config).length)throw new HttpsError('failed-precondition','Ripresa bloccata: completare intervento, verifica indipendente e autorizzazione per la configurazione corrente.');
      if(!state.emergencySuspended)throw new HttpsError('failed-precondition','Nessuna sospensione da chiudere.');
    }
    tx.set(regularityStateRef(year),{emergencySuspended:suspended,suspensionReason:reason,...(suspended?{blockingEventId:eventRef.id,votingReview:{stage:'SUSPENDED'}}:{}),updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
    tx.create(eventRef,{type:suspended?'SUSPENSION':'RESUMPTION',reason,previousReview:state.votingReview||null,release:releaseIdentity(),configurationSha256:configurationHash(config),actorUid:actor.uid,at:FieldValue.serverTimestamp()});
  });
  return {ok:true};
};

exports.closeElectoralProcedure = async (request) => {
  const actor=await requireAuth(request,['COMMISSIONE']),year=request.data?.annoScolastico,closureRef=String(request.data?.closureRef||'').trim().slice(0,200);
  if(!closureRef) throw new HttpsError('invalid-argument','Estremi verbale di chiusura obbligatori.');
  if(!['CLOSED','RELEASED'].includes(electionPhase(await loadElectionConfig(year)))) throw new HttpsError('failed-precondition','Non tutte le consultazioni hanno concluso le fasce di voto.');
  const state=await loadRegularityState(year); if(!state.appealWindowClosed||!state.finalArchiveSealed) throw new HttpsError('failed-precondition','Completare pubblicazione, ricorsi e sigillo fascicolo.');
  assertAllPublicationDeadlines(await loadElectionConfig(year),state);
  const open=await regularityAppeals(year).where('status','==','OPEN').limit(1).get(); if(!open.empty) throw new HttpsError('failed-precondition','Esistono ricorsi ancora aperti.');
  const accounts=await yearlyCollection('gestione_accessi',year).get(); let count=0,batch=db.batch();
  for(const d of accounts.docs){if(MANAGEMENT_ROLES.has(normalize(d.data()?.role))){batch.update(d.ref,{active:false,closedProcedureRevocationAt:FieldValue.serverTimestamp(),closedProcedureRevocationRef:closureRef});count++;if(count%400===0){await batch.commit();batch=db.batch();}}}
  if(count%400!==0) await batch.commit();
  await regularityStateRef(year).set({procedureClosed:true,procedureClosedAt:FieldValue.serverTimestamp(),closureRef,legalHold:false,emergencySuspended:false,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
  await regularityEvents(year).add({type:'PROCEDURE_CLOSED',closureRef,revokedManagementAccounts:count,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
  await auditAdmin(actor,'ELECTORAL_PROCEDURE_CLOSED',{closureRef,revokedManagementAccounts:count}); return{ok:true,revokedManagementAccounts:count};
};
exports.getSecurityStatus = async (request) => {
  const actor = await requireAuth(request, ['COMMISSIONE', 'DIRIGENTE', 'VICEPRESIDE', 'DSGA', 'SEGRETERIA']);
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
};

exports.destructiveAction = async (request) => {
  const actor = await requireAuth(request, ['COMMISSIONE']);
  await auditAdmin(actor, 'BLOCKED_DESTRUCTIVE_ACTION', { requestedAction: String(request.data?.action || 'unspecified') });
  throw new HttpsError(
    'failed-precondition',
    'Operazione distruttiva disabilitata dal canale web. È richiesta una procedura straordinaria offline, autorizzata e verbalizzata.'
  );
};

exports.saveElectionConfig = async (request) => {
  const actor = await requireAuth(request, ['COMMISSIONE']);
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
  for(const [key,profile] of Object.entries(config.consultazioni||{})) {
    if(!ElectionPolicy.ELECTIONS[key]) throw new HttpsError('invalid-argument','Consultazione non valida.');
    try {ElectionPolicy.validateProfile(profile);} catch(error) {throw new HttpsError('invalid-argument',error.message);}
  }
  await db.runTransaction(async (tx) => {
    const previous = await tx.get(yearlyConfigRef(year));
    const regularity = await tx.get(regularityStateRef(year));
    const old = previous.exists ? previous.data() : {};
    const state = regularity.exists ? regularity.data() : {};
    if((ElectionPolicy.enabled(old).some(k=>ElectionPolicy.windows(old,k).some(w=>Date.now()>=+w.start))||state.votingReview?.stage==='AUTHORIZED')&&old.privacyMode!==config.privacyMode)throw new HttpsError('failed-precondition','Modalità credenziali congelata.');
    if(config.privacyMode&&!['PRESENTIAL_UNLINKED_V1','LEGACY_NAMED'].includes(config.privacyMode))throw new HttpsError('invalid-argument','Modalità credenziali non valida.');
    if(old.privacyMode!==config.privacyMode&&config.privacyMode===LegalReadiness.ANONYMOUS_MODE){
      for(const name of BALLOT_COLLECTIONS){const snap=await tx.get(yearlyCollection(name,year).limit(1));if(!snap.empty)throw new HttpsError('failed-precondition','Urne già popolate: non cambiare il processo di identificazione per questa annualità.');}
    }
    const protectedByKey={
      consiglio:['listeConsiglio','maxPrefConsiglio','consiglioAttivo'],
      istituto:['listeIstituto','maxPrefIstituto','rappresentantiIstitutoAttivo'],
      consulta:['listeConsulta','maxPrefConsulta','consultaAttiva'],
      classeStudente:['maxPrefClasseStudenti','rappresentantiClasseStudentiAttivo'],
      classeGenitore:['maxPrefClasseGenitori','rappresentantiClasseGenitoriAttivo']
    };
    for(const key of Object.keys(ElectionPolicy.ELECTIONS)) {
      const p=ElectionPolicy.profile(old,key), next=ElectionPolicy.profile(config,key), ranges=ElectionPolicy.windows(old,key);
      const started=ranges.length && Date.now()>=+ranges[0].start;
      const frozen=p.dedicated===true ? p.frozen===true||started : state.softwareFrozen===true||started;
      if(frozen) {
        for(const field of [...protectedByKey[key],'divietoVotoDisgiunto']) if(JSON.stringify(old[field])!==JSON.stringify(config[field])) throw new HttpsError('failed-precondition','Schede e liste congelate per '+ElectionPolicy.ELECTIONS[key].label+'.');
      }
      if(started || p.frozen===true) {
        const immutable=profile=>({dedicated:profile.dedicated===true,windows:profile.windows||[],acts:profile.acts||[],kind:profile.kind||'',period:profile.period||''});
        if(JSON.stringify(immutable(p))!==JSON.stringify(immutable(next))) throw new HttpsError('failed-precondition','Calendario e atti della consultazione iniziata o congelata non sono modificabili.');
      }
      if(p.frozen===true&&next.frozen!==true) throw new HttpsError('failed-precondition','Il congelamento della consultazione è definitivo per questa procedura.');
      if(next.finalized===true && !['CLOSED','RELEASED'].includes(ElectionPolicy.phase(config,key))) throw new HttpsError('failed-precondition','Lo scrutinio può essere convalidato solo dopo l’ultima fascia di voto.');
    }
    const legacyStart=parseItalianDate(old.calendario?.votingStartDate,old.calendario?.votingStartTime);
    if(legacyStart && Date.now()>=+legacyStart) {
      if(config.modalitaProva!==old.modalitaProva || config.calendario?.votingStartDate!==old.calendario?.votingStartDate || config.calendario?.votingStartTime!==old.calendario?.votingStartTime) throw new HttpsError('failed-precondition','Non è possibile riavviare una finestra di voto già iniziata.');
      const oldEnd=parseItalianDate(old.calendario?.votingEndDate,old.calendario?.votingEndTime),newEnd=parseItalianDate(config.calendario?.votingEndDate,config.calendario?.votingEndTime);
      if(!newEnd||!oldEnd||newEnd>oldEnd) throw new HttpsError('failed-precondition','La proroga richiede una procedura straordinaria verbalizzata.');
    }
    const starts=ElectionPolicy.enabled(config).flatMap(k=>ElectionPolicy.windows(config,k).map(w=>+w.start));
    tx.set(globalConfigRef(), { annoScolastico: year }, { merge: true });
    tx.set(yearlyConfigRef(year), { ...config, annoScolastico: year, votingStartsAtMs: starts.length?Math.min(...starts):0 }, { merge: false });
  });
  await auditAdmin(actor, 'SAVE_ELECTION_CONFIG', { annoScolastico: year });
  return { ok: true };
};

exports.ensureReferentKeys = async (request) => {
  const actor = await requireAuth(request, ['COMMISSIONE']);
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
};
