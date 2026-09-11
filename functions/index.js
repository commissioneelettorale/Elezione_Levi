'use strict';

const { onCall } = require('firebase-functions/v2/https');
const handlers = require('./core');

const REGION = 'europe-west1';
const WITHOUT_APPCHECK = new Set(['validateVoterToken', 'castVote']);

for (const [name, handler] of Object.entries(handlers)) {
  exports[name] = onCall(
    WITHOUT_APPCHECK.has(name)
      ? { region: REGION, enforceAppCheck: false }
      : { region: REGION },
    handler
  );
}
