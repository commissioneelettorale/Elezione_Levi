'use strict';
// Only browser assets are published; operational documents are served by authenticated APIs.
const fs=require('node:fs'),path=require('node:path');
const assets=['index.html','404.html','anonimato.html','note-legali.html','fascicolo-dpo.html','levi.png',
 'lib/election-sandbox-ui.js','lib/election-sandbox.js','lib/election-policy.js','lib/legal-readiness.js','lib/privacy-review-ui.js','lib/privacy-notice.js',
 ...fs.readdirSync('vendor').filter(p=>fs.statSync(path.join('vendor',p)).isFile()).map(p=>'vendor/'+p)];
fs.rmSync('public',{recursive:true,force:true});
for(const asset of assets){const dest=path.join('public',asset);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(asset,dest);}
console.log('Public site built: '+assets.length+' browser assets; no operational documents or backend source.');
