'use strict';
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { migrate } = require('../../lib/voter-token-migration');
const plan = require('../../ops/voter-token-format-2026-2027.json');
async function main() {
  if (plan.project !== 'votazioni-levi' || plan.year !== '2026/2027' || plan.format !== 'LEVI_VOTER_CODE_6_V1') throw Error('INVALID_PLAN');
  initializeApp({ credential: applicationDefault(), projectId: plan.project });
  const options = { db: getFirestore(), year: plan.year, migrationId: plan.id, timestamp: () => FieldValue.serverTimestamp() };
  const preview = await migrate(options);
  console.log('TOKEN_FORMAT_PREFLIGHT ' + JSON.stringify(preview));
  if (!process.argv.includes('--apply')) return;
  const result = await migrate({ ...options, apply: true, onProgress: progress => console.log('TOKEN_FORMAT_PROGRESS ' + JSON.stringify(progress)) });
  console.log('TOKEN_FORMAT_RESULT ' + JSON.stringify(result));
}
main().catch(error => {
  // Never emit SDK error messages, document paths, credentials or voter fields.
  const known = /^[A-Z_]{3,80}$/.test(String(error.code || '')) ? error.code : 'MIGRATION_FAILED';
  console.error('TOKEN_FORMAT_ERROR ' + known);
  process.exitCode = 1;
});
