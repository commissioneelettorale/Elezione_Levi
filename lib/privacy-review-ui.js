(function(root){
 'use strict';
 let app,preparedDownload,pendingBatch,issuingBatch=false;
 // Credentials exist only in this page: never lose the receipt to a follow-up read.
 root.addEventListener?.('beforeunload',event=>{if(pendingBatch||issuingBatch){event.preventDefault();event.returnValue='';}});
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status={PREPARATION:'Preparazione',SUSPENDED:'Blocco attivo',PROPOSED:'Intervento proposto',VERIFIED:'Verificato da persona diversa',AUTHORIZED:'Autorizzazione registrata',REJECTED:'Non superato'};
 const stageText=v=>status[v]||v||'Preparazione';
 function reviewNextActions(stage,canEdit){
  if(stage==='PROPOSED')return [{value:'VERIFY',label:'2. Registra verifica indipendente'}];
  if(stage==='VERIFIED')return canEdit?[{value:'AUTHORIZE',label:'3. Decisione della Commissione'}]:[];
  if(stage==='AUTHORIZED')return [];
  return [{value:'PROPOSE',label:'1. Proponi risoluzione documentata'}];
 }

 const json=v=>JSON.stringify(v,null,2);
 function discardDownload(){if(preparedDownload){URL.revokeObjectURL(preparedDownload.href);preparedDownload.remove();preparedDownload=null;}}
 function download(content,name,type){
  discardDownload();
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;
  a.textContent='Scarica di nuovo '+name;a.className='block mt-3 underline font-bold';a.dataset.downloadLink='true';
  const slot=document.querySelector('#privacy-review-dialog [data-download]');
  if(slot){slot.appendChild(a);preparedDownload=a;}else{a.style.display='none';document.body.appendChild(a);}
  a.click();
  if(!slot){a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
 }
 function exportNotice(owner,title,message,type){
  const host=document.getElementById('privacy-review-dialog'),status=host?.querySelector('[data-export-status]');
  if(host?.open&&status){status.textContent=title+'. '+message;status.className='mt-3 text-sm '+(type==='error'?'text-red-800':'text-slate-900');}
  else owner.notify(title,message,type);
 }
 async function call(name,data={}){return (await app.api[name]({annoScolastico:app.config().annoScolastico,...data})).data;}
 async function sha(data){const bytes=typeof data==='string'?new TextEncoder().encode(data):data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');}
 async function resource(path,kind='text'){const r=await fetch(new URL(path,document.baseURI),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('File del fascicolo non disponibile: '+path);return kind==='json'?r.json():r.text();}
 function reviewSections(data){
  const {version:VERSION,fields,sections}=data.materials;
  const review=data.review||{},profile=data.profile||{},logs=data.technical?.logs||[];
  return [{title:'Identificazione della copia riservata',paragraphs:[`Fascicolo ${VERSION}; anno ${review.year||'non indicato'}; generato ${data.generatedAt||'non indicato'}.`,`Release: ${review.release?.commit||'NON ATTESTATA'}; ambiente ${review.release?.environment||'NON ATTESTATO'}.`,`SHA-256 configurazione: ${review.configurationSha256||'NON ATTESTATA'}.`,...(review.configurationAvailable===false?['Configurazione elettorale annuale NON ANCORA SALVATA. Questo fascicolo preliminare descrive il software e i documenti disponibili; non attesta il completamento dei controlli e non autorizza il voto.']:[]),`Stato procedura: ${review.review?.stage||'PREPARATION'}; ammissione registrata: ${review.assessment?.admittedToSecretVoting===true?'SÌ':'NO'}.`,`DPO: Vargiu Scuola S.r.l. - dpo@vargiuscuola.it. Copia riservata: custodire nel fascicolo della scuola.`]},...sections,
   {title:'15. Dati organizzativi dichiarati dalla scuola',paragraphs:Object.entries(fields).map(([key,label])=>label+': '+(profile.fields?.[key]||'NON DOCUMENTATO - da acquisire prima della valutazione.'))},
   {title:'16. Matrice delle attestazioni applicative',rows:[['Requisito','Stato','Evidenza dichiarata'],...(review.assessment?.controls||[]).map(c=>[c.id,c.status,c.note||'NON DOCUMENTATA'])]},
   {title:'17. Rapporti e checkpoint disponibili',paragraphs:[`Registrazioni incluse: ${logs.length}. Fotografia log fino a: ${data.technical?.snapshotUntil||'non attestata'}. I log dei fornitori sono separati. Nessun controllo mancante è trasformato in PASS.`]},
   ...logs.filter(l=>l.report).map(l=>({title:'Collaudo '+l.id,paragraphs:[`Operatore: ${l.technicianName}; registrato ${l.at}; versione ${l.release?.commit||l.report.softwareVersion||'NON ATTESTATA'}.`,`Configurazione: ${l.configurationSha256||'NON ATTESTATA'}; esito ${l.result}.`],rows:[['Prova','Metodo / atteso','Osservato / esito / evidenza'],...l.report.tests.map(t=>[t.id,`${t.method||'Non documentato'} / ${t.expected||'Non documentato'}`,`${t.observed||'Non documentato'}; ${t.outcome}; ${t.testedAt||'data non documentata'}; ${t.evidence||''}`])]}))];
 }

 async function makePdf(data){
  const fonts=await resource('vendor/pdf-fonts.json','json'),doc=new root.jspdf.jsPDF({unit:'mm',format:'a4'});
  for(const style of ['normal','bold']){doc.addFileToVFS('Dpo-'+style+'.ttf',fonts[style]);doc.addFont('Dpo-'+style+'.ttf','Dpo',style);}
  let y=20;
  function text(value,size=9,bold=false){doc.setFont('Dpo',bold?'bold':'normal');doc.setFontSize(size);for(const line of doc.splitTextToSize(String(value),178)){if(y>276){doc.addPage();y=20;}doc.text(line,16,y);y+=size*.45+1;}y+=3;}
  text('Fascicolo DPO / Privacy Review',19,true);
  for(const section of reviewSections(data)){
   if(y>246){doc.addPage();y=20;}
   text(section.title,12,true);
   for(const p of section.paragraphs||[])text(p);
   if(section.rows?.length){doc.autoTable({startY:y,margin:{left:16,right:16,top:18,bottom:20},head:[section.rows[0]],body:section.rows.slice(1).map(row=>row.map((cell,i)=>i===0?String(cell).replace(/_anno/g,'\n_anno'):cell)),columnStyles:section.rows[0].length===3?{0:{cellWidth:42},1:{cellWidth:53},2:{cellWidth:83}}:{0:{cellWidth:45},1:{cellWidth:133}},styles:{textColor:[0,0,0],font:'Dpo',fontSize:8,cellPadding:2,overflow:'linebreak'},headStyles:{fillColor:[30,50,65],textColor:[255,255,255],fontStyle:'bold'},rowPageBreak:'avoid'});y=doc.lastAutoTable.finalY+7;}
  }
  const count=doc.getNumberOfPages();for(let page=1;page<=count;page++){doc.setPage(page);doc.setFont('Dpo','normal');doc.setFontSize(7);doc.text('Copia riservata - da valutare e sottoscrivere | '+page+'/'+count,16,288);}
  return doc.output('arraybuffer');
 }
 async function exportDossier(button,format='zip'){
  const owner=app;if(!owner||button.disabled)return;
  const prior=button.textContent;button.disabled=true;button.textContent='Preparazione fascicolo completo…';
  exportNotice(owner,'Preparazione in corso','Attendi il caricamento dei documenti e dei registri disponibili.','info');
  try{
   const [review,profile,technical,materials,notice,privacy]=await Promise.all([
    call('getVotingReview'),call('getDpoReviewProfile'),app.logs(),call('getDpoDossierMaterials'),resource('note-legali.html'),resource('anonimato.html')]);
   const {inventory,development,procedure}=materials;
   if(!review.release?.commit||materials.release?.commit!==review.release.commit)throw new Error('Versione del fascicolo non coerente con il servizio. Ricaricare e riprovare.');
   if(!Array.isArray(technical.logs))throw new Error('Log incompleti.');
   const events=[],seen=new Set();let cursor=null;
   do{const page=await call('getVotingReviewEvents',{cursor,snapshotUntil:technical.snapshotUntil});
     if(!Array.isArray(page.events)||page.snapshotUntil!==technical.snapshotUntil)throw new Error('Intervallo degli eventi non coerente.');
     for(const event of page.events){if(seen.has(event.id))throw new Error('Evento duplicato nell’esportazione.');seen.add(event.id);events.push(event);}
     if(page.nextCursor===cursor&&cursor)throw new Error('Paginazione eventi interrotta.');cursor=page.nextCursor;
   }while(cursor);
   const current=await call('getVotingReview'),latestProfile=await call('getDpoReviewProfile');
   const stable=v=>json({...v,assessment:{...v.assessment,assessedAt:null}});
   if(stable(current)!==stable(review)||json(latestProfile)!==json(profile))throw new Error('La revisione è cambiata durante l’esportazione. Ripetere per acquisire una copia coerente.');
   const data={format:materials.version,generatedAt:new Date().toISOString(),review,profile,technical,events,materials};
   const pdf=await makePdf(data);
   if(app!==owner)return;
   if(format==='pdf'){download(pdf,'Fascicolo_DPO_'+review.year.replace('/','_')+'.pdf','application/pdf');exportNotice(owner,'PDF DPO pronto','Download avviato. Se non compare nei download del browser, usa il collegamento qui sotto. Custodire la copia riservata.','success');return;}
   const files={'Fascicolo_DPO.pdf':pdf,'fotografia-riservata.json':json(data),'matrice-conformita.json':json(review.assessment),'log-tecnici.json':json(technical),'eventi-blocchi.json':json({snapshotUntil:technical.snapshotUntil,events}),'inventario-release.json':inventory,'verifiche-sviluppo.json':development,'informativa-visualizzata.html':notice,'protezione-voto.html':privacy,'procedura-operativa.md':procedure};
   const manifest={format:'LEVI_DPO_MANIFEST_V1',generatedAt:data.generatedAt,commit:review.release?.commit||null,configurationSha256:review.configurationSha256,files:[]},zip=new root.JSZip();
   for(const [name,value]of Object.entries(files)){manifest.files.push({name,sha256:await sha(value)});zip.file(name,value);}
   zip.file('MANIFEST_SHA256.json',json(manifest));
   const archive=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
   if(app!==owner)return;
   download(archive,'Fascicolo_DPO_'+review.year.replace('/','_')+'.zip','application/zip');
   exportNotice(owner,'Fascicolo DPO pronto','Download dello ZIP avviato. Se necessario, usa il collegamento qui sotto. Custodire la copia riservata.','success');
  }catch(e){if(app===owner)exportNotice(owner,'Fascicolo non esportato',e.message,'error');}finally{button.disabled=false;button.textContent=prior;}
 }
 function dropBatch(){
  if(!pendingBatch)return;
  if(pendingBatch.url)URL.revokeObjectURL(pendingBatch.url);
  if(Array.isArray(pendingBatch.codes))pendingBatch.codes.fill('');
  pendingBatch=null;
 }
 function showBatchDownload(host){
  if(!pendingBatch)return;
  host.querySelector('[data-credential-receipt]')?.remove();
  const form=host.querySelector('[data-batch]');
  const b=pendingBatch,panel=document.createElement('div');
  panel.dataset.credentialReceipt='true';panel.className='p-4 mt-3 rounded-xl border-2 border-amber-400 bg-amber-50';
  const text=document.createElement('p');
  text.textContent=b.codes.length+' credenziale/i già emessa/e: NON richiedere un nuovo lotto per riprovare il download.';
  text.className='text-sm font-bold';panel.appendChild(text);
  try{
   if(!b.url){
    const PDF=root.jspdf?.jsPDF;if(typeof PDF!=='function')throw Error('Libreria PDF assente');
    const doc=new PDF();
    b.codes.forEach((code,i)=>{
     if(!/^(?:(?:STU|GEN|DOC|ATA)-[A-Z0-9]{6}|[A-F0-9]{32})$/.test(code))throw Error('Formato cedolino inatteso');
     if(i&&i%7===0)doc.addPage();
     const y=20+(i%7)*37;doc.setFontSize(10);
     doc.text('Primo Levi - '+b.tipo+' '+(b.classe||''),15,y);
     if(b.electionKey){doc.setFontSize(8);doc.text(b.electionKey==='consiglio'?'SOLO CONSIGLIO D’ISTITUTO':'SOLO RAPPRESENTANTI DI CLASSE',15,y+4);doc.setFontSize(10);}
     doc.text(code.includes('-')?code:code.match(/.{1,4}/g).join('-'),15,y+8);
     doc.setFontSize(8);doc.text('Codice non nominativo. Custodire il cedolino.',15,y+16);
     doc.line(15,y+26,195,y+26);
    });
    const blob=doc.output('blob');if(!blob?.size)throw Error('PDF vuoto');
    b.url=URL.createObjectURL(blob);
   }
   const link=document.createElement('a');
   link.href=b.url;link.download='Cedolini_non_nominativi_'+b.tipo+'_'+(b.electionKey||'consultazioni')+'_'+(b.classe||'gruppo')+'.pdf';
   link.dataset.credentialRetry='true';link.className='block mt-3 p-3 bg-blue-900 text-white rounded-lg font-bold';
   link.textContent='SCARICA PDF DEL LOTTO GIÀ EMESSO (anche 1 codice)';panel.appendChild(link);
   const hint=document.createElement('p');hint.className='text-xs mt-2';
   hint.textContent='Se il download non si avvia, premi nuovamente il collegamento. Verifica il file prima di confermare; non generare altri codici.';panel.appendChild(hint);
   // Avviare il download solo dopo che il link è entrato nel DOM.
  }catch(e){
   const msg=document.createElement('p');msg.className='text-xs text-red-800 mt-2';
   msg.textContent='PDF non preparato: '+e.message+'. Questo lotto rimane in memoria; non emetterne altri.';panel.appendChild(msg);
   const retry=document.createElement('button');retry.type='button';retry.className='border rounded-lg p-2 mt-2';
   retry.textContent='Riprova il PDF di questo lotto';retry.onclick=()=>showBatchDownload(host);panel.appendChild(retry);
  }
  const end=document.createElement('button');end.type='button';end.dataset.confirmReceipt='true';
  end.className='block border rounded-lg p-3 mt-3 font-bold';end.textContent='Confermo PDF salvato e cedolini custoditi';
  end.disabled=!b.url;
  end.onclick=()=>{if(!root.confirm('Confermi che il PDF è stato scaricato e verificato? I codici non saranno più recuperabili da questa finestra.'))return;dropBatch();show();};
  panel.appendChild(end);
  if(form){form.after(panel);form.closest('details').open=true;}else host.appendChild(panel);
  if(b.url&&!b.autoAttempted){b.autoAttempted=true;panel.querySelector('[data-credential-retry]')?.click();}
  const submit=form?.querySelector('button:not([type]),button[type="submit"]');if(submit)submit.disabled=true;
  host.querySelectorAll('[data-review] button,[data-profile] button,[data-mode],[data-resume]').forEach(button=>{button.disabled=true;});
 }
 function canClose(host){
  if(issuingBatch){const status=host.querySelector('[data-status]');if(status)status.textContent='Emissione in corso: attendi la risposta prima di chiudere.';return false;}
  return !pendingBatch||root.confirm('Il lotto è già emesso: senza PDF non sarà recuperabile. Vuoi uscire comunque?');
 }
 function savedReferences(view,profile){
  const controls=Array.isArray(view.assessment?.controls)?view.assessment.controls:[];
  const done=controls.filter(c=>c.status==='DICHIARATO_VERIFICATO');
  const savedFields=Object.values(profile?.fields||{}).filter(v=>String(v||'').trim()).length;
  const issued=(view.batches||[]).reduce((n,b)=>n+(Number(b.issued)||0),0);
  return '<div class="rounded-lg border bg-slate-50 p-3 my-3 text-xs">'+
   '<b>Registrazioni già lette dal server</b><p class="mt-2">Controlli dichiarati verificati: '+done.length+'/'+controls.length+'. Campi DPO compilati: '+savedFields+'/10. Cedolini anonimi emessi: '+issued+'.</p>'+
   '<p class="mt-2">Revisione attuale: <b>'+escape(stageText(view.review?.stage))+'</b>. Lo stato PREPARATION non elimina verbali o atti precedenti, ma non autorizza il voto.</p>'+
   (done.length?'<details class="mt-2"><summary>Mostra controlli documentati</summary><ul class="mt-2">'+done.map(c=>'<li class="border-t py-2">'+escape(c.id)+': '+escape(c.note||'Nessuna annotazione')+(c.evidence?.historyId?' · ID evento '+escape(c.evidence.historyId):'')+'</li>').join('')+'</ul></details>':'<p class="mt-2">Nessun controllo amministrativo confermato nella fotografia corrente.</p>')+
   '<p class="mt-2">Release: <code class="break-all">'+escape(view.release?.commit||'non attestata')+'</code>. Le prove di versioni o configurazioni precedenti rimangono consultabili ma non sono automaticamente valide per questa release.</p></div>';
 }
 function archivedReferences(view,eventsPage,logsPage){
  const events=(eventsPage?.events||[]).slice(0,35);
  const logs=logsPage?.logs||[];
  const stamp=at=>{const d=new Date(at);return at&&Number.isFinite(+d)?d.toLocaleString('it-IT',{timeZone:'Europe/Rome'}):'data da verificare';};
  const administrative=events.map(e=>'<li class="border-b py-2"><b>'+escape(e.type||'Evento')+'</b> · '+escape(stamp(e.at))+(e.control?' · '+escape(e.control):'')+(e.protocolRef?' · '+escape(e.protocolRef):'')+'</li>').join('');
  const reports=logs.filter(l=>l.event==='COLLAUDO'&&l.report);
  const reportsHtml=reports.slice(0,20).map(l=>{
    const compatible=l.result==='PROVE_DICHIARATE_SUPERATE'&&l.release?.commit===view.release?.commit&&l.report.softwareVersion===view.release?.commit&&l.configurationSha256===view.configurationSha256;
    return '<li class="border-b py-2"><b>ID '+escape(l.id)+'</b> · '+escape(stamp(l.at))+' · '+escape(l.result)+' · '+escape(l.report.evidenceRef||'senza riferimento')+
     '<p>'+(compatible?'Release e configurazione corrispondono; il server verificherà anche la revisione delle credenziali.':'Non riutilizzabile automaticamente: esito, commit o configurazione non corrispondente.')+'</p>'+
     (compatible?'<button type="button" data-use-report="'+escape(l.id)+'" class="border rounded-lg px-2 py-1 mt-1">Inserisci ID nella proposta</button>':'')+'</li>';
  }).join('');
  return '<div class="border rounded-lg p-3 my-2 text-xs"><b>Atti registrati</b><ul>'+ (administrative||'<li>Nessun evento nella pagina.</li>')+'</ul>'+
    '<b class="block mt-3">Rapporti tecnici</b><ul>'+(reportsHtml||'<li>Nessun rapporto nella pagina consultata.</li>')+'</ul>'+
    '<p class="mt-2">Checkpoint presenti: '+logs.filter(x=>['OPENING','CLOSING'].includes(x.event)).length+'. Non sostituiscono le 12 prove del collaudo.</p>'+
    ((eventsPage?.nextCursor||logsPage?.nextCursor)?'<p class="mt-2">Sono presenti altre pagine: per la copia integrale usare lo ZIP riservato del fascicolo.</p>':'')+
    '<p class="mt-2">Le registrazioni non sono autorizzazioni automatiche e non dimostrano la segretezza del voto.</p></div>';
 }
 function renderReadiness(view){
  const labels={annualCircularRecorded:'Circolare annuale',commissionAppointed:'Nomina Commissione',voterRollFinal:'Elenchi elettorali definitivi',candidateListsValidated:'Liste e candidature',ballotApproved:'Scheda approvata',privacyChecked:'Verifica privacy',technicalTestPassed:'Collaudo tecnico',softwareFrozen:'Versione software congelata',backupPlanReady:'Backup e ripristino',incidentPlanReady:'Piano incidenti',communicationPublished:'Comunicazioni agli elettori',...root.LeviLegalReadiness?.CONTROLS};
  const blockers=view.assessment.blockers||[],missing=(view.assessment.controls||[]).filter(c=>c.status!=='DICHIARATO_VERIFICATO');
  const instructions={structuralSecrecy:'Apri il punto 2 e premi «Configura modalità in presenza con codici non nominativi». Poi genera e salva i cedolini.',testModeActive:'In Commissione → Collaudo disattiva la modalità prova prima del collaudo finale.',privacyReviewPending:'Dopo configurazione e ultimo lotto, registra il collaudo aggiornato. Al punto 3: proposta → verifica di una persona diversa → autorizzazione della Commissione.',votingReviewStale:'La versione, la configurazione o i lotti sono cambiati: registra un nuovo collaudo e ripeti proposta, verifica e autorizzazione.'};
  const entries=[...blockers.map(b=>instructions[b.id]||b.detail||b.id),...missing.map(c=>'In Commissione → Regolarità completa: '+(labels[c.id]||c.id)+'.')];
  if(view.suspended)entries.push('Dopo la nuova autorizzazione registra anche la ripresa dal pulsante in fondo.');
  if(view.closed)entries.push('Il procedimento risulta chiuso: non può essere riaperto da questa schermata.');
  if(!entries.length&&!view.assessment.admittedToSecretVoting)entries.push('Ammissione non confermata: aggiorna lo stato e verifica i controlli in Regolarità.');
  return '<section data-readiness class="my-4 p-4 border-2 border-blue-300 rounded-xl bg-blue-50"><h3 class="font-bold">Cosa manca per il voto reale</h3>'+(entries.length?'<ol class="list-decimal pl-5 text-sm space-y-2 mt-3">'+entries.map(t=>'<li>'+escape(t)+'</li>').join('')+'</ol>':'<p class="mt-2">Requisiti registrati. Il voto resta soggetto agli orari delle singole consultazioni e alla postazione autorizzata.</p>')+'<p class="text-xs mt-3">Ordine: configurazione e modalità → tutti i cedolini → collaudo finale → verifica indipendente → autorizzazione. Ogni modifica successiva può richiedere una nuova revisione.</p></section>';
 }
 async function show(options={}){
  if(issuingBatch)return;
  const owner=app;discardDownload();
  let host=document.getElementById('privacy-review-dialog');
  if(!host){host=document.createElement('dialog');host.id='privacy-review-dialog';host.style.cssText='width:min(1080px,96vw);max-height:92vh;overflow:auto;border:1px solid #94a3b8;border-radius:16px;color:#111;background:#fff;padding:24px';host.addEventListener('close',()=>{discardDownload();dropBatch();});host.addEventListener('cancel',e=>{if(!canClose(host))e.preventDefault();});document.body.appendChild(host);}
  if(!host.open)host.showModal();host.innerHTML='<p>Caricamento fascicolo e stato dei controlli…</p>';
  try{
   const view=await call('getVotingReview'),canEdit=view.role==='COMMISSIONE',st=view.review?.stage;
   const [profile,materials]=canEdit?await Promise.all([call('getDpoReviewProfile'),call('getDpoDossierMaterials')]):[{fields:{}},null];
   if(app!==owner)return;
   host.innerHTML=`<div class="flex justify-between gap-3"><h2 class="text-xl font-black">Fascicolo DPO / gestione blocchi</h2><button data-close class="border rounded-lg p-2">Chiudi</button></div><p class="text-sm mt-3">DPO: <b>Vargiu Scuola S.r.l.</b> · dpo@vargiuscuola.it. Il fascicolo supporta la valutazione privacy; non attribuisce al DPO il potere di autorizzare elezioni telematiche.</p>
   <div class="my-4 p-3 border rounded-xl ${view.assessment.admittedToSecretVoting?'bg-emerald-50':'bg-amber-50'}"><b>${escape(stageText(st))}</b> · ${view.suspended?'Votazione sospesa':view.assessment.admittedToSecretVoting?'Requisiti di apertura registrati':'Voto reale non ancora abilitato'}<p class="text-xs mt-1">Commit ${escape(view.release?.commit||'NON ATTESTATO')}<br>Configurazione ${escape(view.configurationAvailable===false?'non ancora salvata: il PDF preliminare è disponibile':view.configurationSha256||'NON ATTESTATA')}</p></div>
   <p class="text-xs">${escape(view.privacy.limitation)}</p>
    <section class="my-4 border border-blue-200 rounded-xl p-4 bg-slate-50" aria-label="Valutazione distinta dei controlli privacy">
      <h3 class="font-black text-sm">Garanzie della piattaforma: distinguere il codice dalla verifica indipendente</h3>
      <div class="grid md:grid-cols-2 gap-3 text-xs mt-3">
        <div class="rounded-lg border bg-white p-3"><b>Archivio credenziali non nominative</b><p class="mt-1">${view.privacy.credentialMode==='PRESENTIAL_UNLINKED_V1'?'MODALITÀ PREVISTA NEL BACKEND — separazione logica dalla rubrica nominativa, da riscontrare sul servizio distribuito.':'NON ATTIVA — è selezionato il processo con credenziali nominative.'}</p></div>
        <div class="rounded-lg border bg-white p-3"><b>Urna cifrata</b><p class="mt-1">PROTEZIONE LATO SERVER prevista nel codice; il server riceve comunque le scelte e possiede la chiave. Non è cifratura end-to-end.</p></div>
        <div class="rounded-lg border bg-white p-3"><b>Non correlabilità rispetto al server e ai metadati</b><p class="mt-1">NON DIMOSTRATA — richiede architettura idonea e verifica indipendente di transazioni, tempi, rete, accessi e dati dei fornitori.</p></div>
        <div class="rounded-lg border bg-white p-3"><b>Segretezza strutturale verificata</b><p class="mt-1">${view.privacy.structuralAnonymityVerified===true?'VALUTAZIONE ARCHITETTURALE POSITIVA — controllare evidenze indipendenti.':'NON VERIFICATA — non modificabile mediante checkbox o salvataggio del collaudo.'}</p></div>
      </div>
      <p class="text-xs mt-3"><b>Per completare:</b> dimostrare la consegna casuale dei codici senza collegamento ai nominativi, esaminare i metadati dei fornitori, documentare il modello di minaccia e valutare cifratura nel dispositivo, scrutinio verificabile e custodia indipendente delle chiavi. Il DPO valuta il trattamento e gli organi competenti decidono sulla procedura; nessun campo si certifica da solo.</p>
    </section>
   ${canEdit?`<div class="my-4"><div class="flex flex-wrap gap-3"><button type="button" data-pdf class="bg-slate-900 text-white px-4 py-3 rounded-xl font-bold">Scarica PDF dettagliato per il DPO</button><button type="button" data-export class="border px-4 py-3 rounded-xl font-bold">Scarica ZIP con tutte le evidenze</button></div><p data-export-status role="status" aria-live="polite" class="mt-3 text-sm"></p><div data-download></div></div><details class="border rounded-xl p-4 mb-4"><summary class="font-bold cursor-pointer">Documentazione tecnica riservata: architettura, sicurezza e funzionamento</summary>${materials.sections.map(s=>`<section class="my-4"><h3 class="font-bold">${escape(s.title)}</h3>${(s.paragraphs||[]).map(p=>`<p class="text-sm my-2">${escape(p)}</p>`).join('')}${s.rows?`<div class="overflow-auto"><table class="text-xs w-full">${s.rows.map((r,i)=>`<tr>${r.map(c=>i===0?`<th class="border p-2 text-left">${escape(c)}</th>`:`<td class="border p-2 align-top">${escape(c)}</td>`).join('')}</tr>`).join('')}</table></div>`:''}</section>`).join('')}</details>`:'<p class="my-4 text-sm">Il fascicolo DPO completo si consulta e si scarica dall’area Commissione. Qui restano disponibili i controlli tecnici e la verifica degli interventi.</p>'}
   ${canEdit?`<details class="border rounded-xl p-4 mb-4"><summary class="font-bold cursor-pointer">1. Documentazione della scuola</summary><p class="text-xs my-3">Inserire riferimenti a documenti custoditi dalla scuola. Non inserire dati degli elettori, password o codici. Il salvataggio invalida la precedente revisione: completare questi dati prima del collaudo.</p><form data-profile>${Object.entries(materials.fields).map(([key,label])=>`<label class="block text-sm mb-3">${escape(label)}<textarea name="${key}" maxlength="4000" ${canEdit?'':'readonly'} class="w-full border rounded-lg p-2 text-black" rows="3" placeholder="NON DOCUMENTATO — indicare atto, responsabile, misure, durata/localizzazione ove pertinente">${escape(profile.fields[key])}</textarea></label>`).join('')}${canEdit?'<button class="bg-slate-900 text-white p-3 rounded-lg">Salva riferimenti e prepara nuova revisione</button>':''}</form></details>`:''}
   <details class="border rounded-xl p-4 mb-4"><summary class="font-bold cursor-pointer">2. Codici non nominativi per la postazione scolastica</summary><p class="text-sm my-3">Identificazione in presenza; estrazione casuale di cedolini chiusi; registro della consegna separato e senza codice. Non distribuire in ordine di elenco e non inviare codici per email nominativa. Definire gestione smarrimenti e lotti inutilizzati nel verbale. Per i genitori consegnare un solo codice per persona per il Consiglio d’Istituto e un codice distinto per ciascuna classe interessata, non per ciascun figlio. I vecchi codici genitori privi di consultazione non sono più ammessi e devono essere ritirati. Il numero di persone distinte è verificato dal seggio; il software non deduce identità dai nomi.</p><p class="text-xs">Modalità: ${escape(view.privacyMode)}. Codici emessi: <span data-issued-count>${view.batches.reduce((n,b)=>n+b.issued,0)}</span>. Il vecchio registro rimane per l’elettorato e le candidature; i nuovi codici non vi sono associati.</p>${canEdit?'<button type="button" data-mode class="border rounded-lg p-2 my-3">Configura modalità in presenza con codici non nominativi</button><form data-batch class="grid md:grid-cols-2 gap-3"><label>Componente<select name="tipo" class="border p-2 w-full"><option>STUDENTE</option><option>GENITORE</option><option>DOCENTE</option><option>ATA</option></select></label><label>Classe del gruppo<input name="classe" maxlength="30" class="border p-2 w-full"></label><label data-parent-only hidden>Consultazione genitori<select name="electionKey" class="border p-2 w-full"><option value="classeGenitore">Solo rappresentanti di classe</option><option value="consiglio">Solo Consiglio d’Istituto</option></select></label><label data-parent-only hidden>Genitori distinti aventi diritto alla consultazione<input name="eligibleCount" type="number" min="1" max="50000" class="border p-2 w-full"><span class="text-xs">Numero verificato dal seggio, senza contare due volte la stessa persona. La quota non è aumentabile dopo la prima emissione.</span></label><label>Quantità (1–250)<input name="count" type="number" min="1" max="250" required class="border p-2 w-full"></label><label>Verbale / protocollo lotto<input name="protocolRef" required maxlength="200" class="border p-2 w-full"></label><label class="md:col-span-2 text-sm"><input type="checkbox" required> Ho definito custodia, distribuzione casuale e stampa unica; i codici non saranno abbinati ai nomi.</label><button class="bg-slate-900 text-white p-3 rounded-lg">Genera e scarica cedolini PDF</button></form>':''}</details>
   <section class="border rounded-xl p-4"><h3 class="font-bold">3. Unica procedura di approvazione</h3><p class="text-sm mt-2" role="status">Stato attuale: <b>${escape(stageText(st))}</b>. ${st==='PREPARATION'||!st?'Il passo successivo è una proposta documentata, non l’autorizzazione.':st==='PROPOSED'?'Il passo successivo è la verifica di una persona indipendente.':st==='VERIFIED'?'La Commissione può esaminare l’autorizzazione finale.':st==='AUTHORIZED'?'La decisione risulta registrata; restano applicabili gli orari e le regole elettorali.':'Prima di procedere controllare le evidenze richieste.'}</p><p class="text-sm my-3">Prima registrare il collaudo completo nell’area tecnica, con tutte le prove effettivamente superate. La proposta richiama quel rapporto; la verifica richiede una persona diversa da autore e proponente. La Commissione decide dopo la verifica di un’altra persona. Non attestare come risolti rischi ancora presenti. Un file o un hash da soli non provano il contenuto.</p><p class="text-xs my-2">Una modifica di versione, configurazione, fascicolo o lotto richiede nuova revisione. Dopo una sospensione, l’autorizzazione non proroga gli orari: occorre anche registrare la ripresa.</p>
   <form data-review novalidate class="space-y-3"><label class="block">Azione<select name="action" class="border p-2 w-full">${reviewNextActions(st,canEdit).map(item=>`<option value="${item.value}">${item.label}</option>`).join('')}<option value="REJECT">Non superato: mantieni il blocco</option></select></label><label class="block">ID rapporto collaudo (per la proposta)<input name="reportId" class="border p-2 w-full" maxlength="128"></label><label class="block">Protocollo / riferimento documento<input name="protocolRef" required maxlength="200" class="border p-2 w-full"></label><label class="block">Motivo, intervento, evidenza e rischi residui<textarea name="note" required maxlength="1500" class="border p-2 w-full" rows="3"></textarea></label><label class="block">Documento di evidenza (solo calcolo locale SHA-256; conservare agli atti)<input data-evidence type="file" class="block"></label><label class="block">SHA-256 documento<input name="evidenceSha256" required pattern="[a-fA-F0-9]{64}" class="border p-2 w-full" maxlength="64"></label><p class="text-xs text-slate-700">Per la proposta sono obbligatori l’ID di un collaudo con 12 prove superate sulla versione e configurazione attuali, il protocollo, una motivazione e l’impronta SHA-256 del documento conservato dalla scuola. La registrazione non abilita automaticamente il voto.</p><button type="submit" class="bg-slate-900 text-white p-3 rounded-lg">Registra con il mio account</button><p data-review-feedback role="alert" aria-live="assertive" class="text-sm mt-2"></p></form>
   ${canEdit&&view.suspended?'<button data-resume class="mt-3 bg-emerald-800 text-white p-3 rounded-lg">Registra ripresa dopo autorizzazione</button>':''}</section><p data-status role="status" class="mt-4 text-sm"></p>`;
   host.querySelector('h2').parentElement.insertAdjacentHTML('afterend',renderReadiness(view));
   // Apertura mirata dal pulsante Collaudo, senza dichiarare superata alcuna verifica.
   if(options.focus==='anonymity'){
     const target=host.querySelector('[aria-label="Valutazione distinta dei controlli privacy"]');
     if(target){
       target.setAttribute('tabindex','-1');
       target.focus({preventScroll:true});
       target.scrollIntoView({block:'start'});
     }
   }
   host.querySelector('[data-close]').onclick=()=>{if(canClose(host))host.close();};showBatchDownload(host);host.querySelector('[data-export]')?.addEventListener('click',e=>exportDossier(e.currentTarget));host.querySelector('[data-pdf]')?.addEventListener('click',e=>exportDossier(e.currentTarget,'pdf'));
   async function action(button,fn){if(issuingBatch||pendingBatch){host.querySelector('[data-status]').textContent='Prima scarica e conferma il PDF del lotto in corso.';return;}button.disabled=true;try{await fn();await show();}catch(e){host.querySelector('[data-status]').textContent=e.message;}finally{button.disabled=false;}}
   host.querySelector('[data-profile]')?.addEventListener('submit',e=>{e.preventDefault();action(e.submitter,()=>call('saveDpoReviewProfile',{fields:Object.fromEntries(new FormData(e.target))}));});
   if(canEdit){
    host.querySelector('[data-mode]').onclick=e=>action(e.currentTarget,()=>app.saveMode());
    const batchForm=host.querySelector('[data-batch]');
    function updateBatchScope(){
     const parent=batchForm.elements.tipo.value==='GENITORE';
     batchForm.querySelectorAll('[data-parent-only]').forEach(el=>{el.hidden=!parent;});
     for(const name of ['electionKey','eligibleCount']){batchForm.elements[name].disabled=!parent;batchForm.elements[name].required=parent;}
     batchForm.elements.classe.disabled=parent&&batchForm.elements.electionKey.value==='consiglio';
     batchForm.elements.classe.required=(parent&&!batchForm.elements.classe.disabled)||batchForm.elements.tipo.value==='STUDENTE';
    }
    batchForm.elements.tipo.addEventListener('change',updateBatchScope);batchForm.elements.electionKey.addEventListener('change',updateBatchScope);updateBatchScope();
    host.querySelector('[data-batch]').onsubmit=async e=>{
     e.preventDefault();
     if(issuingBatch)return;
     if(pendingBatch){host.querySelector('[data-status]').textContent='Lotto già emesso. Usa il collegamento PDF esistente, non emettere altri codici.';return;}
     if(typeof root.jspdf?.jsPDF!=='function'||typeof URL.createObjectURL!=='function'){host.querySelector('[data-status]').textContent='Libreria PDF non disponibile. Nessun lotto è stato richiesto.';return;}
     const values=Object.fromEntries(new FormData(e.target));
     const button=e.submitter||batchForm.querySelector('button:not([type]),button[type="submit"]');
     issuingBatch=true;button.disabled=true;
     host.querySelector('[data-status]').textContent='Emissione in corso: lascia aperta questa finestra.';
     try{
      const result=await call('createAnonymousCredentials',{...values,count:Number(values.count),eligibleCount:Number(values.eligibleCount)});
      if(app!==owner){if(Array.isArray(result.codes))result.codes.fill('');return;}
      if(!Array.isArray(result.codes)||!result.codes.length)throw Error('Nessun codice restituito. Controllare il registro dei lotti prima di richiedere altre credenziali.');
      pendingBatch={codes:result.codes,tipo:result.tipo,classe:result.classe,electionKey:result.electionKey,url:null,autoAttempted:false};
      host.querySelector('[data-issued-count]').textContent=String(view.batches.reduce((n,b)=>n+b.issued,0)+result.codes.length);
      showBatchDownload(host);
      host.querySelector('[data-status]').textContent='Lotto emesso. Scarica il PDF dal collegamento blu e verifica il file prima di confermare.';
     }catch(error){if(app===owner)host.querySelector('[data-status]').textContent=error.message;}
     finally{issuingBatch=false;button.disabled=!!pendingBatch;}
    };
   }
   const form=host.querySelector('[data-review]');
   form.elements.action.value=reviewNextActions(st,canEdit)[0]?.value||'REJECT';
   form.elements.reportId.value=view.review?.reportId||'';
   const reviewFeedback=host.querySelector('[data-review-feedback]');
   const reviewButton=form.querySelector('button[type="submit"]');
   host.querySelector('[data-evidence]').onchange=async e=>{
     const file=e.target.files[0];if(!file)return;
     if(file.size>30*1024*1024){reviewFeedback.textContent='Il documento supera 30 MB: non è possibile calcolarne qui l’impronta.';return;}
     reviewFeedback.textContent='Calcolo dell’impronta del documento in corso…';reviewButton.disabled=true;
     try{form.elements.evidenceSha256.value=await sha(await file.arrayBuffer());reviewFeedback.textContent='SHA-256 calcolato: ora compila protocollo e motivazione e registra.';}
     catch(error){reviewFeedback.textContent='Impossibile calcolare l’impronta: '+(error?.message||'errore del browser')+'. Non registrare dati senza evidenza.';}
     finally{reviewButton.disabled=false;}
   };
   form.onsubmit=async e=>{
     e.preventDefault();
     if(reviewButton.disabled)return;
     const values=Object.fromEntries(new FormData(form)),missing=[];
     if(!values.protocolRef?.trim())missing.push('protocollo o riferimento dell’atto');
     if(!values.note?.trim())missing.push('motivazione, evidenza e rischi residui');
     if(!/^[a-f0-9]{64}$/i.test(values.evidenceSha256||''))missing.push('SHA-256 del documento (64 caratteri esadecimali)');
     if(values.action==='PROPOSE'&&!values.reportId?.trim())missing.push('ID del rapporto completo delle 12 prove');
     if(values.action==='PROPOSE'&&view.privacyMode!=='PRESENTIAL_UNLINKED_V1')missing.push('modalità di credenziali non nominative (punto 2)');
     if(values.action==='PROPOSE'&&view.configurationAvailable===false)missing.push('configurazione annuale registrata nel database');
     if(values.action==='VERIFY'&&st!=='PROPOSED')missing.push('proposta precedente registrata');
     if(values.action==='AUTHORIZE'&&st!=='VERIFIED')missing.push('la Commissione può autorizzare soltanto dopo una proposta e una verifica indipendente registrate sulla configurazione corrente');
     if(values.action==='AUTHORIZE'&&!canEdit)missing.push('account Commissione autorizzato');
     if(missing.length){
       reviewFeedback.textContent='Registrazione NON inviata. Completa: '+missing.join('; ')+'.';
       reviewFeedback.className='text-sm mt-2 font-bold text-red-800';
       reviewFeedback.scrollIntoView?.({block:'nearest'});
       const key=!values.protocolRef?.trim()?'protocolRef':!values.note?.trim()?'note':!values.evidenceSha256?.trim()?'evidenceSha256':values.action==='PROPOSE'&&!values.reportId?.trim()?'reportId':null;
       if(key)form.elements[key]?.focus();
       return;
     }
     reviewButton.disabled=true;reviewButton.textContent='Registrazione in corso…';
     reviewFeedback.textContent='Invio al server in corso; non premere nuovamente. Nessun esito è ancora confermato.';
     reviewFeedback.className='text-sm mt-2 text-slate-700';
     try{
       const response=await call('advanceVotingReview',values);
       if(response?.ok!==true)throw Error('Il server non ha confermato il salvataggio.');
       await show();
       const ok=document.querySelector('#privacy-review-dialog [data-review-feedback]');
       if(ok){ok.textContent='Operazione registrata dal server con questo account. Verifica lo stato aggiornato e consulta lo storico per gli estremi dell’atto.';ok.className='text-sm mt-2 font-bold text-emerald-800';}
     }catch(error){
       const message=String(error?.message||'Errore sconosciuto');
       const quota=/quota|resource.exhausted|429|too.many.requests|esaurit/i.test(message);
       reviewFeedback.textContent=(quota?'Quota o risorse del servizio temporaneamente esaurite.':'Registrazione non confermata.')+' Dettaglio: '+message+'. Prima di riprovare controlla lo storico, per evitare registrazioni duplicate.';
       reviewFeedback.className='text-sm mt-2 font-bold text-red-800';
     }finally{reviewButton.disabled=false;reviewButton.textContent='Registra con il mio account';}
   };
   host.querySelector('[data-resume]')?.addEventListener('click',e=>{const reason=prompt('Protocollo e motivazione della ripresa:');if(reason)action(e.currentTarget,()=>call('setEmergencySuspension',{suspended:false,reason}));});
   if(canEdit&&options.download==='pdf')await exportDossier(host.querySelector('[data-pdf]'),'pdf');
  }catch(e){if(app!==owner)return;host.innerHTML='<p role="alert">'+escape(e.message)+'</p><p data-status role="status"></p><button data-close class="border p-2">Chiudi</button>';showBatchDownload(host);host.querySelector('[data-close]').onclick=()=>{if(canClose(host))host.close();};}
 }
 function clear(){app=undefined;discardDownload();dropBatch();const host=document.getElementById('privacy-review-dialog');if(host){if(host.open)host.close();host.remove();}}
 root.LeviPrivacyReview={configure:value=>{app=value;},show,makePdf,exportDossier,clear};
})(window);
