import {AppError,db,stmt,rows,id,owner,textField} from './store';
import {dateInZone,shiftDate,certStatus,type Business} from './model';
import {requiredCertifications,syncRoleTraining} from './role-training';
type Item={memberId:string;kind:'training'|'certification'|'owner_overdue';sourceId:string;title:string;body:string;overdue:boolean};
const key=(x:Item)=>[x.kind,x.memberId,x.sourceId].join('|');

async function reminderItems(business:Business,today:string):Promise<Item[]>{
 const b=business.id,[members,training,certificates]=await Promise.all([
  rows<any>('SELECT id,name,role FROM members WHERE business_id=? AND active=1',b),
  rows<any>("SELECT t.*,d.title,d.code,r.version FROM training t JOIN members m ON m.id=t.member_id AND m.business_id=t.business_id JOIN documents d ON d.id=t.document_id AND d.business_id=t.business_id JOIN revisions r ON r.id=t.revision_id WHERE t.business_id=? AND m.active=1 AND m.role='staff' AND t.status IN ('pending','help') AND t.start_date<=? AND d.current_revision_id=t.revision_id AND d.archived=0 AND d.staff_access IN ('view_only','view_print') AND r.status='released'",b,today),
  rows<any>('SELECT c.* FROM certifications c JOIN members m ON m.id=c.member_id AND m.business_id=c.business_id WHERE c.business_id=? AND m.active=1',b)
 ]);
 const requirements=await requiredCertifications({business,actor:{role:'owner'}},certificates,today),items:Item[]=[];
 for(const t of training)items.push({memberId:t.member_id,kind:'training',sourceId:t.id,title:'Training acknowledgement needed',body:`${t.title} · Revision ${t.version} · Due ${t.due_date}. Review this released revision and acknowledge that you understand its use.${t.status==='help'?' Your clarification request remains open.':''}`,overdue:t.due_date<today});
 const requiredIds=new Set(requirements.map(n=>n.certification_id));
 for(const n of requirements)if(n.start_date<=today&&n.status!=='Current')items.push({memberId:n.member_id,kind:'certification',sourceId:n.id,title:'Certificate photo / renewal needed',body:`${n.title} · ${n.status} · Due ${n.due_date}. Upload a photo of your new certificate with its issue and expiry dates to close out certification training.`,overdue:['Expired','Overdue'].includes(n.status)});
 for(const c of certificates){const status=certStatus(c,today);if(!c.superseded&&!requiredIds.has(c.id)&&status!=='Current')items.push({memberId:c.member_id,kind:'certification',sourceId:'certificate:'+c.id,title:'Certificate photo / renewal needed',body:`${c.title} · ${status} · Expires ${c.expires_at}. Upload your certificate photo and current dates from Certifications.`,overdue:status==='Expired'});}
 const overdue=items.filter(x=>x.overdue);
 if(overdue.length)for(const member of members.filter(m=>m.role==='owner'))items.push({memberId:member.id,kind:'owner_overdue',sourceId:'overdue-summary',title:`${overdue.length} overdue training / certification item${overdue.length===1?'':'s'}`,body:overdue.slice(0,50).map(x=>`${members.find(m=>m.id===x.memberId)?.name||'Staff'} — ${x.body}`).join('\n')+(overdue.length>50?`\n${overdue.length-50} more items in Alerts.`:''),overdue:false});
 return items;
}
async function reconcile(b: string,items:Item[],now:string){
 await stmt("UPDATE reminders SET resolved_at=? WHERE business_id=? AND resolved_at IS NULL AND (kind||'|'||member_id||'|'||source_id) NOT IN (SELECT value FROM json_each(?))",now,b,JSON.stringify(items.map(key))).run();
}
export async function visibleReminders(ctx:any){
 const now=new Date().toISOString(),items=await reminderItems(ctx.business,dateInZone(ctx.business.timezone));await reconcile(ctx.business.id,items,now);
 const notices=await rows<any>("SELECT id,member_id,kind,source_id,title,body,sent_date,created_at,read_at,resolved_at FROM reminders WHERE business_id=? AND member_id=? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 100",ctx.business.id,ctx.actor.id);
 const current=new Map(items.map(item=>[key(item),item]));
 return notices.map(n=>{const item=current.get([n.kind,n.member_id,n.source_id].join('|'));return item?{...n,title:item.title,body:item.body}:n;});
}
export async function runAutomaticReminders(businessId?:string,clock=new Date()){
 const businesses=await rows<Business>(`SELECT * FROM businesses ${businessId?'WHERE id=?':''}`,...(businessId?[businessId]:[]));let deliveries=0,checked=0;
 for(const business of businesses){
  const now=clock.toISOString(),today=new Intl.DateTimeFormat('en-CA',{timeZone:business.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(clock);
  await syncRoleTraining(business.id,business.timezone);const items=await reminderItems(business,today);await reconcile(business.id,items,now);
  if(!business.reminder_enabled)continue;checked++;const cutoff=shiftDate(today,-business.reminder_every_days),ops=[] as D1PreparedStatement[],deliveryIndexes=new Set<number>();
  for(const item of items){const rid=id();deliveryIndexes.add(ops.length);ops.push(stmt("INSERT OR IGNORE INTO reminders (id,business_id,member_id,kind,source_id,title,body,sent_date,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM businesses WHERE id=? AND reminder_enabled=1) AND EXISTS (SELECT 1 FROM members WHERE id=? AND business_id=? AND active=1) AND NOT EXISTS (SELECT 1 FROM reminders WHERE business_id=? AND member_id=? AND kind=? AND source_id=? AND sent_date>?)",rid,business.id,item.memberId,item.kind,item.sourceId,item.title,item.body,today,now,business.id,item.memberId,business.id,business.id,item.memberId,item.kind,item.sourceId,cutoff));
   if(item.kind==='training')ops.push(stmt("UPDATE training SET reminder_count=reminder_count+1,last_reminder=? WHERE id=? AND business_id=? AND status IN ('pending','help') AND EXISTS (SELECT 1 FROM reminders WHERE id=?)",now,item.sourceId,business.id,rid));
  }
  for(let i=0;i<ops.length;i+=50){const results=await db().batch(ops.slice(i,i+50));deliveries+=results.filter((_,j)=>deliveryIndexes.has(i+j)).reduce((sum,r)=>sum+(r.meta.changes||0),0);}
  await reconcile(business.id,await reminderItems(business,today),now);await stmt('UPDATE businesses SET reminder_last_run=? WHERE id=?',now,business.id).run();
 }
 return {checked,deliveries,checkedAt:clock.toISOString(),channel:'in-app'};
}
export async function saveReminderSettings(ctx:any,data:any){owner(ctx);const enabled=data.enabled===true?1:data.enabled===false?0:null,every=Number(data.everyDays);if(enabled===null||!Number.isInteger(every)||every<1||every>30)throw new AppError('Choose an enabled setting and a repeat interval of 1–30 days.');await stmt('UPDATE businesses SET reminder_enabled=?,reminder_every_days=? WHERE id=?',enabled,every,ctx.business.id).run();ctx.business={...ctx.business,reminder_enabled:enabled,reminder_every_days:every};}
export async function readReminder(ctx:any,data:any){const rid=textField(data.reminderId,'a reminder ID',100),reminder=await stmt('SELECT id FROM reminders WHERE id=? AND business_id=? AND member_id=?',rid,ctx.business.id,ctx.actor.id).first();if(!reminder)throw new AppError('Reminder unavailable.',404);await stmt('UPDATE reminders SET read_at=COALESCE(read_at,?) WHERE id=?',new Date().toISOString(),rid).run();}
