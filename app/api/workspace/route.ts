import {getChatGPTUser} from '@/app/chatgpt-auth';
import {AppError,context,owner,db,stmt,id,log,textField,dateField,upload,bucket,state} from '@/lib/store';
import {dateInZone,shiftDate,categories,canStaffView,certificationMatches,type StaffAccess} from '@/lib/model';
import {saveDocumentAccess,validStaffAccess,requirePreviewable} from '@/lib/document-access';
import {saveStaffRecord,completeStaffFollowUp} from '@/lib/staff-records';
import {sendStaffMessage,readStaffMessage} from '@/lib/staff-messages';
import {saveTrainingRole,saveTrainingProfile,saveTrainingNeed,removeTrainingNeed,scheduleCertification,validTrainingRole} from '@/lib/role-training';
import {submitCertificatePhoto} from '@/lib/staff-certificates';
import {saveReminderSettings,readReminder} from '@/lib/reminders';
import {saveCertificationType,resolveCertificationChoice} from '@/lib/certification-types';
import {deleteDocument} from '@/lib/document-deletion';
import {saveDocumentNumbering,checkDocumentNumbering,documentControlNumber} from '@/lib/document-numbering';
import {validateReleaseRolePlan,releaseRoleTrainingStatements} from '@/lib/document-release';
export const dynamic='force-dynamic';
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function failure(e:any){if(!(e instanceof AppError))console.error('Workspace operation failed',e);return json({error:e instanceof AppError?e.message:String(e?.message).includes('UNIQUE')?'This record already exists. Refresh and try again.':'The change could not be saved. Please try again.'},e instanceof AppError?e.status:500);}
export async function GET(request:Request){try{return json(await state(await context(request)));}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AppError('This request must come from your workspace.',403);
 let data:any,file:File|null=null;
 if((request.headers.get('content-type')||'').includes('multipart/form-data')){const form=await request.formData();data=Object.fromEntries(form);const entry=form.get('file');file=entry instanceof File?entry:null;}else data=await request.json();
 const action=data.action;if(action==='join')return await join(data);
 const ctx=await context(request),{business,actor,user}=ctx,b=business.id,now=new Date().toISOString(),today=dateInZone(business.timezone);
 if(action==='documentNumberingSettings'){
  await saveDocumentNumbering(ctx,data);
 }else if(action==='certificationType'){
  await saveCertificationType(ctx,data);
 }else if(action==='deleteDocument'){
  await deleteDocument(ctx,data);
 }else if(action==='staffCertificate'){
  await submitCertificatePhoto(ctx,data,file);
 }else if(action==='reminderSettings'){
  await saveReminderSettings(ctx,data);
 }else if(action==='readReminder'){
  await readReminder(ctx,data);
 }else if(action==='trainingRole'){
  await saveTrainingRole(ctx,data);
 }else if(action==='staffTrainingProfile'){
  await saveTrainingProfile(ctx,data);
 }else if(action==='trainingNeed'){
  await saveTrainingNeed(ctx,data);
 }else if(action==='removeTrainingNeed'){
  await removeTrainingNeed(ctx,data);
 }else if(action==='scheduleCertification'){
  await scheduleCertification(ctx,data);
 }else if(action==='sendStaffMessage'){
  await sendStaffMessage(ctx,data);
 }else if(action==='readStaffMessage'){
  await readStaffMessage(ctx,data);
 }else if(action==='staffRecord'){
  await saveStaffRecord(ctx,data);
 }else if(action==='staffFollowUp'){
  await completeStaffFollowUp(ctx,data);
 }else if(action==='documentAccess'){
  await saveDocumentAccess(ctx,data);
 }else if(action==='document'||action==='revision'){
  owner(ctx);let did=id(),version=1,title='',code='',systemNumber:string|null=null,category='',access:StaffAccess='view_print';
  if(action==='revision'){const doc=await stmt('SELECT * FROM documents WHERE id=? AND business_id=? AND archived=0',data.documentId,b).first<any>();if(!doc)throw new AppError('This document is unavailable.',404);if(await stmt('SELECT id FROM revisions WHERE document_id=? AND status=\'draft\'',doc.id).first())throw new AppError('Release the existing draft before adding another revision.');did=doc.id;title=doc.title;code=doc.code;access=doc.staff_access;version=Number((await stmt('SELECT MAX(version) AS n FROM revisions WHERE document_id=?',did).first<any>())?.n||0)+1;
  }else{checkDocumentNumbering(ctx,data);title=textField(data.title,'a document title');category=textField(data.category,'a category');if(!categories.includes(category))throw new AppError('Choose a document category.');access=data.staffAccess===undefined?access:validStaffAccess(data.staffAccess);}
  const content=typeof data.content==='string'?data.content.trim():'';if(content.length>100000)throw new AppError('Document text is too long. Upload a file instead.');if(!file?.size&&!content)throw new AppError('Upload a file or enter document text.');
  requirePreviewable(access,file?.size?file.type:null);
  const rolePlan=action==='document'?await validateReleaseRolePlan(ctx,data):null;if(rolePlan?.required&&!canStaffView(access))throw new AppError('Enable staff viewing before making this material required for job roles.');
  const changes=textField(data.changes,'a revision summary',2000),rid=id();
  if(action==='document'){const number=await documentControlNumber(ctx,data);code=number.code;systemNumber=number.systemNumber;}
  const u=await upload(file,b),ops=[];
  if(action==='document')ops.push(stmt('INSERT INTO documents (id,business_id,title,code,category,staff_access,created_at,system_control_number) VALUES (?,?,?,?,?,?,?,?)',did,b,title,code,category,access,now,systemNumber));
  ops.push(stmt('INSERT INTO revisions (id,business_id,document_id,version,status,file_key,filename,mime,content,changes,created_at,author,release_role_plan) VALUES (?,?,?,?,\'draft\',?,?,?,?,?,?,?,?)',rid,b,did,version,u.key,u.name,u.mime,content,changes,now,actor.name,rolePlan?JSON.stringify(rolePlan):null),log(b,actor,'Draft uploaded',`${code} · ${title} · Revision ${version}${rolePlan?.required?' · '+rolePlan.roleIds.length+' job-role requirements planned for release':''}`));
  try{await db().batch(ops);}catch(e){if(u.key)await bucket().delete(u.key);if(action==='document'&&String(e).includes('documents.business_id, documents.code'))throw new AppError('This control number is already used by your business. Enter a different number.',409);throw e;}
 }else if(action==='release'){
  owner(ctx);const r=await stmt('SELECT r.*,d.title,d.archived,d.staff_access FROM revisions r JOIN documents d ON d.id=r.document_id WHERE r.id=? AND r.business_id=?',data.revisionId,b).first<any>();if(!r||r.archived)throw new AppError('This revision is unavailable.',404);if(r.status!=='draft')throw new AppError('Only a draft can be released.');
  const rolePlan=await validateReleaseRolePlan(ctx,data,r.release_role_plan);
  if((rolePlan||data.approvalConfirmed!==undefined)&&data.approvalConfirmed!==true)throw new AppError('Confirm that you reviewed this revision and approve it for release.');
  const assign=await selectedStaff(data.memberIds,b),start=dateField(data.startDate,'a training start date'),due=dateField(data.dueDate,'a training due date');if(due<start)throw new AppError('The due date must be on or after the start date.');if((assign.length||rolePlan?.required)&&!canStaffView(r.staff_access))throw new AppError('This item is Not viewable. Enable staff viewing before assigning role or staff training.');
  await db().batch([
   ...releaseRoleTrainingStatements(b,r,rolePlan,now),
   stmt('INSERT INTO audit (id,business_id,actor,actor_id,action,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM revisions WHERE id=? AND business_id=? AND status=\'draft\')',id(),b,actor.name,actor.user_id||actor.id,'Revision released',`${r.title} · Revision ${r.version} · Owner approved · ${assign.length} individually selected staff${rolePlan?.required?' · Added to '+rolePlan.roleIds.length+' job-role plans with review and understanding required':''}`,now,r.id,b),
   stmt('UPDATE documents SET current_revision_id=? WHERE id=? AND business_id=? AND EXISTS (SELECT 1 FROM revisions WHERE id=? AND status=\'draft\')',r.id,r.document_id,b,r.id),
   stmt('UPDATE revisions SET status=\'superseded\' WHERE document_id=? AND status=\'released\' AND id<>? AND EXISTS (SELECT 1 FROM revisions WHERE id=? AND status=\'draft\')',r.document_id,r.id,r.id),
   stmt('UPDATE training SET status=\'superseded\' WHERE document_id=? AND status IN (\'pending\',\'help\') AND revision_id<>? AND EXISTS (SELECT 1 FROM revisions WHERE id=? AND status=\'draft\')',r.document_id,r.id,r.id),
   stmt('UPDATE revisions SET status=\'released\',released_at=?,approved_by=?,approved_at=?,release_role_plan=? WHERE id=? AND status=\'draft\'',now,actor.name,now,rolePlan?JSON.stringify(rolePlan):null,r.id),...assign.map(m=>assignment(b,r.document_id,r.id,m,start,due,now))
  ]);
 }else if(action==='assign'){
  owner(ctx);const d=await stmt('SELECT * FROM documents WHERE id=? AND business_id=? AND archived=0 AND current_revision_id IS NOT NULL',data.documentId,b).first<any>();if(!d)throw new AppError('Release a document before assigning training.');if(!canStaffView(d.staff_access))throw new AppError('This item is Not viewable. Enable staff viewing before assigning training.');const selected=await selectedStaff(data.memberIds,b);if(!selected.length)throw new AppError('Select at least one staff member.');const start=dateField(data.startDate,'a start date'),due=dateField(data.dueDate,'a due date');if(due<start)throw new AppError('The due date must be on or after the start date.');await db().batch([...selected.map(m=>assignment(b,d.id,d.current_revision_id,m,start,due,now)),log(b,actor,'Training assigned',`${d.title} · ${selected.length} staff selected; existing assignments preserved`)]);
 }else if(['view','acknowledge','help'].includes(action)){
  const t=await stmt('SELECT t.*,d.title,d.current_revision_id,d.archived,d.staff_access FROM training t JOIN documents d ON d.id=t.document_id WHERE t.id=? AND t.business_id=? AND t.member_id=?',data.trainingId,b,actor.id).first<any>();
  if(!t)throw new AppError('Only assigned staff may record their training.',403);if(!canStaffView(t.staff_access))throw new AppError('This item is unavailable for staff training.',403);if(t.archived||t.current_revision_id!==t.revision_id||t.status==='superseded')throw new AppError('This assignment was replaced. Review the current revision.',409);if(t.start_date>today)throw new AppError('This training has not started yet.');
  if(action==='view')await stmt('UPDATE training SET viewed_at=COALESCE(viewed_at,?) WHERE id=?',now,t.id).run();
  else if(action==='acknowledge'){
   if(t.status==='complete')return json({state:await state(ctx)});if(!t.viewed_at)throw new AppError('Open the document before acknowledging.');if(data.reviewed!==true||data.understood!==true)throw new AppError('Confirm that you have reviewed the document and understand how to use it.');
   await db().batch([stmt('UPDATE training SET status=\'complete\',acknowledged_at=?,acknowledged_by=? WHERE id=? AND status IN (\'pending\',\'help\') AND EXISTS (SELECT 1 FROM documents WHERE id=? AND current_revision_id=? AND archived=0 AND staff_access IN (\'view_only\',\'view_print\'))',now,ctx.member.id===actor.id?user.userId:`Owner example preview (${user.userId})`,t.id,t.document_id,t.revision_id),log(b,{...actor,user_id:user.userId},actor.sample?'Example acknowledgement':'Training acknowledged',`${actor.name} · ${t.title} · released revision ${t.revision_id}`)]);
  }else{if(t.status==='complete')throw new AppError('This training is already acknowledged.');const comment=textField(data.comment,'your question',2000);await db().batch([stmt('UPDATE training SET status=\'help\',comment=? WHERE id=?',comment,t.id),log(b,{...actor,user_id:user.userId},'Training support requested',`${actor.name} · ${t.title} · ${comment}`)]);}
 }else if(action==='remind'){
  owner(ctx);const ids=Array.isArray(data.trainingIds)?[...new Set(data.trainingIds)]:[];if(!ids.length||ids.length>200)throw new AppError('Select open training to remind.');const ops=[];for(const tid of ids){const t=await stmt('SELECT t.* FROM training t JOIN documents d ON d.id=t.document_id AND d.business_id=t.business_id WHERE t.id=? AND t.business_id=? AND t.status IN (\'pending\',\'help\') AND t.start_date<=? AND d.archived=0 AND d.staff_access IN (\'view_only\',\'view_print\')',tid,b,today).first<any>();if(t)ops.push(stmt('UPDATE training SET reminder_count=reminder_count+1,last_reminder=? WHERE id=?',now,t.id));}if(!ops.length)throw new AppError('These assignments are complete or have not started.');await db().batch([...ops,log(b,actor,'In-app reminders posted',`${ops.length} open training assignments; no email sent`)]);
 }else if(action==='certification'){
  owner(ctx);const mid=textField(data.memberId,'a staff member');await checkMember(mid,b);const issuer=textField(data.issuer,'an issuer'),issued=dateField(data.issuedAt,'an issue date'),expires=dateField(data.expiresAt,'an expiry date');if(expires<issued)throw new AppError('Expiry must be on or after the issue date.');const reminder=Number(data.reminderDays);if(!Number.isInteger(reminder)||reminder<1||reminder>365)throw new AppError('Reminder lead time must be 1–365 days.');
  let previous:any=null;if(data.replacesId){previous=await stmt('SELECT * FROM certifications WHERE id=? AND business_id=? AND member_id=? AND superseded=0',data.replacesId,b,mid).first();if(!previous)throw new AppError('The original certification is unavailable.');}
  const {title,typeId}=await resolveCertificationChoice(b,data,previous);if(previous&&!certificationMatches(previous,{title,certification_type_id:typeId}))throw new AppError('Choose the same certification when recording its renewal.');
  const u=await upload(file,b),cid=id(),ops=[stmt('INSERT INTO certifications (id,business_id,member_id,title,issuer,number,issued_at,expires_at,reminder_days,file_key,filename,mime,replaces_id,created_at,certification_type_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',cid,b,mid,title,issuer,typeof data.number==='string'?data.number.slice(0,100):'',issued,expires,reminder,u.key,u.name,u.mime,previous?.id||null,now,typeId)];if(previous)ops.push(stmt('UPDATE certifications SET superseded=1 WHERE id=?',previous.id));ops.push(log(b,actor,previous?'Certification renewed':'Certification added',`${title} · expires ${expires}`));try{await db().batch(ops);}catch(e){if(u.key)await bucket().delete(u.key);throw e;}
 }else if(action==='member'){
  owner(ctx);const name=textField(data.name,'a staff name'),email=textField(data.email,'an email',254).toLowerCase(),job=textField(data.job,'a job role'),start=data.startDate?dateField(data.startDate,'a first day of work'):today,trainingRole=await validTrainingRole(b,data.trainingRoleId);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter a valid email address.');const token=id()+id(),hash=await tokenHash(token),mid=id();await db().batch([stmt('INSERT INTO members (id,business_id,name,email,role,job,sample,invite_hash,invite_expires,active,created_at,start_date,training_role_id) VALUES (?,?,?,?,\'staff\',?,0,?,?,1,?,?,?)',mid,b,name,email,job,hash,shiftDate(today,7)+'T23:59:59Z',now,start,trainingRole),log(b,actor,'Staff invitation created',`${name} · ${email}`)]);return json({state:await state(ctx),inviteToken:token});
 }else if(action==='deactivate'){
  owner(ctx);await checkMember(data.memberId,b);await db().batch([stmt('UPDATE members SET active=0,invite_hash=NULL WHERE id=? AND business_id=? AND role=\'staff\'',data.memberId,b),stmt('UPDATE training SET status=\'superseded\' WHERE member_id=? AND business_id=? AND status IN (\'pending\',\'help\')',data.memberId,b),log(b,actor,'Staff access deactivated','Staff records and acknowledgements retained.')]);
 }else if(action==='archive'){
  owner(ctx);const d=await stmt('SELECT * FROM documents WHERE id=? AND business_id=?',data.documentId,b).first<any>();if(!d)throw new AppError('Document not found.',404);await db().batch([stmt('UPDATE documents SET archived=1 WHERE id=?',d.id),stmt('UPDATE training SET status=\'superseded\' WHERE document_id=? AND status IN (\'pending\',\'help\')',d.id),log(b,actor,'Document archived',d.title)]);
 }else if(action==='settings'){
  owner(ctx);const name=textField(data.name,'a business name'),timezone=textField(data.timezone,'a timezone');try{dateInZone(timezone);}catch{throw new AppError('Choose a valid timezone.');}await db().batch([stmt('UPDATE businesses SET name=?,timezone=? WHERE id=?',name,timezone,b),log(b,actor,'Business settings updated',name)]);ctx.business={...business,name,timezone};
 }else throw new AppError('This action is unavailable.');
 return json({state:await state(ctx)});
 }catch(e){return failure(e);}}
async function checkMember(mid:string,b:string){if(!await stmt('SELECT id FROM members WHERE id=? AND business_id=? AND role=\'staff\' AND active=1',mid,b).first())throw new AppError('Choose an active staff member.');}
async function selectedStaff(value:any,b:string):Promise<string[]>{let v=value;if(typeof v==='string'){try{v=JSON.parse(v);}catch{throw new AppError('Choose staff for this release.');}}if(!Array.isArray(v)||v.length>200||v.some(x=>typeof x!=='string'))throw new AppError('Choose staff for this release.');const selected=[...new Set(v)] as string[];for(const mid of selected)await checkMember(mid,b);return selected;}
function assignment(b:string,did:string,rid:string,mid:string,start:string,due:string,now:string){return stmt('INSERT OR IGNORE INTO training (id,business_id,document_id,revision_id,member_id,start_date,due_date,status,created_at) SELECT ?,?,?,?,?,?,?,\'pending\',? WHERE EXISTS (SELECT 1 FROM documents WHERE id=? AND current_revision_id=? AND archived=0 AND staff_access IN (\'view_only\',\'view_print\'))',id(),b,did,rid,mid,start,due,now,did,rid);}
async function tokenHash(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
async function join(data:any){const user=await getChatGPTUser();if(!user)throw new AppError('Sign in before accepting your invitation.',401);const hash=await tokenHash(textField(data.token,'an invitation',200)),m=await stmt('SELECT * FROM members WHERE invite_hash=? AND active=1 AND invite_expires>?',hash,new Date().toISOString()).first<any>();if(!m)throw new AppError('This invitation has expired or has already been accepted.');if(m.email.toLowerCase()!==user.email.toLowerCase())throw new AppError('Sign in using the email address named on your invitation.',403);if(await stmt('SELECT id FROM members WHERE user_id=? AND active=1',user.userId).first())throw new AppError('This account already belongs to a workspace. Use the invited staff account.');await db().batch([stmt('UPDATE members SET user_id=?,invite_hash=NULL,invite_expires=NULL WHERE id=? AND invite_hash=?',user.userId,m.id,hash),log(m.business_id,{...m,user_id:user.userId},'Staff invitation accepted',m.name)]);return json({joined:true});}
