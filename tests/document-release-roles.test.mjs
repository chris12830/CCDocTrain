import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Run the built Worker against isolated D1/R2, without changing published staff.
const root=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(root+'/package.json'),mfRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=await import(mfRequire.resolve('miniflare'));
const modules=fs.readdirSync(root+'/dist/server',{recursive:true}).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(f=>({type:'ESModule',path:root+'/dist/server/'+f}));
const mf=new Miniflare({modules,modulesRoot:root+'/dist/server',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs'],fallthrough:true}]});
const owner={'oai-authenticated-user-id':'release-role-owner','oai-authenticated-user-email':'owner@example.test','oai-authenticated-user-full-name':'Release%20Approver','oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'},other={'oai-authenticated-user-id':'release-role-other','oai-authenticated-user-email':'other@example.test'};
async function call(body,headers=owner){
 let init={method:body?'POST':'GET',headers};
 if(body instanceof FormData){const encoded=new Request('https://workspace.test/api/workspace',{...init,body});init={method:'POST',headers:Object.fromEntries(encoded.headers),body:new Uint8Array(await encoded.arrayBuffer())};}
 else if(body)init={...init,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)};
 const r=await mf.dispatchFetch('https://workspace.test/api/workspace',init);return {status:r.status,...await r.json()};
}
function state(r){assert.equal(r.status,200,r.error);return r.state||r;}
function pass(message){console.log('PASS '+message);}
function shift(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
try{
 const database=await mf.getD1Database('DB');
 for(const file of fs.readdirSync(root+'/drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync(root+'/drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await database.prepare(sql.trim()).run();
 const initial=state(await call());state(await call(undefined,other));
 const a=state(await call({action:'trainingRole',name:'Educators'})).trainingRoles.find(r=>r.name==='Educators'),b=state(await call({action:'trainingRole',name:'Supervisors'})).trainingRoles.find(r=>r.name==='Supervisors');
 const foreignRole=state(await call({action:'trainingRole',name:'Other business role'},other)).trainingRoles[0];
 const [first,second,unselected]=initial.members.filter(m=>m.role==='staff'),staffView={...owner,'x-staff-preview':first.id};
 state(await call({action:'staffTrainingProfile',memberId:first.id,trainingRoleId:a.id,startDate:shift(initial.today,-30)}));
 state(await call({action:'staffTrainingProfile',memberId:second.id,trainingRoleId:b.id,startDate:initial.today}));
 const base={action:'document',title:'New role policy',code:'ROLE-RELEASE-001',category:'Regulation',content:'New controlled role procedure',changes:'Initial owner review',roleTrainingRequired:true,trainingRoleIds:[a.id,b.id,a.id],roleTrainingDueDays:5};
 for(const changes of [{trainingRoleIds:[]},{trainingRoleIds:[foreignRole.id]},{trainingRoleIds:[a.id,123]},{trainingRoleIds:'not json'},{roleTrainingRequired:'maybe'},{roleTrainingRequired:false},{roleTrainingDueDays:-1},{roleTrainingDueDays:true},{staffAccess:'not_viewable'}])assert.equal((await call({...base,...changes})).status,400);
 assert.equal((await call(base,staffView)).status,403);
 let s=state(await call(base)),doc=s.documents.find(d=>d.code===base.code),draft=s.revisions.find(r=>r.document_id===doc.id);
 assert.equal(draft.status,'draft');assert.equal(draft.approved_by,null);assert.equal(draft.approved_at,null);assert.deepEqual(JSON.parse(draft.release_role_plan),{required:true,roleIds:[a.id,b.id],dueDays:5});
 assert(!s.trainingNeeds.some(n=>n.document_id===doc.id));assert(!s.training.some(t=>t.document_id===doc.id));
 const before=state(await call(undefined,staffView));assert(!before.documents.some(d=>d.id===doc.id));assert(!before.revisions.some(r=>r.document_id===doc.id));
 pass('role choices are validated and saved with the draft without exposing content or assigning staff before approval');

 const release={action:'release',revisionId:draft.id,memberIds:[],startDate:initial.today,dueDate:shift(initial.today,7)};
 assert.equal((await call(release)).status,400);assert.equal((await call({...release,approvalConfirmed:false})).status,400);
 assert.equal((await call({...release,approvalConfirmed:true},staffView)).status,403);
 assert.equal((await call({...release,approvalConfirmed:true},other)).status,404);
 assert.equal((await call({...release,approvalConfirmed:true,roleTrainingRequired:true,trainingRoleIds:[foreignRole.id]})).status,400);
 s=state(await call());assert.equal(s.revisions.find(r=>r.id===draft.id).status,'draft');assert(!s.trainingNeeds.some(n=>n.document_id===doc.id));
 // The owner may adjust the proposed role list while reviewing the release.
 s=state(await call({...release,approvalConfirmed:true,approved_by:'Forged approval',roleTrainingRequired:true,trainingRoleIds:[a.id],roleTrainingDueDays:5}));
 const approved=s.revisions.find(r=>r.id===draft.id);assert.equal(approved.status,'released');assert.equal(approved.approved_by,'Release Approver');assert(approved.approved_at);assert.equal(approved.approved_at,approved.released_at);
 const needs=s.trainingNeeds.filter(n=>n.document_id===doc.id);assert.equal(needs.length,1);assert.equal(needs[0].role_id,a.id);assert.equal(needs[0].due_offset_days,5);
 const assignments=s.training.filter(t=>t.document_id===doc.id);assert.equal(assignments.length,1);assert.equal(assignments[0].member_id,first.id);assert.equal(assignments[0].start_date,initial.today);assert.equal(assignments[0].due_date,shift(initial.today,5));
 assert(s.audit.some(a=>a.action==='Revision released'&&a.detail.includes('Owner approved')&&a.actor==='Release Approver'));
 pass('only the owner can approve, the approval is recorded, and the confirmed roles create requirements and assignments atomically');

 assert.equal((await call({action:'acknowledge',trainingId:assignments[0].id,reviewed:true,understood:true},staffView)).status,400);
 state(await call({action:'view',trainingId:assignments[0].id},staffView));
 assert.equal((await call({action:'acknowledge',trainingId:assignments[0].id,reviewed:true,understood:false},staffView)).status,400);
 s=state(await call({action:'acknowledge',trainingId:assignments[0].id,reviewed:true,understood:true},staffView));const completed=s.training.find(t=>t.id===assignments[0].id);assert.equal(completed.status,'complete');assert(completed.acknowledged_at);assert.equal(s.revisions.find(r=>r.id===draft.id).release_role_plan,null);
 const print=await mf.dispatchFetch('https://workspace.test/print/'+draft.id,{headers:staffView});assert.equal(print.status,200);const page=(await print.text()).replace(/<!--.*?-->/g,'');assert(page.includes('Approved for release by Release Approver'));
 pass('staff must open the released revision and confirm both review and understanding; approval details appear on the controlled print copy');

 s=state(await call({action:'member',name:'Future educator',email:'future@example.test',job:'Educator',trainingRoleId:a.id,startDate:shift(initial.today,10)}));const future=s.members.find(m=>m.name==='Future educator'),futureTraining=s.training.find(t=>t.document_id===doc.id&&t.member_id===future.id);
 assert(futureTraining);assert.equal(futureTraining.start_date,shift(initial.today,10));assert.equal(futureTraining.due_date,shift(initial.today,15));
 for(let i=0;i<2;i++)state(await call());s=state(await call());assert.equal(s.training.filter(t=>t.revision_id===draft.id&&t.member_id===future.id).length,1);
 s=state(await call({action:'revision',documentId:doc.id,content:'Updated role procedure',changes:'Updated requirement'}));const revision=s.revisions.find(r=>r.document_id===doc.id&&r.status==='draft');assert.equal(s.training.find(t=>t.id===assignments[0].id).status,'complete');
 s=state(await call({...release,revisionId:revision.id,approvalConfirmed:true,roleTrainingRequired:true,trainingRoleIds:[a.id],roleTrainingDueDays:99}));
 assert.equal(s.trainingNeeds.filter(n=>n.document_id===doc.id).length,1);assert.equal(s.trainingNeeds.find(n=>n.document_id===doc.id).due_offset_days,5);
 assert.equal(s.training.find(t=>t.id===assignments[0].id).acknowledged_at,completed.acknowledged_at);
 const fresh=s.training.find(t=>t.revision_id===revision.id&&t.member_id===first.id);assert.equal(fresh.status,'pending');assert.equal(fresh.acknowledged_at,null);assert.equal(s.revisions.find(r=>r.id===draft.id).approved_at,approved.approved_at);
 pass('future hires receive the released requirement and new revisions retain earlier approvals and completions while requiring fresh acknowledgement');

 const media=new FormData();for(const [key,value] of Object.entries({...base,title:'Role video',code:'ROLE-VIDEO-001',category:'Training media',content:'',trainingRoleIds:JSON.stringify([b.id]),roleTrainingDueDays:2}))media.set(key,String(value));media.set('file',new Blob([Uint8Array.from([0,0,0,20,102,116,121,112])],{type:'video/mp4'}),'training.mp4');
 s=state(await call(media));const video=s.documents.find(d=>d.code==='ROLE-VIDEO-001'),videoRevision=s.revisions.find(r=>r.document_id===video.id);
 const concurrent=await Promise.all([call({...release,revisionId:videoRevision.id,approvalConfirmed:true}),call({...release,revisionId:videoRevision.id,approvalConfirmed:true})]);assert(concurrent.some(r=>r.status===200));assert(concurrent.every(r=>[200,400].includes(r.status)));
 s=state(await call());assert.equal(s.trainingNeeds.filter(n=>n.document_id===video.id).length,1);assert.equal(s.training.filter(t=>t.document_id===video.id).length,1);assert.equal(s.training.find(t=>t.document_id===video.id).member_id,second.id);assert.equal(s.audit.filter(a=>a.action==='Revision released'&&a.detail.includes('Role video')).length,1);
 s=state(await call({...base,title:'Optional regional reference',code:'ROLE-OPTIONAL-001',category:'Regional',roleTrainingRequired:false,trainingRoleIds:[]}));const optional=s.documents.find(d=>d.code==='ROLE-OPTIONAL-001'),optionalRevision=s.revisions.find(r=>r.document_id===optional.id);
 s=state(await call({...release,revisionId:optionalRevision.id,approvalConfirmed:true,memberIds:[unselected.id]}));assert(!s.trainingNeeds.some(n=>n.document_id===optional.id));assert.equal(s.training.filter(t=>t.document_id===optional.id).length,1);assert.equal(s.training.find(t=>t.document_id===optional.id).member_id,unselected.id);
 assert.equal(s.business.reminder_enabled,initial.business.reminder_enabled);assert.equal(s.business.reminder_every_days,initial.business.reminder_every_days);
 pass('media uses the same approval workflow, concurrent releases do not duplicate work, and No keeps role plans unchanged while allowing optional staff assignments');
 console.log('All document release and role checks passed.');
}finally{await mf.dispose();}
