import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {dateInZone,shiftDate,type AppState} from './model';
export class AppError extends Error {constructor(message:string,public status=400){super(message);}}
export function db(){if(!env.DB)throw new AppError('Your workspace is temporarily unavailable. Please try again.',503);return env.DB;}
export function bucket(){if(!env.BUCKET)throw new AppError('File storage is temporarily unavailable. Please try again.',503);return env.BUCKET;}
export function id(){return crypto.randomUUID();}
export function stmt(sql:string,...args:any[]){return db().prepare(sql).bind(...args);}
export async function rows<T=any>(sql:string,...args:any[]):Promise<T[]>{return (await stmt(sql,...args).all<T>()).results;}
export function log(businessId:string,actor:any,action:string,detail:string){return stmt('INSERT INTO audit (id,business_id,actor,actor_id,action,detail,created_at) VALUES (?,?,?,?,?,?,?)',id(),businessId,actor.name,actor.user_id||actor.id,action,detail,new Date().toISOString());}
export async function context(request?:Request){
 const user=await getChatGPTUser();if(!user)throw new AppError('Sign in to open your business workspace.',401);
 let member=await stmt('SELECT * FROM members WHERE user_id=? AND active=1 ORDER BY CASE role WHEN \'owner\' THEN 0 ELSE 1 END LIMIT 1',user.userId).first<any>();
 if(!member){await seed(user);member=await stmt('SELECT * FROM members WHERE user_id=? AND role=\'owner\'',user.userId).first<any>();}
 if(!member)throw new AppError('Your staff access has been deactivated. Contact your business owner.',403);
 const business=await stmt('SELECT * FROM businesses WHERE id=?',member.business_id).first<any>();
 let actor=member;const preview=request?.headers.get('x-staff-preview');
 if(preview){if(member.role!=='owner')throw new AppError('Staff preview is available to the owner only.',403);actor=await stmt('SELECT * FROM members WHERE id=? AND business_id=? AND sample=1 AND active=1',preview,business.id).first<any>();if(!actor)throw new AppError('Only example staff can be previewed.',403);}
 return {business,actor,member,user};
}
export function owner(ctx:any){if(ctx.actor.role!=='owner')throw new AppError('Only the business owner can make this change.',403);}
export function textField(v:unknown,label:string,max=300){if(typeof v!=='string'||!v.trim()||v.length>max)throw new AppError(`Enter ${label} (${max} characters or fewer).`);return v.trim();}
export function dateField(v:unknown,label:string){const value=textField(v,label,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||isNaN(Date.parse(value))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw new AppError(`Enter a valid ${label}.`);return value;}
export function cleanFilename(name:string){return name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,160)||'document';}
export const allowedMimes=['application/pdf','text/plain','image/png','image/jpeg','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
export async function upload(file:File|null,businessId:string){if(!file||!file.size)return {key:null,name:null,mime:null};if(file.size>25*1024*1024)throw new AppError('Choose a file smaller than 25 MB.');if(!allowedMimes.includes(file.type))throw new AppError('Choose a PDF, Word, PowerPoint, plain text, image, MP4, WebM, or audio file.');const key=`${businessId}/${id()}`;await bucket().put(key,file.stream(),{httpMetadata:{contentType:file.type}});return {key,name:cleanFilename(file.name),mime:file.type};}
export async function state(ctx:any):Promise<AppState>{
 const {business,actor}=ctx;const b=business.id,staff=actor.role!=='owner',today=dateInZone(business.timezone);
 const roleTraining=await import('./role-training');await roleTraining.syncRoleTraining(b,business.timezone);
 const [members,documents,revisions,training,certifications,audit,staffRecords,messages,recipients,trainingRoles,trainingNeeds,certificationTypes]=await Promise.all([
 rows('SELECT id,name,email,role,job,sample,active,user_id,start_date,training_role_id FROM members WHERE business_id=? ORDER BY role,name',b),
 rows(`SELECT * FROM documents WHERE business_id=? ${staff?"AND archived=0 AND current_revision_id IS NOT NULL AND staff_access IN ('view_only','view_print')":''} ORDER BY created_at DESC`,b),
 rows(`SELECT r.* FROM revisions r ${staff?"JOIN documents d ON d.current_revision_id=r.id AND d.archived=0 AND d.staff_access IN ('view_only','view_print')":''} WHERE r.business_id=? ORDER BY r.version DESC`,b),
 rows(`SELECT t.*,r.version AS revision_version FROM training t JOIN revisions r ON r.id=t.revision_id AND r.business_id=t.business_id JOIN documents d ON d.id=t.document_id AND d.business_id=t.business_id WHERE t.business_id=? ${staff?"AND t.member_id=? AND d.staff_access IN ('view_only','view_print')":''} ORDER BY t.due_date`,...(staff?[b,actor.id]:[b])),
 rows(`SELECT * FROM certifications WHERE business_id=? ${staff?'AND member_id=?':''} ORDER BY expires_at`,...(staff?[b,actor.id]:[b])),
 staff?Promise.resolve([]):rows('SELECT id,actor,action,detail,created_at FROM audit WHERE business_id=? ORDER BY created_at DESC LIMIT 200',b),
 staff?Promise.resolve([]):rows('SELECT * FROM staff_records WHERE business_id=? ORDER BY record_date DESC,created_at DESC',b),
 rows(`SELECT m.id,m.subject,m.body,m.sender,m.sent_at,m.audience FROM staff_messages m ${staff?'JOIN staff_message_recipients r ON r.message_id=m.id':''} WHERE m.business_id=? ${staff?'AND r.member_id=?':''} ORDER BY m.sent_at DESC,m.id`,...(staff?[b,actor.id]:[b])),
 rows(`SELECT r.message_id,r.member_id,r.read_at FROM staff_message_recipients r JOIN staff_messages m ON m.id=r.message_id WHERE m.business_id=? ${staff?'AND r.member_id=?':''}`,...(staff?[b,actor.id]:[b])),
 rows(`SELECT id,name,description FROM training_roles WHERE business_id=? ${staff?'AND id=?':''} ORDER BY name`,...(staff?[b,actor.training_role_id||'']:[b])),
 staff?Promise.resolve([]):rows('SELECT * FROM training_needs WHERE business_id=? AND active=1 ORDER BY created_at',b),
 rows(`SELECT c.id,c.name,c.description FROM certification_types c WHERE c.business_id=? ${staff?"AND (c.id IN (SELECT certification_type_id FROM certifications WHERE business_id=c.business_id AND member_id=?) OR c.id IN (SELECT certification_type_id FROM training_needs WHERE business_id=c.business_id AND active=1 AND (role_id=? OR member_id=?)))":''} ORDER BY c.name`,...(staff?[b,actor.id,actor.training_role_id||'',actor.id]:[b]))
 ]);
 const messageRecipients=new Map<string,any[]>();for(const {message_id,...r} of recipients){const list=messageRecipients.get(message_id)||[];list.push(r);messageRecipients.set(message_id,list);}
 const requiredCertifications=await roleTraining.requiredCertifications(ctx,certifications,today);
 const {visibleReminders}=await import('./reminders');const reminders=await visibleReminders(ctx);
 return {business,me:actor,members:staff?members.filter(x=>x.id===actor.id):members,documents,revisions:revisions.map(({file_key,...r})=>({...r,...(staff?{release_role_plan:null}:{})})),training,certifications:certifications.map(({file_key,...c})=>c),certificationTypes,audit,staffRecords:staffRecords.map(r=>({...r,content:JSON.parse(r.content)})),messages:messages.map(m=>({...m,recipients:messageRecipients.get(m.id)||[]})),trainingRoles,trainingNeeds,requiredCertifications,reminders,today} as AppState;
}
async function seed(user:any){
 const existing=await stmt('SELECT id FROM members WHERE user_id=?',user.userId).first();if(existing)throw new AppError('Your staff access has been deactivated. Contact your business owner.',403);
 const b=id(),now=new Date().toISOString(),today=dateInZone(),o=id();const people=[['Priya Patel','Preschool educator'],['Emma Wilson','Infant educator'],['James Chen','Toddler educator'],['Sofia Martinez','Program supervisor']].map(([name,job])=>({id:id(),name,job}));
 const batch=[stmt('INSERT OR IGNORE INTO businesses (id,owner_id,name,timezone,sample,created_at) VALUES (?,?,?, ?,1,?)',b,user.userId,'Little Sprouts Child Care','America/Toronto',now),stmt('INSERT INTO members (id,business_id,user_id,name,email,role,job,sample,active,created_at) SELECT ?,?,?,?,?,\'owner\',\'Business owner\',0,1,? WHERE EXISTS (SELECT 1 FROM businesses WHERE id=?)',o,b,user.userId,user.fullName||'Business owner',user.email,now,b)];
 for(const [i,p] of people.entries())batch.push(stmt('INSERT INTO members (id,business_id,name,email,role,job,sample,active,created_at) VALUES (?,?,?,?,\'staff\',?,1,1,?)',p.id,b,p.name,`example${i+1}@example.com`,p.job,now));
 const docs=[
 ['Safe arrival & departure','HS-001','Health & safety',3,'Clarified the handover checklist and who records a late pickup.'],
 ['Allergy & anaphylaxis response','HS-002','Health & safety',2,'Updated the sample emergency response steps.'],
 ['Outdoor play supervision','PR-003','Program procedures',2,'Added a sample playground safety check.'],
 ['Positive guidance policy','BP-004','Business policies',1,'Initial release for staff review.'],
 ['Daily room reset checklist','PR-005','Program procedures',1,'Initial release for staff review.'],
 ['New educator orientation','TM-006','Training media',1,'Orientation reading notes.'],
 ['Illness reporting procedure','HS-007','Health & safety',1,'Draft awaiting owner review.']
 ];
 for(const [i,d] of docs.entries()){
  const [title,code,category,version,changes]=d;const did=id(),rid=id(),released=i!==6;
  batch.push(stmt('INSERT INTO documents (id,business_id,title,code,category,current_revision_id,created_at) VALUES (?,?,?,?,?,?,?)',did,b,title,code,category,released?rid:null,shiftDate(today,-3)+'T14:00:00Z'));
  const content=`EXAMPLE DOCUMENT — replace with your business-approved procedure.\n\n${title}\n\nPurpose\nHelp the team follow a consistent approach and provide safe, attentive care.\n\nBefore you begin\nCheck that you are using the current released revision. Read the procedure and speak with your supervisor if anything is unclear.\n\nStaff responsibilities\n1. Review the day's instructions and the needs of children in your care.\n2. Follow your business's approved procedure and record required observations.\n3. Report any concern promptly to the program supervisor.\n4. Complete a safe handover with the receiving staff member.\n\nTraining\nAfter reviewing, acknowledge that you have read this revision and understand how to use it. If you need support, request clarification before acknowledging.\n\nThis example is illustrative and is not a regulatory policy.`;
  if(Number(version)>1){const old=id();batch.push(stmt('INSERT INTO revisions (id,business_id,document_id,version,status,content,changes,created_at,released_at,author) VALUES (?,?,?,?,\'superseded\',?,?,?,?,?)',old,b,did,Number(version)-1,content,'Previous example revision.',shiftDate(today,-40)+'T14:00:00Z',shiftDate(today,-40)+'T14:00:00Z','Business owner'));}
  batch.push(stmt('INSERT INTO revisions (id,business_id,document_id,version,status,content,changes,created_at,released_at,author) VALUES (?,?,?,?,?,?,?,?,?,?)',rid,b,did,version,released?'released':'draft',content,changes,now,released?shiftDate(today,-3)+'T14:00:00Z':null,'Business owner'));
  if(released)for(const [j,p] of people.entries()){const complete=(i+j)%3!==0,late=i<2&&j<2&&!complete;batch.push(stmt('INSERT INTO training (id,business_id,document_id,revision_id,member_id,start_date,due_date,status,viewed_at,acknowledged_at,acknowledged_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',id(),b,did,rid,p.id,shiftDate(today,-3),shiftDate(today,late?-2:5+i),complete?'complete':'pending',complete?now:null,complete?now:null,complete?'Example acknowledgement':null,now));}
 }
 for(const [i,p] of people.entries())batch.push(stmt('INSERT INTO certifications (id,business_id,member_id,title,issuer,number,issued_at,expires_at,reminder_days,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',id(),b,p.id,i===3?'Early childhood educator registration':'Standard First Aid & CPR-C','Example training provider',`EXAMPLE-${i+1}`,shiftDate(today,-650),shiftDate(today,[-4,25,250,50][i]),60,now));
 batch.push(log(b,{name:'Business owner',id:o,user_id:user.userId},'Workspace created','Example documents and staff loaded.'));
 try{await db().batch(batch);}catch(error){if(await stmt('SELECT id FROM members WHERE user_id=? AND active=1',user.userId).first())return;throw error;}
}
