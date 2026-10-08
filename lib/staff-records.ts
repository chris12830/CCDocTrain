import {AppError,owner,stmt,db,id,log,textField,dateField} from './store';
import {appraisalCriteria,issueLevels,type StaffRecordContent} from './model';
function optional(value:unknown,label:string,max=12000){if(value===undefined||value===null||value==='')return '';return textField(value,label,max);}
export async function saveStaffRecord(ctx:any,data:any){
 owner(ctx);
 const b=ctx.business.id,now=new Date().toISOString(),existing=data.recordId?await stmt('SELECT * FROM staff_records WHERE id=? AND business_id=?',textField(data.recordId,'a report ID',100),b).first<any>():null;
 if(data.recordId&&!existing)throw new AppError('This staff record is unavailable.',404);
 if(existing?.status==='filed')throw new AppError('Filed reports are retained unchanged. Record the follow-up instead.',409);
 const memberId=existing?.member_id||textField(data.memberId,'a staff member',100);
 const m=await stmt('SELECT id,name,active FROM members WHERE id=? AND business_id=? AND role=\'staff\'',memberId,b).first<any>();
 if(!m)throw new AppError('Choose a staff member from your business.');
 if(!existing&&!m.active)throw new AppError('New reports can be created for active staff only.');
 const kind=existing?.kind||data.kind;if(!['writeup','appraisal'].includes(kind))throw new AppError('Choose a non-compliance write-up or a yearly appraisal.');
 const title=textField(data.title,'a report title'),recordDate=dateField(data.recordDate,'a report date');
 if(!['draft','filed'].includes(data.status))throw new AppError('Choose whether to save a draft or file the report.');
 const raw=data.content;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AppError('Enter report details.');
 const content:StaffRecordContent={};let year:number|null=null;
 if(kind==='writeup'){
  const level=textField(raw.issueLevel,'an issue level');if(!issueLevels.includes(level))throw new AppError('Choose a valid issue level.');
  Object.assign(content,{issueLevel:level,facts:optional(raw.facts,'the observed facts'),standard:optional(raw.standard,'the policy or standard'),staffResponse:optional(raw.staffResponse,'the staff response'),correctiveAction:optional(raw.correctiveAction,'the corrective action')});
  if(data.status==='filed'){textField(content.facts,'the observed facts',12000);textField(content.standard,'the expected standard or policy',12000);textField(content.correctiveAction,'the corrective action and improvement expectations',12000);}
 }else{
  year=Number(data.appraisalYear);if(!Number.isInteger(year)||year<1900||year>2200)throw new AppError('Enter a valid appraisal year.');
  const start=dateField(raw.periodStart,'a review period start'),end=dateField(raw.periodEnd,'a review period end');if(end<start)throw new AppError('The review period must end on or after its start.');
  const ratings:Record<string,number>={};
  for(const criterion of appraisalCriteria){const value=Number(raw.ratings?.[criterion]||0);if(!Number.isInteger(value)||value<0||value>5||data.status==='filed'&&value===0)throw new AppError('Rate each appraisal area from 1 to 5 before filing.');ratings[criterion]=value;}
  Object.assign(content,{periodStart:start,periodEnd:end,ratings,strengths:optional(raw.strengths,'strengths and achievements'),improvements:optional(raw.improvements,'areas for improvement'),goals:optional(raw.goals,'the improvement goals and target dates'),support:optional(raw.support,'the training and support plan')});
  if(data.status==='filed'){textField(content.strengths,'strengths and achievements',12000);textField(content.improvements,'areas for improvement',12000);textField(content.goals,'improvement goals and target dates',12000);}
 }
 const followUp=data.followUpDate?dateField(data.followUpDate,'a follow-up date'):null;
 if(followUp&&followUp<recordDate)throw new AppError('The follow-up date must be on or after the report date.');
 const filedAt=data.status==='filed'?now:null,recordId=existing?.id||id();
 let update;
 if(existing){const version=Number(data.version);if(!Number.isInteger(version)||version!==existing.version)throw new AppError('This draft was updated elsewhere. Reopen it before saving.',409);
  update=stmt('UPDATE staff_records SET title=?,record_date=?,appraisal_year=?,status=?,content=?,version=version+1,updated_at=?,filed_at=?,follow_up_date=? WHERE id=? AND business_id=? AND status=\'draft\' AND version=?',title,recordDate,year,data.status,JSON.stringify(content),now,filedAt,followUp,recordId,b,version);
 }else update=stmt('INSERT INTO staff_records (id,business_id,member_id,kind,title,record_date,appraisal_year,status,content,author,created_by,created_at,updated_at,filed_at,follow_up_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',recordId,b,memberId,kind,title,recordDate,year,data.status,JSON.stringify(content),ctx.actor.name,ctx.user.userId,now,now,filedAt,followUp);
 const auditAction=data.status==='filed'?(kind==='writeup'?'Non-compliance write-up filed':'Yearly appraisal filed'):'Staff report draft saved';
 const results=await db().batch([update,stmt('INSERT INTO audit (id,business_id,actor,actor_id,action,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM staff_records WHERE id=? AND business_id=? AND updated_at=?)',id(),b,ctx.actor.name,ctx.user.userId,auditAction,m.name+' · '+title,now,recordId,b,now)]);
 if(!results[0].meta.changes)throw new AppError('This draft changed while you were saving. Reopen it and try again.',409);
 return recordId;
}
export async function completeStaffFollowUp(ctx:any,data:any){
 owner(ctx);const b=ctx.business.id,recordId=textField(data.recordId,'a staff record ID',100);
 const r=await stmt('SELECT * FROM staff_records WHERE id=? AND business_id=?',recordId,b).first<any>();if(!r)throw new AppError('Staff record not found.',404);if(r.status!=='filed')throw new AppError('File the report before recording follow-up.');if(r.completed_at)throw new AppError('This follow-up has already been recorded.',409);
 const notes=textField(data.notes,'follow-up results and progress',12000),now=new Date().toISOString();
 const results=await db().batch([stmt('UPDATE staff_records SET completed_at=?,follow_up_notes=?,updated_at=?,version=version+1 WHERE id=? AND business_id=? AND completed_at IS NULL',now,notes,now,r.id,b),stmt('INSERT INTO audit (id,business_id,actor,actor_id,action,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM staff_records WHERE id=? AND business_id=? AND completed_at=?)',id(),b,ctx.actor.name,ctx.user.userId,'Staff improvement follow-up recorded',r.title,now,r.id,b,now)]);
 if(!results[0].meta.changes)throw new AppError('Follow-up has already been updated. Refresh the staff file.',409);
}
