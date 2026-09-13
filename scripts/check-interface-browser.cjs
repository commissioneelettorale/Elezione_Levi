'use strict';
// Real Chromium rendering, synthetic Firebase/API responses. Never sends a vote or changes Production.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.LEVI_PLAYWRIGHT||'playwright');
const definition=require('../lib/dpo-dossier');
const root=path.resolve('public');
const stubs={app:'export const initializeApp=()=>({});',auth:'export const inMemoryPersistence={};export const initializeAuth=()=>({currentUser:null});export const signInAnonymously=async()=>({});export const signInWithCustomToken=async()=>({});export const signOut=async()=>{};export const onAuthStateChanged=(a,cb)=>{cb(null);return()=>{}};',firestore:['getFirestore','doc','setDoc','getDoc','updateDoc','deleteDoc','collection','query','getDocs','onSnapshot','writeBatch'].map(n=>'export const '+n+'=()=>({});').join('')};
(async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  try{if(!file.startsWith(root+path.sep))throw Error('invalid');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/json');res.end(fs.readFileSync(file));}catch(_){res.statusCode=404;res.end('Not found');}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.LEVI_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const scenario of ['normal','status-offline','optional-library-missing']){
   const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'text/javascript',body:stubs[/firebase-(\w+)\.js/.exec(r.request().url())[1]]}));
   await page.route('https://elezione-levi.vercel.app/api/call',r=>{const name=r.request().postDataJSON().name;calls.push(name);assert.equal(name,'getPublicServiceStatus','No login credentials or votes sent by this test');return scenario==='status-offline'?r.abort():r.fulfill({contentType:'application/json',body:JSON.stringify({data:{ok:true,serviceState:'PREPARATION_ONLY',secretVotingEnabled:false}})});});
   if(scenario==='optional-library-missing')await page.route('**/lib/privacy-review-ui.js*',r=>r.abort());
   await page.goto(origin,{waitUntil:'load'});await page.locator('#tokenInput').waitFor({state:'visible'});
   await page.locator('#loginBtn').click();assert.match(await page.locator('#loginError').innerText(),/Inserisci/);
   await page.getByRole('button',{name:'Commissione',exact:true}).click();await page.locator('#adminUsername').waitFor({state:'visible'});
   await page.locator('#adminUsername').fill('Commissione Presidente');assert.equal(await page.locator('#adminUsername').evaluate(n=>getComputedStyle(n).color),'rgb(0, 0, 0)');
   const submit=page.getByRole('button',{name:'Sblocca Cruscotto',exact:true});assert.notEqual(await submit.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
   await submit.click();await page.locator('#custom-alert-modal').waitFor({state:'visible'});assert.equal(await page.locator('#custom-alert-title').innerText(),'Dati mancanti');
   await page.locator('[onclick="closeNotification()"]').click();
   await page.getByRole('button',{name:'Torna alla cabina',exact:true}).click();await page.locator('#tokenInput').waitFor({state:'visible'});
   await page.getByRole('button',{name:'Assistente tecnico',exact:true}).click();await page.locator('#technicalUsername').waitFor({state:'visible'});
   await page.getByRole('button',{name:'Referenti Studenti',exact:true}).click();await page.locator('#classMasterToken').waitFor({state:'visible'});
   await page.getByRole('button',{name:'Referenti Genitori',exact:true}).click();assert.match(await page.locator('#classMasterToken').getAttribute('placeholder'),/REF-GEN/);
   await page.getByRole('button',{name:'Dirigenza / Vicepresidenza / DSGA / Segreteria',exact:true}).click();await page.locator('#managementUsername').waitFor({state:'visible'});
   await page.goto(origin+'/?view=commission',{waitUntil:'load'});await page.locator('#adminUsername').waitFor({state:'visible'});
   assert.deepEqual(errors,[],scenario);assert.ok(calls.length>=1);if(scenario==='status-offline')await page.getByText('Stato delle votazioni non disponibile.',{exact:false}).waitFor();
   if(scenario==='normal'){
    const materials={version:definition.VERSION,fields:definition.fields,sections:definition.sections,release:{commit:'a'.repeat(40)},inventory:fs.readFileSync('docs/inventario-release.json','utf8'),development:'{"scope":"SYNTHETIC BROWSER TEST"}',procedure:fs.readFileSync('docs/19_FASCICOLO_DPO_E_RIPRESA.md','utf8')};
    await page.evaluate(async materials=>{
     const review={year:'2026/2027',role:'COMMISSIONE',release:materials.release,configurationSha256:'b'.repeat(64),review:{stage:'PREPARATION'},assessment:{admittedToSecretVoting:false,controls:[]},privacy:{limitation:'PROVA CON DATI FITTIZI'},privacyMode:'LEGACY_NAMED',batches:[]};
     const values={getVotingReview:review,getDpoReviewProfile:{fields:{}},getDpoDossierMaterials:materials,getVotingReviewEvents:{snapshotUntil:'2026-09-13T12:00:00.000Z',events:[],nextCursor:null}};
     window.__testDpoValues=values;window.__testDpoCalls=[];
     window.LeviPrivacyReview.configure({api:new Proxy({},{get:(_,name)=>async()=>{window.__testDpoCalls.push(name);return {data:values[name]};}}),config:()=>({annoScolastico:'2026/2027'}),logs:async()=>({snapshotUntil:'2026-09-13T12:00:00.000Z',logs:[]}),notify:(...args)=>{window.__testDpoNotice=args;}});
     await window.LeviPrivacyReview.show();
    },materials);
    const dialog=page.locator('#privacy-review-dialog');await dialog.getByRole('button',{name:'Scarica PDF dettagliato per il DPO',exact:true}).waitFor({state:'visible'});
    await dialog.getByText('Documentazione tecnica riservata: architettura, sicurezza e funzionamento',{exact:true}).click();await dialog.getByRole('heading',{name:'2. Database: architettura logica e separazione',exact:true}).waitFor({state:'visible'});
    const downloadPromise=page.waitForEvent('download');await dialog.locator('[data-pdf]').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^Fascicolo_DPO_.*\.pdf$/);assert.equal((fs.readFileSync(await download.path())).subarray(0,4).toString(),'%PDF');
    if(process.env.LEVI_BROWSER_OUTPUT){fs.mkdirSync(process.env.LEVI_BROWSER_OUTPUT,{recursive:true});await download.saveAs(path.join(process.env.LEVI_BROWSER_OUTPUT,'fascicolo-browser.pdf'));await page.screenshot({path:path.join(process.env.LEVI_BROWSER_OUTPUT,'fascicolo-commissione.png'),fullPage:true});}
    await page.evaluate(async()=>{window.__testDpoValues.getVotingReview.role='ASSISTENTE_TECNICO';window.__testDpoCalls=[];await window.LeviPrivacyReview.show();});
    assert.equal(await dialog.locator('[data-pdf]').count(),0);assert.equal(await dialog.locator('[data-profile]').count(),0);assert.deepEqual(await page.evaluate(()=>window.__testDpoCalls),['getVotingReview']);await dialog.locator('[data-review]').waitFor({state:'visible'});
    await page.evaluate(()=>window.LeviPrivacyReview.clear());assert.equal(await page.locator('#privacy-review-dialog').count(),0);
    await page.goto(origin,{waitUntil:'load'});await page.setViewportSize({width:390,height:844});await page.locator('#tokenInput').waitFor({state:'visible'});await page.getByRole('button',{name:'Commissione',exact:true}).click();await page.locator('#adminUsername').waitFor({state:'visible'});
    assert.deepEqual(errors,[]);
   }
   await page.close();console.log('PASS browser:',scenario);
  }
  const page=await browser.newPage();await page.goto(origin+'/fascicolo-dpo.html');assert.match(await page.locator('body').innerText(),/Vargiu Scuola/);assert.doesNotMatch(await page.locator('body').innerText(),/credenziali_anonime_anno|AES-256-GCM|artifacts\/iis/);
  for(const privatePath of ['/docs/19_FASCICOLO_DPO_E_RIPRESA.md','/docs/inventario-release.json','/lib/dpo-dossier.js','/functions/core.js'])assert.equal((await page.request.get(origin+privatePath)).status(),404);
  console.log('PASS browser: urn, main navigation, black Commission input, visible login button, optional service failures, Commission dossier/direct PDF, technical role scope, session cleanup, mobile navigation and unpublished private files.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
