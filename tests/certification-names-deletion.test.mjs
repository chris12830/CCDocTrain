import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Built Worker integration with isolated D1/R2. No published records are changed.
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(root+'/package.json');
const mfRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=await import(mfRequire.resolve('miniflare'));
const modules=fs.readdirSync(root+'/dist/server',{recursive:true}).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(f=>({type:'ESModule',path:root+'/dist/server/'+f}));
const mf=new Miniflare({modules,modulesRoot:root+'/dist/server',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs'],fallthrough:true}]});
const owner={'oai-authenticated-user-id':'catalog-deletion-owner','oai-authenticated-user-email':'owner@example.test'};
const otherOwner={'oai-authenticated-user-id':'catalog-deletion-other-owner','oai-authenticated-user-email':'other@example.test'};
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDwAAAABJRU5ErkJggg==','base64'));
async function call(body,headers=owner){
 let init={method:body?'POST':'GET',headers};
 if(body instanceof FormData){const encoded=new Request('https://workspace.test/api/workspace',{...init,body});init={method:'POST',headers:Object.fromEntries(encoded.headers),body:new Uint8Array(await encoded.arrayBuffer())};}
 else if(body)init={...init,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)};
 const response=await mf.dispatchFetch('https://workspace.test/api/workspace',init);
 return {status:response.status,...await response.json()};
}
function pass(message){console.log('PASS '+message);}
function success(r){assert.equal(r.status,200,r.error);return r.state||r;}
function form(fields,file){const f=new FormData();for(const [key,value] of Object.entries(fields))f.set(key,String(value));if(file)f.set('file',new Blob([file],{type:'image/png'}),'proof.png');return f;}
function dayShift(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
try{
 const database=await mf.getD1Database('DB');
 for(const name of fs.readdirSync(root+'/drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync(root+'/drizzle/'+name,'utf8').split('--> statement-breakpoint'))if(sql.trim())await database.prepare(sql.trim()).run();
 const initial=success(await call()),foreign=success(await call(undefined,otherOwner)),staff=initial.members.find(m=>m.role==='staff'),otherStaff=initial.members.find(m=>m.role==='staff'&&m.id!==staff.id),staffView={...owner,'x-staff-preview':staff.id};
 const roleState=success(await call({action:'trainingRole',name:'Catalog QA role'})),role=roleState.trainingRoles.find(r=>r.name==='Catalog QA role');
 success(await call({action:'staffTrainingProfile',memberId:staff.id,trainingRoleId:role.id,startDate:initial.today}));
 let s=success(await call({action:'trainingNeed',roleId:role.id,kind:'certification',title:'QA Child Care First Aid',startOffsetDays:0,dueOffsetDays:7,renewalLeadDays:30}));
 const need=s.trainingNeeds.find(n=>n.role_id===role.id&&n.kind==='certification');
 s=success(await call({action:'certification',memberId:staff.id,title:need.title,issuer:'QA provider',issuedAt:initial.today,expiresAt:dayShift(initial.today,730),reminderDays:30}));
 const metadata=s.certifications.find(c=>c.member_id===staff.id&&c.title===need.title);
 assert.equal(s.requiredCertifications.find(n=>n.need_id===need.id).status,'Photo required');
 const photoFields={action:'staffCertificate',needId:need.id,replacesId:metadata.id,issuer:'QA provider',issuedAt:initial.today,expiresAt:dayShift(initial.today,730),confirmed:true,requestId:crypto.randomUUID()};
 s=success(await call(form(photoFields,png),staffView));
 const proof=s.certifications.find(c=>c.submission_id===photoFields.requestId);
 assert.equal(s.requiredCertifications.find(n=>n.need_id===need.id).status,'Current');
 pass('legacy owner metadata stays open until staff supply a certificate photo');

 s=success(await call({action:'certificationType',name:' QA  Child Care First Aid ',description:'First aid qualification for child care staff.'}));
 const type=s.certificationTypes.find(t=>t.name==='QA Child Care First Aid');assert(type);
 assert.equal(s.trainingNeeds.find(n=>n.id===need.id).certification_type_id,type.id);
 for(const c of s.certifications.filter(c=>[metadata.id,proof.id].includes(c.id))){assert.equal(c.certification_type_id,type.id);assert.equal(c.title,need.title);}
 assert.equal(s.certifications.find(c=>c.id===proof.id).photo_submitted_at,proof.photo_submitted_at);
 assert.equal(s.certifications.find(c=>c.id===metadata.id).superseded,1);
 pass('creating a name adopts matching legacy requirements and certificates without changing proof or history');

 assert.equal((await call({action:'certificationType',name:'qa child care first aid',description:'Duplicate'})).status,409);
 for(const body of [{name:'  '},{name:'x'.repeat(301)},{name:'Too much description',description:'x'.repeat(3001)}])assert.equal((await call({action:'certificationType',...body})).status,400);
 assert.equal((await call({action:'certificationType',name:'Staff-created'},staffView)).status,403);
 assert.equal((await call({action:'certificationType',certificationTypeId:type.id,name:'Staff rename'},staffView)).status,403);
 assert.equal((await call({action:'certificationType',certificationTypeId:type.id,name:'Foreign rename'},otherOwner)).status,404);
 const foreignTypeState=success(await call({action:'certificationType',name:'Foreign catalog entry',description:'Private business description'},otherOwner));
 const foreignType=foreignTypeState.certificationTypes.find(t=>t.name==='Foreign catalog entry');
 assert.equal((await call({action:'trainingNeed',roleId:role.id,kind:'certification',certificationTypeId:foreignType.id,startOffsetDays:0,dueOffsetDays:7,renewalLeadDays:30})).status,400);
 pass('catalog validation, duplicates, staff permissions, and business boundaries are enforced');

 s=success(await call({action:'certificationType',name:'Unassigned owner qualification',description:'Owner catalog only'}));
 const unassigned=s.certificationTypes.find(t=>t.name==='Unassigned owner qualification');
 s=success(await call({action:'certificationType',certificationTypeId:type.id,name:'QA Child Care First Aid — revised name',description:'Updated qualification description.'}));
 let requirement=s.requiredCertifications.find(n=>n.need_id===need.id&&n.member_id===staff.id);
 assert.equal(requirement.title,'QA Child Care First Aid — revised name');assert.equal(requirement.description,'Updated qualification description.');assert.equal(requirement.status,'Current');assert.equal(requirement.certification_id,proof.id);
 assert.equal(s.certifications.find(c=>c.id===proof.id).title,need.title);
 const renewFields={...photoFields,replacesId:proof.id,requestId:crypto.randomUUID()};
 s=success(await call(form(renewFields,png),staffView));const renewal=s.certifications.find(c=>c.submission_id===renewFields.requestId);
 assert.equal(renewal.certification_type_id,type.id);assert.equal(renewal.title,requirement.title);assert.equal(s.certifications.find(c=>c.id===proof.id).superseded,1);
 s=success(await call(form(renewFields,png),staffView));assert.equal(s.certifications.filter(c=>c.submission_id===renewFields.requestId).length,1);
 assert(!s.certificationTypes.some(t=>t.id===unassigned.id||t.id===foreignType.id));
 pass('renaming keeps existing proof valid and supports a renamed renewal with idempotent photo submission');

 s=success(await call({action:'scheduleCertification',certificationTypeId:type.id,title:'Untrusted title',memberIds:[staff.id,otherStaff.id],startDate:initial.today,dueDate:dayShift(initial.today,5),renewalLeadDays:30}));
 const course=s.trainingNeeds.find(n=>n.member_id===staff.id&&n.certification_type_id===type.id);
 assert.equal(course.title,requirement.title);assert.equal(s.requiredCertifications.find(n=>n.need_id===course.id).status,'Current');
 s=success(await call({action:'trainingNeed',roleId:role.id,kind:'certification',certificationTypeId:unassigned.id,title:'Untrusted title',startOffsetDays:0,dueOffsetDays:7,renewalLeadDays:30}));
 assert.equal(s.trainingNeeds.find(n=>n.certification_type_id===unassigned.id).title,unassigned.name);
 s=success(await call({action:'certification',memberId:otherStaff.id,certificationTypeId:type.id,issuer:'QA provider',issuedAt:initial.today,expiresAt:dayShift(initial.today,730),reminderDays:30}));
 assert(s.certifications.some(c=>c.member_id===otherStaff.id&&c.certification_type_id===type.id&&c.title===requirement.title));
 assert.equal(s.requiredCertifications.find(n=>n.member_id===otherStaff.id&&n.certification_type_id===type.id).status,'Photo required');
 assert.equal((await call({action:'certification',memberId:staff.id,replacesId:renewal.id,certificationTypeId:unassigned.id,issuer:'QA provider',issuedAt:initial.today,expiresAt:dayShift(initial.today,730),reminderDays:30})).status,400);
 pass('role plans, scheduled courses, and certificate records use the selected identity and canonical name');

 async function createDocument(code,file=false){
  const fields={action:'document',title:'Deletion QA '+code,code,category:file?'Training media':'Business policies',staffAccess:'view_print',content:'Controlled review content',changes:'Initial QA version'};
  const state=success(await call(file?form(fields,png):fields));const doc=state.documents.find(d=>d.code===code),revision=state.revisions.find(r=>r.document_id===doc.id);return {doc,revision};
 }
 // Categories must come from the existing app vocabulary, not a test-only option.
 const fixture=await createDocument('DELETE-MEDIA',true);
 s=success(await call({action:'release',revisionId:fixture.revision.id,memberIds:[staff.id,otherStaff.id],startDate:initial.today,dueDate:initial.today}));
 const completed=s.training.find(t=>t.document_id===fixture.doc.id&&t.member_id===staff.id);
 success(await call({action:'view',trainingId:completed.id},staffView));
 s=success(await call({action:'acknowledge',trainingId:completed.id,reviewed:true,understood:true},staffView));
 const acknowledgement=s.training.find(t=>t.id===completed.id).acknowledged_at;
 s=success(await call({action:'revision',documentId:fixture.doc.id,content:'Revised controlled review',changes:'A new revision before deletion'}));
 const next=s.revisions.find(r=>r.document_id===fixture.doc.id&&r.status==='draft');assert.equal(next.version,2);
 s=success(await call({action:'release',revisionId:next.id,memberIds:[staff.id,otherStaff.id],startDate:initial.today,dueDate:initial.today}));
 s=success(await call({action:'trainingNeed',roleId:role.id,kind:'document',documentIds:[fixture.doc.id],startOffsetDays:0,dueOffsetDays:0,repeatEveryMonths:1}));
 const documentNeed=s.trainingNeeds.find(n=>n.document_id===fixture.doc.id);
 const pending=s.training.find(t=>t.document_id===fixture.doc.id&&t.member_id===staff.id&&t.status==='pending');assert(pending);
 let run=await mf.dispatchFetch('https://workspace.test/api/reminders/run',{method:'POST',headers:owner});assert.equal(run.status,200);
 assert(success(await call(undefined,staffView)).reminders.some(r=>r.source_id===pending.id));
 pass('new revisions preserve acknowledgements and create fresh controlled training and reminders');

 for(const reason of ['', '   ', 'x'.repeat(2001)])assert.equal((await call({action:'deleteDocument',documentId:fixture.doc.id,reason})).status,400);
 assert.equal((await call({action:'deleteDocument',documentId:fixture.doc.id,reason:'Staff deletion'},staffView)).status,403);
 assert.equal((await call({action:'deleteDocument',documentId:foreign.documents[0].id,reason:'Foreign deletion'})).status,404);
 const deletion={action:'deleteDocument',documentId:fixture.doc.id,reason:'Replaced by a consolidated policy.'};
 const parallel=await Promise.all([call(deletion),call(deletion)]);parallel.forEach(success);
 s=success(await call());const deleted=s.documents.find(d=>d.id===fixture.doc.id);
 assert(deleted.deleted_at);assert(deleted.deleted_by);assert.equal(deleted.deletion_reason,deletion.reason);assert.equal(deleted.archived,1);assert.equal(deleted.staff_access,'not_viewable');
 assert.equal(s.audit.filter(a=>a.action==='Document / media deleted'&&a.detail.includes(fixture.doc.code)).length,1);
 assert(s.audit.some(a=>a.action==='Document / media deleted'&&a.detail.includes(deletion.reason)));
 assert.equal(s.training.find(t=>t.id===completed.id).status,'complete');assert.equal(s.training.find(t=>t.id===completed.id).acknowledged_at,acknowledgement);
 assert(s.training.filter(t=>t.document_id===fixture.doc.id).every(t=>['complete','superseded'].includes(t.status)));
 assert(!s.trainingNeeds.some(n=>n.id===documentNeed.id));
 const removedNeed=await database.prepare('SELECT active FROM training_needs WHERE id=?').bind(documentNeed.id).first();assert.equal(removedNeed.active,0);
 success(await call(deletion));assert.equal((await call({...deletion,reason:'Changed reason'})).status,409);
 pass('reasoned deletion is owner-only, auditable, idempotent, and retains completed training while withdrawing open work');

 for(let i=0;i<2;i++)success(await call());
 const visible=success(await call(undefined,staffView));assert(!visible.documents.some(d=>d.id===fixture.doc.id));assert(!visible.revisions.some(r=>r.document_id===fixture.doc.id));assert(!visible.training.some(t=>t.document_id===fixture.doc.id));assert(!visible.reminders.some(r=>r.source_id===pending.id));
 for(const action of ['view','acknowledge','help'])assert.equal((await call({action,trainingId:pending.id,reviewed:true,understood:true,comment:'Question'},staffView)).status,403);
 for(const rid of [fixture.revision.id,next.id]){
  const denied=await mf.dispatchFetch('https://workspace.test/api/files/'+rid,{headers:staffView});assert.equal(denied.status,403);
  const printDenied=await mf.dispatchFetch('https://workspace.test/print/'+rid,{headers:staffView});assert.equal(printDenied.status,200);assert(!(await printDenied.text()).includes('Controlled review content'));
  const download=await mf.dispatchFetch('https://workspace.test/api/files/'+rid+'?download=1',{headers:owner});assert.equal(download.status,200);assert(download.headers.get('content-disposition').includes('DELETED_'));
 }
 const retained=await mf.dispatchFetch('https://workspace.test/api/files/'+fixture.revision.id,{headers:owner});assert.deepEqual(new Uint8Array(await retained.arrayBuffer()),png);
 const ownerPrint=await mf.dispatchFetch('https://workspace.test/print/'+next.id,{headers:owner});assert.equal(ownerPrint.status,200);const printed=await ownerPrint.text();assert(printed.includes(deletion.reason));assert(printed.includes('DELETED'));
 assert.equal((await call({action:'revision',documentId:fixture.doc.id,content:'Unavailable',changes:'New edit'})).status,404);
 assert.equal((await call({action:'documentAccess',documentId:fixture.doc.id,staffAccess:'view_print'})).status,410);
 assert.equal((await call({action:'assign',documentId:fixture.doc.id,memberIds:[staff.id],startDate:initial.today,dueDate:initial.today})).status,400);
 run=await mf.dispatchFetch('https://workspace.test/api/reminders/run',{method:'POST',headers:owner});assert.equal(run.status,200);
 assert(!success(await call(undefined,staffView)).reminders.some(r=>r.source_id===pending.id));
 s=success(await call());assert.equal(s.business.reminder_enabled,initial.business.reminder_enabled);assert.equal(s.business.reminder_every_days,initial.business.reminder_every_days);
 pass('deleted bytes and history stay owner-only, access cannot be restored, and reminder intervals remain unchanged');

 const draft=await createDocument('DELETE-DRAFT',true);success(await call({action:'deleteDocument',documentId:draft.doc.id,reason:'Uploaded in error.'}));
 assert.equal((await call({action:'release',revisionId:draft.revision.id,memberIds:[],startDate:initial.today,dueDate:initial.today})).status,404);
 pass('draft media can also be deleted and cannot subsequently be released');
 console.log('All certification catalog and deletion checks passed.');
}finally{await mf.dispose();}
