'use strict';
// Reproducible inventory of explicit application assets; never reads environment secrets.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=['index.html','404.html','anonimato.html','note-legali.html','fascicolo-dpo.html','docs/verifiche-sviluppo.json','docs/19_FASCICOLO_DPO_E_RIPRESA.md','api/call.js','functions/core.js','firestore.rules','vercel.json','_config.yml','scripts/build-public-site.cjs','package.json','package-lock.json'];
for(const dir of ['lib','vendor'])for(const file of fs.readdirSync(dir))if(fs.statSync(path.join(dir,file)).isFile())files.push(path.join(dir,file));
const lock=JSON.parse(fs.readFileSync('package-lock.json'));
const components=Object.entries(lock.packages||{}).filter(([p,v])=>p&&v.version&&!v.dev).map(([p,v])=>({path:p,version:v.version,license:v.license||'VERIFICARE',resolved:v.resolved||null,integrity:v.integrity||null}));
const inventory={format:'LEVI_RELEASE_INVENTORY_V1',scope:'Application assets and production npm lockfile; excludes provider infrastructure, secrets and database contents',annexSha256:require('../lib/legal-readiness').SOURCE_SHA256,
 assets:files.sort().map(p=>({path:p,bytes:fs.statSync(p).size,sha256:digest(p)})),
 remoteSdk:{provider:'Firebase browser SDK',version:'11.6.1',origin:'https://www.gstatic.com/firebasejs/11.6.1/',modules:['firebase-app.js','firebase-auth.js','firebase-firestore.js'],purpose:'Application initialization, authentication, database'},
 components};
fs.writeFileSync('docs/inventario-release.json',JSON.stringify(inventory,null,2)+'\n');
console.log('Inventory: '+inventory.assets.length+' assets, '+components.length+' npm dependencies; no secret or live data.');
