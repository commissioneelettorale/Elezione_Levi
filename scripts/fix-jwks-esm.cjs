'use strict';

// Vercel's CommonJS loader cannot require jose's ESM entry point.
// Preserve dependency versions and use dynamic imports in asynchronous paths.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const adminRequire = createRequire(require.resolve('firebase-admin/auth'));
const jwksDir = path.dirname(adminRequire.resolve('jwks-rsa'));
const oldImport = "const jose = require('jose');";
const patches = [
  {
    file: 'utils.js',
    before: 'async function retrieveSigningKeys(jwks) {',
    after: "async function retrieveSigningKeys(jwks) {\n  const jose = await import('jose');"
  },
  {
    file: 'integrations/passport.js',
    before: 'return function secretProvider(req, rawJwtToken, cb) {\n    let decoded;\n    try {',
    after: "return async function secretProvider(req, rawJwtToken, cb) {\n    let decoded;\n    try {\n      const jose = await import('jose');"
  }
];
const changes = patches.map(({ file, before, after }) => {
  const filename = path.join(jwksDir, file);
  const source = fs.readFileSync(filename, 'utf8');
  if (source.includes(after) && !source.includes(oldImport)) return null;
  if (source.split(oldImport).length !== 2 || source.split(before).length !== 2) {
    throw new Error('Unexpected jwks-rsa source in ' + file + ': review ESM compatibility before deploying.');
  }
  return { filename, content: source.replace(oldImport, '').replace(before, after) };
});
for (const change of changes) {
  if (change) fs.writeFileSync(change.filename, change.content);
}
console.log('jwks-rsa ESM compatibility verified.');
