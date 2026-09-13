'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),policy=require('../lib/election-policy');
const cut=(start,end)=>{const from=html.indexOf(start),to=html.indexOf(end,from+start.length);assert.ok(from>=0&&to>from);return html.slice(from,to);};
const p=(period,date,protocol)=>({dedicated:true,period,kind:'RINNOVO',windows:[{date,from:'09:00',to:'11:00'}],acts:[{authority:'Istituto',protocol,date:'2026-09-01',subject:'Consultazione di prova',url:'https://example.edu.test/'+protocol}],releaseDate:date,releaseTime:'12:00'});
const configElezioni={annoScolastico:'2026/2027',consultazioni:{consulta:p('OTTOBRE','2026-10-10','ATTO-OTTOBRE'),consiglio:p('NOVEMBRE','2026-11-15','ATTO-NOVEMBRE')},riferimentoCircolare:{numero:'ATTO-GENERALE'},commissione:[],personaleDirezione:[],assistenteTecnico:{nome:'Tecnico di prova',postazione:'Laboratorio di prova'}};
const context={configElezioni,LeviElectionPolicy:policy,Date,URL,document:{baseURI:'https://example.edu.test/'},fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('vendor/pdf-fonts.json','utf8'))}),getVotiUrna:async()=>[],workflowStatus:()=>({}),window:{},console};
vm.createContext(context);
vm.runInContext(cut('function consultationKey(',"let selectedConsultation=")+cut('async function appendConsultationPdf(', 'function technicalEscape(')+cut('function technicalEscape(', 'function technicalControlLabel(')+cut('function escapeXmlDocx(', 'function buildDocxPackage('),context);
async function check(){
 const october=await context.buildElectionMinutesDocx('consulta'),november=await context.buildElectionMinutesDocx('consiglio','DOCENTE');
 assert.ok(october.includes('ATTO-OTTOBRE')&&!october.includes('ATTO-NOVEMBRE')&&!october.includes('ATTO-GENERALE'));
 assert.ok(november.includes('ATTO-NOVEMBRE')&&!november.includes('ATTO-OTTOBRE')&&!november.includes('ATTO-GENERALE'));
 assert.ok(october.includes('2026-10-10')&&november.includes('2026-11-15'));assert.ok(october.includes('09:00')&&october.includes('11:00'));
 const {jsPDF}=require('../vendor/jspdf.umd.min.js');
 for(const key of ['consulta','consiglio']){
  const doc=new jsPDF();await context.appendConsultationPdf(doc,key);assert.equal(doc.getNumberOfPages(),2);
  if(process.env.LEVI_DOCUMENT_TEST_DIR)fs.writeFileSync(process.env.LEVI_DOCUMENT_TEST_DIR+'/'+key+'.pdf',Buffer.from(doc.output('arraybuffer')));
 }
 assert.ok(html.includes('await appendConsultationPdf(doc,section);'));
 console.log('PASS: distinct October/November acts and dates in Word; PDF appendix generation with embedded font.');
}
check().catch(e=>{console.error(e);process.exitCode=1;});
