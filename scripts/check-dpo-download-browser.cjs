'use strict';
// Full page -> simulated Commission login -> authenticated APIs -> real PDF download.
// Every external request is intercepted. No real credentials, votes or Production writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.LEVI_PLAYWRIGHT||'playwright');
const definition=require('../lib/dpo-dossier'),root=path.resolve('public');
const commit='a'.repeat(40),snapshotUntil='2026-09-13T12:00:00.000Z';
const materials={version:definition.VERSION,fields:definition.fields,sections:definition.sections,release:{commit,environment:'SYNTHETIC TEST'},inventory:fs.readFileSync('docs/inventario-release.json','utf8'),development:'{"scope":"SYNTHETIC LOGIN/DOWNLOAD TEST"}',procedure:fs.readFileSync('docs/19_FASCICOLO_DPO_E_RIPRESA.md','utf8')};
const review={year:'2026/2027',role:'COMMISSIONE',release:materials.release,configurationAvailable:false,configurationSha256:null,review:{stage:'PREPARATION'},assessment:{admittedToSecretVoting:false,controls:[],blockers:[{id:'configurationUnavailable'}]},privacy:{limitation:'PROVA CON DATI FITTIZI'},privacyMode:'LEGACY_NAMED',batches:[]};
const stubs={
 app:'export const initializeApp=()=>({});',
 auth:`const listeners=[];export const inMemoryPersistence={};export const initializeAuth=()=>({currentUser:null});export const signInAnonymously=async()=>{throw Error('Not allowed in this test')};
 export const signInWithCustomToken=async(a,token)=>{if(token!=='SYNTHETIC-CUSTOM-TOKEN')throw Error('Unexpected token');a.currentUser={uid:'SYNTHETIC-COMMISSION',getIdToken:async()=> 'SYNTHETIC-ID-TOKEN'};for(const fn of listeners)fn(a.currentUser);return{user:a.currentUser}};
 export const signOut=async a=>{a.currentUser=null;for(const fn of listeners)fn(null)};export const onAuthStateChanged=(a,cb)=>{listeners.push(cb);cb(a.currentUser);return()=>{}};`,
 firestore:`export const getFirestore=()=>({});export const doc=()=>({});export const collection=()=>({});export const query=()=>({});
 export const getDoc=async()=>({exists:()=>false,metadata:{fromCache:false},data:()=>undefined});export const getDocs=async()=>({docs:[],forEach(){}});
 export const onSnapshot=(q,cb)=>{queueMicrotask(()=>cb({forEach(){}}));return()=>{}};
 export const setDoc=()=>{throw Error('No writes allowed')};export const updateDoc=setDoc,deleteDoc=setDoc,writeBatch=setDoc;`
};
(async()=>{
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  try{if(!file.startsWith(root+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/json');res.end(fs.readFileSync(file));}catch(_){res.statusCode=404;res.end('Not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.LEVI_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
  const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
  const errors=[],calls=[];let denyMaterials=false,offlineFonts=false,holdFonts=false,releaseFont;
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',async route=>{
   const request=route.request(),url=request.url();
   if(url.startsWith(origin)){
    if(url.endsWith('/vendor/pdf-fonts.json')){if(offlineFonts)return route.abort();if(holdFonts)await new Promise(resolve=>{releaseFont=resolve;});}
    return route.continue();
   }
   if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:stubs[/firebase-(\w+)\.js/.exec(url)[1]]});
   assert.equal(url,'https://elezione-levi.vercel.app/api/call','Unexpected external request');
   const {name,data}=request.postDataJSON();calls.push(name);
   let result;
   if(name==='commissionLogin'){
    assert.equal(data.username,'synthetic-commission');assert.equal(data.password,'TEST-ONLY-NOT-A-REAL-PASSWORD');
    result={customToken:'SYNTHETIC-CUSTOM-TOKEN',profile:{role:'COMMISSIONE',mustChangePassword:false}};
   }else{
    assert.equal(request.headers().authorization,'Bearer SYNTHETIC-ID-TOKEN','The actual API adapter must attach the active login');
    if(name==='getDpoDossierMaterials'&&denyMaterials)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'permission-denied',message:'Ruolo non autorizzato.'}})});
    const values={getVotingReview:review,getDpoDossierMaterials:materials,getDpoReviewProfile:{fields:{}},getTechnicalLogs:{ok:true,year:review.year,snapshotUntil,logs:[],nextCursor:null},getVotingReviewEvents:{snapshotUntil,events:[],nextCursor:null}};
    assert.ok(Object.hasOwn(values,name),'Unexpected API operation '+name);result=values[name];
   }
   await route.fulfill({contentType:'application/json',body:JSON.stringify({data:result})});
  });
  async function login(page){await page.locator('#adminUsername').fill('synthetic-commission');await page.locator('#adminPwd').fill('TEST-ONLY-NOT-A-REAL-PASSWORD');await page.getByRole('button',{name:'Sblocca Cruscotto',exact:true}).click();}
  async function pdfDownload(page,action){const event=page.waitForEvent('download',{timeout:15000});await action();const file=await event;assert.equal(file.suggestedFilename(),'Fascicolo_DPO_2026_2027.pdf');assert.equal(await file.failure(),null);assert.equal(fs.readFileSync(await file.path()).subarray(0,4).toString(),'%PDF');return file;}
  const page=await context.newPage();await page.goto(origin+'/?view=commission',{waitUntil:'load'});await login(page);
  await page.getByRole('button',{name:'Scarica PDF DPO',exact:true}).waitFor({state:'visible'});
  const initialUrl=page.url(),loginCount=()=>calls.filter(n=>n==='commissionLogin').length;
  const file=await pdfDownload(page,()=>page.getByRole('button',{name:'Scarica PDF DPO',exact:true}).click());
  const dialog=page.locator('#privacy-review-dialog');await dialog.getByText('PDF DPO pronto.',{exact:false}).waitFor({state:'visible'});
  assert.match(await dialog.innerText(),/non ancora salvata: il PDF preliminare è disponibile/);
  assert.equal(page.url(),initialUrl);assert.equal(await page.locator('#adminUsername').count(),0);assert.equal(loginCount(),1);
  const count=calls.length;await pdfDownload(page,()=>dialog.locator('[data-download-link]').click());assert.equal(calls.length,count,'Manual download link reuses the prepared file');
  if(process.env.LEVI_BROWSER_OUTPUT){fs.mkdirSync(process.env.LEVI_BROWSER_OUTPUT,{recursive:true});await file.saveAs(path.join(process.env.LEVI_BROWSER_OUTPUT,'dpo-download-preliminary.pdf'));await page.screenshot({path:path.join(process.env.LEVI_BROWSER_OUTPUT,'dpo-download-desktop.png')});}
  await dialog.locator('[data-close]').click();await page.setViewportSize({width:390,height:844});
  await pdfDownload(page,()=>page.getByRole('button',{name:'Scarica PDF DPO',exact:true}).click());assert.equal(loginCount(),1);
  if(process.env.LEVI_BROWSER_OUTPUT)await page.screenshot({path:path.join(process.env.LEVI_BROWSER_OUTPUT,'dpo-download-mobile.png')});
  await dialog.locator('[data-close]').click();
  const popupEvent=page.waitForEvent('popup');await page.getByRole('link',{name:'DPO e privacy',exact:true}).click();const popup=await popupEvent;
  await popup.waitForLoadState();assert.equal(page.url(),initialUrl);assert.equal(await page.getByRole('button',{name:'Scarica PDF DPO',exact:true}).count(),1);
  await popup.getByRole('link',{name:'Accedi e scarica il PDF DPO',exact:true}).click();
  await popup.getByText('Accedi con il tuo account Commissione:',{exact:false}).waitFor();
  const afterLogin=popup.waitForEvent('download',{timeout:15000});await login(popup);const resumed=await afterLogin;
  assert.equal(resumed.suggestedFilename(),'Fascicolo_DPO_2026_2027.pdf');assert.equal(await resumed.failure(),null);assert.equal(await popup.locator('#adminUsername').count(),0);assert.equal(new URL(popup.url()).searchParams.has('document'),false);await popup.close();
  // Failure messages must be visible inside the dialog, with no redirect or fake success.
  let downloads=0;page.on('download',()=>downloads++);denyMaterials=true;
  await page.getByRole('button',{name:'Scarica PDF DPO',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Ruolo non autorizzato.'}).waitFor();assert.equal(downloads,0);assert.equal(page.url(),initialUrl);denyMaterials=false;
  await dialog.locator('[data-close]').click();offlineFonts=true;
  await page.getByRole('button',{name:'Scarica PDF DPO',exact:true}).click();await dialog.locator('[data-export-status]').filter({hasText:'Fascicolo non esportato'}).waitFor();assert.equal(downloads,0);offlineFonts=false;
  await pdfDownload(page,()=>dialog.locator('[data-pdf]').click());assert.equal(downloads,1);
  // Logout during generation cancels the private download and removes prepared data.
  holdFonts=true;await dialog.locator('[data-pdf]').click();
  await page.waitForFunction(()=>document.querySelector('[data-pdf]')?.disabled===true);
  const deadline=Date.now()+5000;while(!releaseFont&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(releaseFont);
  await page.evaluate(()=>window.logoutAdmin());await page.locator('#tokenInput').waitFor();releaseFont();holdFonts=false;
  await page.waitForFunction(()=>!document.getElementById('privacy-review-dialog'));await page.waitForLoadState('networkidle');assert.equal(downloads,1,'No private file after logout');
  assert.deepEqual(errors,[]);
  console.log('PASS: actual Commission login and bearer adapter, direct PDF download on desktop/mobile, retry link, public privacy page preserves original session, pending download resumes after login, visible export errors, authorization denial, cancellation on logout. All authentication/data are synthetic.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
