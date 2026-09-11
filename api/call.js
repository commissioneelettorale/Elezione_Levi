'use strict';

const ALLOWED_FUNCTIONS = new Set([
  'validateVoterToken',
  'castVote',
  'commissionLogin',
  'changeCommissionPassword',
  'managementLogin',
  'referentLogin',
  'getAnonymousBallots',
  'createStaffAccount',
  'getStaffAccounts',
  'setStaffAccountActive',
  'saveElectionConfig',
  'ensureReferentKeys',
  'getSecurityStatus',
  'getRegularityState',
  'setRegularityControl',
  'recordResultsPublication',
  'fileElectoralAppeal',
  'resolveElectoralAppeal',
  'recordElectoralIncident',
  'setEmergencySuspension',
  'closeElectoralProcedure',
  'destructiveAction'
]);

const DEFAULT_FUNCTIONS_BASE_URL = 'https://europe-west1-votazioni-levi.cloudfunctions.net';

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  return res.json(payload);
}

function normalizeFirebaseCode(error) {
  const raw = String(error?.code || error?.status || 'internal');
  return raw.toLowerCase().replace(/_/g, '-');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, {
      error: { code: 'method-not-allowed', message: 'Metodo non consentito.' }
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }
  const functionName = typeof body?.name === 'string' ? body.name : '';
  if (!ALLOWED_FUNCTIONS.has(functionName)) {
    return sendJson(res, 400, {
      error: { code: 'invalid-argument', message: 'Funzione non autorizzata.' }
    });
  }

  const baseUrl = String(process.env.FIREBASE_FUNCTIONS_BASE_URL || DEFAULT_FUNCTIONS_BASE_URL).replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    headers.Authorization = authorization;
  }
  const appCheck = req.headers['x-firebase-appcheck'];
  if (typeof appCheck === 'string' && appCheck) {
    headers['X-Firebase-AppCheck'] = appCheck;
  }

  try {
    const upstream = await fetch(baseUrl + '/' + encodeURIComponent(functionName), {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify({ data: body?.data ?? {} })
    });
    const text = await upstream.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = {}; }

    if (payload?.error) {
      payload.error.code = payload.error.code || normalizeFirebaseCode(payload.error);
      return sendJson(res, upstream.status, payload);
    }
    if (!upstream.ok) {
      return sendJson(res, 502, {
        error: { code: 'unavailable', message: 'Backend Firebase non raggiungibile.' }
      });
    }
    return sendJson(res, 200, payload);
  } catch (error) {
    console.error('Vercel proxy Firebase:', error?.message || error);
    return sendJson(res, 502, {
      error: { code: 'unavailable', message: 'Backend Firebase temporaneamente non disponibile.' }
    });
  }
};
