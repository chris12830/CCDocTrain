import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Run against the built Worker with isolated D1/R2, never a published business.
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(root+'/package.json');
const mfRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=await import(mfRequire.resolve('miniflare'));
const modules=fs.readdirSync(root+'/dist/server',{recursive:true})
 .filter(f=>f.endsWith('.js'))
 .sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0)
 .map(f=>({type:'ESModule',path:root+'/dist/server/'+f}));
const mf=new Miniflare({modules,modulesRoot:root+'/dist/server',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs'],fallthrough:true}]});
const owner={'oai-authenticated-user-id':'role-media-owner','oai-authenticated-user-email':'owner@example.test'};
const otherOwner={'oai-authenticated-user-id':'other-role-media-owner','oai-authenticated-user-email':'other@example.test'};
async function call(body,headers=owner){
 const response=await mf.dispatchFetch('https://workspace.test/api/workspace',{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 return {status:response.status,...await response.json()};
}
function pass(description){console.log('PASS '+description);}
function shift(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
try{
 const database=await mf.getD1Database('DB');
 for(const name of fs.readdirSync(root+'/drizzle').filter(f=>f.endsWith('.sql')).sort()){
  for(const sql of fs.readFileSync(root+'/drizzle/'+name,'utf8').split('--> statement-breakpoint'))if(sql.trim())await database.prepare(sql.trim()).run();
 }
 assert.equal((await call(undefined,{})).status,401);
 const initial=await call();assert.equal(initial.status,200);
 const foreign=await call(undefined,otherOwner);assert.equal(foreign.status,200);
 const staff=initial.members.find(m=>m.role==='staff');
 const staffView={...owner,'x-staff-preview':staff.id};
 const roleSave=await call({action:'trainingRole',name:'Multiple media role',description:'Integration fixture'});assert.equal(roleSave.status,200);
 const role=roleSave.state.trainingRoles.find(r=>r.name==='Multiple media role');
 async function createDocument(code,{release=true,access='view_print'}={}){
  const saved=await call({action:'document',title:'Shared title',code,category:'Training media',staffAccess:access,content:'Review this controlled item.',changes:'Initial release'});
  assert.equal(saved.status,200,saved.error);
  const doc=saved.state.documents.find(d=>d.code===code),revision=saved.state.revisions.find(r=>r.document_id===doc.id);
  if(release){const released=await call({action:'release',revisionId:revision.id,memberIds:[],startDate:initial.today,dueDate:initial.today});assert.equal(released.status,200,released.error);}
  return doc;
 }
 const a=await createDocument('ROLE-A'),b=await createDocument('ROLE-B');
 const draft=await createDocument('ROLE-DRAFT',{release:false});
 const hidden=await createDocument('ROLE-HIDDEN',{access:'not_viewable'});
 const archived=await createDocument('ROLE-ARCHIVED');
 await database.prepare('UPDATE documents SET archived=1 WHERE id=?').bind(archived.id).run();
 const selection={action:'trainingNeed',roleId:role.id,kind:'document',documentIds:[a.id,a.id,b.id],startOffsetDays:0,dueOffsetDays:5};
 let response=await call(selection);assert.equal(response.status,200,response.error);
 let needs=response.state.trainingNeeds.filter(n=>n.role_id===role.id);
 assert.equal(needs.length,2);assert.deepEqual(new Set(needs.map(n=>n.document_id)),new Set([a.id,b.id]));
 assert(needs.every(n=>n.start_offset_days===0&&n.due_offset_days===5));
 pass('one bulk save creates separate requirements, including distinct items with the same title');

 response=await call({action:'staffTrainingProfile',memberId:staff.id,trainingRoleId:role.id,startDate:initial.today});assert.equal(response.status,200,response.error);
 const tasks=response.state.training.filter(t=>t.member_id===staff.id&&[a.id,b.id].includes(t.document_id));
 assert.equal(tasks.length,2);assert(tasks.every(t=>t.role_need_id&&t.start_date===initial.today&&t.due_date===shift(initial.today,5)));
 pass('all selected media apply to assigned staff with a common schedule');

 assert.equal((await call({action:'view',trainingId:tasks[0].id},staffView)).status,200);
 response=await call({action:'acknowledge',trainingId:tasks[0].id,reviewed:true,understood:true},staffView);assert.equal(response.status,200,response.error);
 const acknowledged=response.state.training.find(t=>t.id===tasks[0].id).acknowledged_at;assert(acknowledged);
 response=await call({...selection,startOffsetDays:3,dueOffsetDays:9});assert.equal(response.status,200,response.error);
 needs=response.state.trainingNeeds.filter(n=>n.role_id===role.id);assert.equal(needs.length,2);
 assert(needs.every(n=>n.start_offset_days===0&&n.due_offset_days===5));
 assert.equal(response.state.training.find(t=>t.id===tasks[0].id).acknowledged_at,acknowledged);
 assert.equal(response.state.training.find(t=>t.id===tasks[0].id).status,'complete');
 pass('retrying a selection preserves existing requirements, schedules, and completed acknowledgements');

 const fresh=await createDocument('ROLE-FRESH');
 for(const invalid of [foreign.documents.find(d=>d.current_revision_id).id,draft.id,hidden.id,archived.id,'missing-item']){
  const rejected=await call({...selection,documentIds:[fresh.id,invalid]});assert.equal(rejected.status,400);
  const current=await call();assert(!current.trainingNeeds.some(n=>n.role_id===role.id&&n.document_id===fresh.id));
 }
 pass('a foreign, draft, hidden, archived, or missing item rejects the whole selection without partial saves');
 for(const invalid of [[],[123],[''],Array(201).fill(a.id),'not-an-array'])assert.equal((await call({...selection,documentIds:invalid})).status,400);
 assert.equal((await call({...selection,startOffsetDays:10,dueOffsetDays:2})).status,400);
 assert.equal((await call({...selection,roleId:foreign.trainingRoles[0]?.id||'foreign-role'})).status,400);
 assert.equal((await call(selection,staffView)).status,403);
 pass('empty or malformed selections, invalid schedules, foreign roles, and staff writes are blocked');

 const concurrent=await Promise.all([call({...selection,documentIds:[fresh.id]}),call({...selection,documentIds:[fresh.id]})]);assert(concurrent.every(r=>r.status===200));
 const current=await call();assert.equal(current.trainingNeeds.filter(n=>n.role_id===role.id&&n.document_id===fresh.id).length,1);
 assert.equal(current.training.filter(t=>t.member_id===staff.id&&t.document_id===fresh.id).length,1);
 pass('concurrent saves create one requirement and one staff assignment per item');

 const bNeed=current.trainingNeeds.find(n=>n.role_id===role.id&&n.document_id===b.id);
 response=await call({action:'trainingNeed',needId:bNeed.id,roleId:role.id,kind:'document',documentId:b.id,startOffsetDays:1,dueOffsetDays:3});assert.equal(response.status,200,response.error);
 assert.equal(response.state.trainingNeeds.find(n=>n.id===bNeed.id).due_offset_days,3);
 assert.equal(response.state.training.find(t=>t.id===tasks[0].id).acknowledged_at,acknowledged);
 assert.equal((await call({...selection,needId:bNeed.id})).status,400);
 pass('existing requirements remain individually editable without disturbing other completion records');

 response=await call({action:'trainingNeed',roleId:role.id,kind:'certification',title:'QA qualification',startOffsetDays:0,dueOffsetDays:7,renewalLeadDays:30});assert.equal(response.status,200,response.error);
 assert(response.state.requiredCertifications.some(n=>n.member_id===staff.id&&n.title==='QA qualification'&&n.renewal_lead_days===30));
 const futureStaff=initial.members.find(m=>m.role==='staff'&&m.id!==staff.id);
 response=await call({action:'staffTrainingProfile',memberId:futureStaff.id,trainingRoleId:role.id,startDate:shift(initial.today,2)});assert.equal(response.status,200,response.error);
 const futureTasks=response.state.training.filter(t=>t.member_id===futureStaff.id&&[a.id,b.id,fresh.id].includes(t.document_id));assert.equal(futureTasks.length,3);
 assert(futureTasks.every(t=>t.start_date>=shift(initial.today,2)));
 assert.equal(response.state.business.reminder_enabled,initial.business.reminder_enabled);
 assert.equal(response.state.business.reminder_every_days,initial.business.reminder_every_days);
 pass('certifications, new staff onboarding, and existing reminder settings remain intact');

 const visible=await call(undefined,staffView);assert.equal(visible.trainingNeeds.length,0);assert(visible.training.every(t=>t.member_id===staff.id));
 pass('staff receive their own assignments without owner role-management data');

 // Exercise repeats through real saved requirements and acknowledgement APIs.
 const repeatRoleSave=await call({action:'trainingRole',name:'Repeat role'});assert.equal(repeatRoleSave.status,200);
 const repeatRole=repeatRoleSave.state.trainingRoles.find(r=>r.name==='Repeat role');
 const repeatDoc=await createDocument('ROLE-REPEAT');
 const repeatPlan={action:'trainingNeed',roleId:repeatRole.id,kind:'document',documentIds:[repeatDoc.id],startOffsetDays:0,dueOffsetDays:5,repeatEveryMonths:1};
 response=await call(repeatPlan);assert.equal(response.status,200,response.error);
 const repeatNeed=response.state.trainingNeeds.find(n=>n.role_id===repeatRole.id&&n.document_id===repeatDoc.id);assert.equal(repeatNeed.repeat_every_months,1);
 response=await call({action:'staffTrainingProfile',memberId:staff.id,trainingRoleId:repeatRole.id,startDate:initial.today});assert.equal(response.status,200);
 const first=response.state.training.find(t=>t.document_id===repeatDoc.id&&t.member_id===staff.id);
 assert.equal(response.state.training.filter(t=>t.document_id===repeatDoc.id&&t.member_id===staff.id).length,1);
 // A valid past completion ending January exercises real calendar month bounds.
 await database.prepare("UPDATE revisions SET released_at='2024-01-01T17:00:00Z' WHERE id=?").bind(first.revision_id).run();
 await database.prepare("UPDATE training SET status='complete',start_date='2024-01-01',due_date='2024-01-06',viewed_at='2024-01-31T17:00:00Z',acknowledged_at='2024-01-31T17:00:00Z',acknowledged_by='fixture' WHERE id=?").bind(first.id).run();
 response=await call();
 let repeated=response.training.find(t=>t.document_id===repeatDoc.id&&t.member_id===staff.id&&t.cycle_key);
 assert.equal(repeated.start_date,'2024-02-29');assert.equal(repeated.due_date,'2024-03-05');
 assert.equal(repeated.viewed_at,null);assert.equal(repeated.acknowledged_at,null);
 const repeatedId=repeated.id;
 for(let i=0;i<2;i++)await call();
 assert.equal((await call()).training.filter(t=>t.member_id===staff.id&&t.document_id===repeatDoc.id&&t.status==='pending').length,1);
 pass('month-end repeats clamp to leap day and create one fresh acknowledgement requirement');

 let check=await mf.dispatchFetch('https://workspace.test/api/reminders/run',{method:'POST',headers:owner});assert.equal(check.status,200);
 let staffAlerts=await call(undefined,staffView);assert(staffAlerts.reminders.some(r=>r.source_id===repeatedId&&r.kind==='training'));
 assert.equal((await call({action:'acknowledge',trainingId:repeatedId,reviewed:true,understood:true},staffView)).status,400);
 assert.equal((await call({action:'view',trainingId:repeatedId},staffView)).status,200);
 response=await call({action:'acknowledge',trainingId:repeatedId,reviewed:true,understood:true},staffView);assert.equal(response.status,200,response.error);
 assert(!response.state.reminders.some(r=>r.source_id===repeatedId));
 assert.equal(response.state.training.find(t=>t.id===first.id).acknowledged_at,'2024-01-31T17:00:00Z');
 const justCompleted=response.state.training.find(t=>t.id===repeatedId);
 const acknowledgementDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(justCompleted.acknowledged_at));
 const addMonths=(day,count)=>{const [y,m,d]=day.split('-').map(Number),target=new Date(Date.UTC(y,m-1+count,1,12)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0,12)).getUTCDate();target.setUTCDate(Math.min(d,last));return target.toISOString().slice(0,10);};
 repeated=response.state.training.find(t=>t.member_id===staff.id&&t.document_id===repeatDoc.id&&t.status==='pending');assert.equal(repeated.start_date,addMonths(acknowledgementDate,1));
 check=await mf.dispatchFetch('https://workspace.test/api/reminders/run',{method:'POST',headers:owner});assert.equal(check.status,200);
 staffAlerts=await call(undefined,staffView);assert(!staffAlerts.reminders.some(r=>r.source_id===repeated.id));
 pass('repeat reminders require a new review, stop on acknowledgement, and skip the next future cycle');

 const editRepeat={action:'trainingNeed',needId:repeatNeed.id,roleId:repeatRole.id,kind:'document',documentId:repeatDoc.id,startOffsetDays:0,dueOffsetDays:5};
 for(const months of [3,6,12,24]){
  response=await call({...editRepeat,repeatEveryMonths:months});assert.equal(response.status,200,response.error);
  const next=response.state.training.filter(t=>t.member_id===staff.id&&t.document_id===repeatDoc.id&&t.status==='pending');assert.equal(next.length,1);assert.equal(next[0].start_date,addMonths(acknowledgementDate,months));
 }
 for(const invalid of [-1,1.5,121,'',null])assert.equal((await call({...editRepeat,repeatEveryMonths:invalid})).status,400);
 response=await call({...editRepeat,repeatEveryMonths:0});assert.equal(response.status,200);
 assert(!response.state.training.some(t=>t.member_id===staff.id&&t.document_id===repeatDoc.id&&t.status==='pending'));
 assert.equal(response.state.training.filter(t=>t.member_id===staff.id&&t.document_id===repeatDoc.id&&t.status==='complete').length,2);
 response=await call({...editRepeat,repeatEveryMonths:1});assert.equal(response.status,200);
 assert.equal(response.state.training.filter(t=>t.member_id===staff.id&&t.document_id===repeatDoc.id&&t.status==='pending').length,1);
 pass('custom, twice-yearly, yearly, and two-year frequencies reschedule safely; disabling repeats retains history');

 response=await call({action:'revision',documentId:repeatDoc.id,content:'Updated repeating policy',changes:'New controlled revision'});assert.equal(response.status,200);
 const newRevision=response.state.revisions.find(r=>r.document_id===repeatDoc.id&&r.status==='draft');
 response=await call({action:'release',revisionId:newRevision.id,memberIds:[],startDate:initial.today,dueDate:initial.today});assert.equal(response.status,200);
 assert(response.state.training.filter(t=>t.member_id===staff.id&&t.document_id===repeatDoc.id&&t.revision_id===first.revision_id).every(t=>t.status==='complete'||t.status==='superseded'));
 assert.equal(response.state.training.filter(t=>t.member_id===staff.id&&t.revision_id===newRevision.id&&t.status==='pending').length,1);
 pass('new revisions replace open repeat assignments and retain all earlier completions');

 response=await call({action:'trainingNeed',roleId:repeatRole.id,kind:'certification',title:'Monthly QA qualification',startOffsetDays:0,dueOffsetDays:5,repeatEveryMonths:1,renewalLeadDays:30});assert.equal(response.status,200);
 const qualification=response.state.trainingNeeds.find(n=>n.role_id===repeatRole.id&&n.title==='Monthly QA qualification');
 async function submitPhoto(issued,replacesId){
  const form=new FormData();
  for(const [key,value] of Object.entries({action:'staffCertificate',needId:qualification.id,issuer:'QA provider',issuedAt:issued,expiresAt:shift(initial.today,730),confirmed:'true',requestId:crypto.randomUUID(),...(replacesId?{replacesId}:{})}))form.set(key,value);
  form.set('file',new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0])],{type:'image/png'}),'certificate.png');
  const encoded=new Request('https://workspace.test/api/workspace',{method:'POST',headers:staffView,body:form});
  const saved=await mf.dispatchFetch(encoded.url,{method:'POST',headers:Object.fromEntries(encoded.headers),body:new Uint8Array(await encoded.arrayBuffer())});return {status:saved.status,...await saved.json()};
 }
 assert.equal((await submitPhoto(shift(initial.today,-45))).status,400);
 response=await submitPhoto(initial.today);assert.equal(response.status,200,response.error);
 let certRequirement=response.state.requiredCertifications.find(n=>n.need_id===qualification.id);assert.equal(certRequirement.status,'Current');assert.equal(certRequirement.due_date,addMonths(initial.today,1));
 const oldCertificate=certRequirement.certification_id;
 await database.prepare('UPDATE certifications SET issued_at=? WHERE id=?').bind(addMonths(initial.today,-2),oldCertificate).run();
 response=await call(undefined,staffView);certRequirement=response.requiredCertifications.find(n=>n.need_id===qualification.id);assert.equal(certRequirement.status,'Overdue');
 assert.equal((await submitPhoto(addMonths(initial.today,-2),oldCertificate)).status,400);
 response=await submitPhoto(initial.today,oldCertificate);assert.equal(response.status,200,response.error);
 assert.equal(response.state.requiredCertifications.find(n=>n.need_id===qualification.id).status,'Current');assert.equal(response.state.certifications.find(c=>c.id===oldCertificate).superseded,1);
 pass('certification repeats become due before expiry, require a newer photo, and retain certificate history');
 console.log('All role media checks passed.');
}finally{await mf.dispose();}
