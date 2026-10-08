import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Exercise the built Worker using isolated databases, never published records.
const root=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(root+'/package.json'),mfRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=await import(mfRequire.resolve('miniflare'));
const modules=fs.readdirSync(root+'/dist/server',{recursive:true}).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(f=>({type:'ESModule',path:root+'/dist/server/'+f}));
const mf=new Miniflare({modules,modulesRoot:root+'/dist/server',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs'],fallthrough:true}]});
const owner={'oai-authenticated-user-id':'number-owner-a','oai-authenticated-user-email':'a@example.test'},other={'oai-authenticated-user-id':'number-owner-b','oai-authenticated-user-email':'b@example.test'};
async function call(body,headers=owner){
 let init={method:body?'POST':'GET',headers};
 if(body instanceof FormData){const request=new Request('https://workspace.test/api/workspace',{...init,body});init={method:'POST',headers:Object.fromEntries(request.headers),body:new Uint8Array(await request.arrayBuffer())};}
 else if(body)init={...init,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)};
 const r=await mf.dispatchFetch('https://workspace.test/api/workspace',init);return {status:r.status,...await r.json()};
}
function state(r){assert.equal(r.status,200,r.error);return r.state||r;}
function pass(message){console.log('PASS '+message);}
function document(title,code){return {action:'document',title,code,category:'Regulation',content:'Controlled document text.',changes:'Initial draft'};}
try{
 const database=await mf.getD1Database('DB');
 for(const file of fs.readdirSync(root+'/drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync(root+'/drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await database.prepare(sql.trim()).run();
 const initial=state(await call()),foreign=state(await call(undefined,other));
 assert.equal(initial.business.document_numbering_mode,'custom');assert.equal(foreign.business.document_numbering_mode,'custom');
 const originalCodes=new Map(initial.documents.map(d=>[d.id,d.code])),staff=initial.members.find(m=>m.role==='staff'),staffView={...owner,'x-staff-preview':staff.id};
 let s=state(await call(document('Own numbering A','POLICY-HS-001'))),custom=s.documents.find(d=>d.title==='Own numbering A');assert.equal(custom.code,'POLICY-HS-001');assert.equal(custom.system_control_number,null);
 assert.equal((await call(document('Duplicate number','POLICY-HS-001'))).status,409);
 assert.equal((await call(document('Missing custom number'))).status,400);
 state(await call(document('Own numbering B','POLICY-HS-001'),other));
 pass('existing businesses keep custom numbering and each business can use its own independent number system');

 for(const mode of ['automatic','custom'])assert.equal((await call({action:'documentNumberingSettings',mode},staffView)).status,403);
 assert.equal((await call({action:'documentNumberingSettings',mode:'invalid'})).status,400);
 assert.equal((await call({action:'documentNumberingSettings',mode:'automatic'},{})).status,401);
 // Simulate a pre-feature custom number without modifying its original history.
 const legacy=initial.documents[0];await database.prepare('UPDATE documents SET code=? WHERE id=?').bind('cdt-00000007',legacy.id).run();originalCodes.set(legacy.id,'cdt-00000007');
 s=state(await call({action:'documentNumberingSettings',mode:'automatic',businessId:foreign.business.id}));assert.equal(s.business.document_numbering_mode,'automatic');
 assert.equal(state(await call(undefined,other)).business.document_numbering_mode,'custom');
 for(const [id,code] of originalCodes)assert.equal(s.documents.find(d=>d.id===id).code,code);
 assert.equal(s.business.reminder_every_days,initial.business.reminder_every_days);assert.equal(s.business.reminder_enabled,initial.business.reminder_enabled);
 assert(s.audit.some(a=>a.action==='Document numbering settings saved'));
 pass('numbering settings are owner-only, business-scoped, persisted, and preserve existing records and reminder settings');

 assert.equal((await call({...document('Stale custom form','STALE'),numberingMode:'custom'})).status,409);
 s=state(await call({...document('Automatic document','Attempted manual override'),numberingMode:'automatic'}));const automatic=s.documents.find(d=>d.title==='Automatic document');
 assert.equal(automatic.code,'CDT-00000008');assert.equal(automatic.system_control_number,automatic.code);
 assert(s.audit.some(a=>a.action==='Draft uploaded'&&a.detail.includes(automatic.code)));
 const media=new FormData();for(const [key,value] of Object.entries({...document('Automatic video'),category:'Training media',content:'',numberingMode:'automatic'}))if(value!==undefined)media.set(key,value);
 const bytes=Uint8Array.from([0,0,0,20,102,116,121,112,105,115,111,109]);media.set('file',new Blob([bytes],{type:'video/mp4'}),'orientation.mp4');
 s=state(await call(media));const video=s.documents.find(d=>d.title==='Automatic video');assert.equal(video.code,'CDT-00000009');assert.equal(video.system_control_number,video.code);
 const videoRevision=s.revisions.find(r=>r.document_id===video.id),storedVideo=await mf.dispatchFetch('https://workspace.test/api/files/'+videoRevision.id,{headers:owner});assert.equal(storedVideo.status,200);assert.deepEqual(new Uint8Array(await storedVideo.arrayBuffer()),bytes);
 assert.equal((await call(document('Staff upload'),staffView)).status,403);
 pass('new documents and uploaded media receive server-generated numbers and skip all existing reserved numbers');

 state(await call({action:'documentNumberingSettings',mode:'automatic'},other));
 const saves=await Promise.all(Array.from({length:12},(_,i)=>call(document('Concurrent automatic '+i),i%2?other:owner)));saves.forEach(state);
 const a=state(await call()),b=state(await call(undefined,other));
 const generated=[...a.documents,...b.documents].filter(d=>d.system_control_number);
 assert.equal(generated.length,14);assert.equal(new Set(generated.map(d=>d.code)).size,14);assert(generated.every(d=>/^CDT-\d{8}$/.test(d.code)&&d.code===d.system_control_number));
 assert(!a.documents.some(d=>b.documents.some(otherDoc=>otherDoc.id===d.id)));
 pass('simultaneous uploads in multiple businesses create globally unique numbers without exposing other businesses’ records');

 const first=state(await call()).revisions.find(r=>r.document_id===automatic.id);
 state(await call({action:'release',revisionId:first.id,memberIds:[staff.id],startDate:initial.today,dueDate:initial.today}));
 state(await call({action:'view',trainingId:state(await call(undefined,staffView)).training.find(t=>t.document_id===automatic.id).id},staffView));
 let visible=state(await call(undefined,staffView));const training=visible.training.find(t=>t.document_id===automatic.id);assert.equal(visible.documents.find(d=>d.id===automatic.id).code,automatic.code);
 state(await call({action:'acknowledge',trainingId:training.id,reviewed:true,understood:true},staffView));
 s=state(await call({action:'documentNumberingSettings',mode:'custom'}));assert.equal(s.documents.find(d=>d.id===automatic.id).code,automatic.code);
 s=state(await call({action:'revision',documentId:automatic.id,code:'RENUMBER-ATTEMPT',content:'Revised procedure',changes:'Updated procedure'}));
 const revision=s.revisions.find(r=>r.document_id===automatic.id&&r.status==='draft');assert.equal(revision.version,2);assert.equal(s.documents.find(d=>d.id===automatic.id).code,automatic.code);
 assert.equal(s.training.find(t=>t.id===training.id).status,'complete');assert(s.training.find(t=>t.id===training.id).acknowledged_at);
 const print=await mf.dispatchFetch('https://workspace.test/print/'+first.id,{headers:staffView});assert.equal(print.status,200);assert((await print.text()).includes(automatic.code));
 const download=await mf.dispatchFetch('https://workspace.test/api/files/'+first.id+'?download=1',{headers:staffView});assert.equal(download.status,200);assert(download.headers.get('content-disposition').includes(automatic.code));
 pass('mode changes and new revisions retain the original control number, staff acknowledgements, print labels, and download labels');

 assert.equal((await call({...document('Stale automatic form'),numberingMode:'automatic'})).status,409);
 for(const code of ['CDT-00000050','cdt-100','x'.repeat(41),'   '])assert.equal((await call(document('Invalid custom code',code))).status,400);
 state(await call({action:'deleteDocument',documentId:custom.id,reason:'Consolidated procedure.'}));assert.equal((await call(document('Deleted custom number','POLICY-HS-001'))).status,409);
 const duplicates=await Promise.all([call(document('Concurrent custom one','CUSTOM-UNIQUE')),call(document('Concurrent custom two','CUSTOM-UNIQUE'))]);assert.deepEqual(duplicates.map(x=>x.status).sort(),[200,409]);
 state(await call({action:'deleteDocument',documentId:video.id,reason:'Replaced orientation.'}));
 state(await call({action:'documentNumberingSettings',mode:'automatic'}));s=state(await call(document('Next automatic document')));const next=s.documents.find(d=>d.title==='Next automatic document');
 assert(!generated.some(d=>d.code===next.code));assert(Number(next.code.slice(4))>Math.max(...generated.map(d=>Number(d.code.slice(4)))));
 for(let i=0;i<2;i++)assert.equal(state(await call()).documents.find(d=>d.id===next.id).code,next.code);
 pass('custom duplicates and reserved system formats are rejected, deleted numbers are not reused, and saved numbers persist');
 console.log('All document numbering checks passed.');
}finally{await mf.dispose();}
