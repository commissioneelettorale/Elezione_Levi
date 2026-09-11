'use strict';

const { getAuth } = require('firebase-admin/auth');

const ALLOWED_FUNCTIONS = new Set([
  "validateVoterToken",
  "castVote",
  "commissionLogin",
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
    console.error('[api/call]', functionName, code, error?.message || error);

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
