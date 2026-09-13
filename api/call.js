'use strict';

const { getAuth } = require('firebase-admin/auth');
const crypto = require('node:crypto');

const ALLOWED_FUNCTIONS = new Set([
  "getPublicServiceStatus",
  "getVoterSessionStatus",
  "getVotingReview",
  "getVotingReviewEvents",
  "getAnonymousParticipation",
  "advanceVotingReview",
  "createAnonymousCredentials",
  "getDpoReviewProfile",
  "saveDpoReviewProfile",
  "validateVoterToken",
  "castVote",
  "commissionLogin",
  "technicalLogin",
  "getTechnicalStatus",
  "resolveTechnicalIssue",
  "recordTechnicalCheckpoint",
  "recordTechnicalTestReport",
  "getTechnicalLogs",
  "changeCommissionPassword",
  "managementLogin",
  "referentLogin",
  "getAnonymousBallots",
  "createStaffAccount",
  "getStaffAccounts",
  "setStaffAccountActive",
  "getRegularityState",
  "setRegularityControl",
  "recordResultsPublication",
  "fileElectoralAppeal",
  "resolveElectoralAppeal",
  "recordElectoralIncident",
  "setEmergencySuspension",
  "closeElectoralProcedure",
  "getSecurityStatus",
  "destructiveAction",
  "saveElectionConfig",
  "ensureReferentKeys"
]);

// Difesa leggera contro tentativi ripetuti sulle credenziali staff. La mappa è
// volutamente in memoria: non sostituisce il rate limiting/WAF di Vercel, ma
// riduce i burst sulla singola istanza senza condividere indirizzi o credenziali.
const STAFF_LOGIN_FUNCTIONS = new Set(['commissionLogin', 'technicalLogin', 'managementLogin']);
const loginAttempts = new Map();
const rateLimitSecret = crypto.randomBytes(32);
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 12;

function clientAddress(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown').slice(0, 120);
}

function rateLimitStaffLogin(req, functionName) {
  if (!STAFF_LOGIN_FUNCTIONS.has(functionName)) return null;
  const now = Date.now();
  // Secret rotates with the instance; never persist the address or this identifier.
  const key = crypto.createHmac('sha256', rateLimitSecret).update(`${functionName}:${clientAddress(req)}`).digest('hex');
  const previous = loginAttempts.get(key);
  const entry = previous && now - previous.startedAt < LOGIN_WINDOW_MS
    ? previous
    : { startedAt: now, count: 0 };
  entry.count += 1;
  loginAttempts.set(key, entry);
  // Opportunistic cleanup prevents an unbounded map on warm instances.
  if (loginAttempts.size > 2000) {
    for (const [storedKey, stored] of loginAttempts) {
      if (now - stored.startedAt >= LOGIN_WINDOW_MS) loginAttempts.delete(storedKey);
    }
    if (loginAttempts.size > 10000) loginAttempts.delete(loginAttempts.keys().next().value);
  }
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    return Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - entry.startedAt)) / 1000));
  }
  return null;
}

let handlers;

function loadHandlers() {
  if (!handlers) handlers = require('../functions/core');
  return handlers;
}

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  return res.json(payload);
}

function normalizeFirebaseCode(error) {
  const raw = String(error?.code || error?.status || 'internal');
  return raw
    .replace(/^functions\//i, '')
    .toLowerCase()
    .replace(/_/g, '-');
}

function statusForCode(code) {
  const statuses = {
    'invalid-argument': 400,
    'unauthenticated': 401,
    'permission-denied': 403,
    'not-found': 404,
    'already-exists': 409,
    'failed-precondition': 412,
    'aborted': 409,
    'resource-exhausted': 429,
    'deadline-exceeded': 504,
    'unavailable': 503
  };
  return statuses[code] || 500;
}

async function resolveAuth(req) {
  const authorization = req.headers?.authorization;
  if (!authorization) return null;

  if (typeof authorization !== 'string' || !/^Bearer\s+/i.test(authorization)) {
    const error = new Error('Sessione non valida.');
    error.code = 'unauthenticated';
    throw error;
  }

  const idToken = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    const error = new Error('Sessione non valida.');
    error.code = 'unauthenticated';
    throw error;
  }

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, token: decoded };
  } catch (_) {
    const error = new Error('Sessione non valida o scaduta.');
    error.code = 'unauthenticated';
    throw error;
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return null; }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const origin = String(req.headers?.origin || '');
  const allowedOrigins = new Set([
    'https://commissioneelettorale.github.io',
    'https://elezione-levi.vercel.app'
  ]);
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, {
      error: { code: 'method-not-allowed', message: 'Metodo non consentito.' }
    });
  }

  const body = parseBody(req);
  const functionName = typeof body?.name === 'string' ? body.name : '';
  if (!ALLOWED_FUNCTIONS.has(functionName)) {
    return sendJson(res, 400, {
      error: { code: 'invalid-argument', message: 'Funzione non autorizzata.' }
    });
  }

  const retryAfter = rateLimitStaffLogin(req, functionName);
  if (retryAfter) {
    res.setHeader('Retry-After', String(retryAfter));
    return sendJson(res, 429, {
      error: { code: 'resource-exhausted', message: 'Troppi tentativi di accesso. Riprovare tra alcuni minuti.' }
    });
  }

  try {
    const availableHandlers = loadHandlers();
    if (typeof availableHandlers[functionName] !== 'function') {
      return sendJson(res, 404, {
        error: { code: 'not-found', message: 'Operazione non disponibile.' }
      });
    }

    const auth = await resolveAuth(req);
    const result = await availableHandlers[functionName]({
      data: body?.data && typeof body.data === 'object' ? body.data : {},
      auth,
      rawRequest: req
    });

    return sendJson(res, 200, { data: result });
  } catch (error) {
    const code = normalizeFirebaseCode(error);
    // Error messages from SDKs can contain document paths or request values.
    // Keep only allowlisted operation and status; no body, token, vote or credential.
    console.error('[api/call]', functionName, code);

    const clientVisibleCodes = new Set([
      'invalid-argument',
      'unauthenticated',
      'permission-denied',
      'not-found',
      'already-exists',
      'failed-precondition',
      'aborted',
      'resource-exhausted',
      'deadline-exceeded',
      'unavailable'
    ]);
    const message = clientVisibleCodes.has(code)
      ? String(error?.message || 'Operazione non completata.')
      : 'Backend Vercel temporaneamente non disponibile.';

    return sendJson(res, statusForCode(code), {
      error: { code, message }
    });
  }
};
