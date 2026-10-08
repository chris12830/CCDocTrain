import {AppError,owner,rows,stmt,db,id,textField} from './store';

export async function sendStaffMessage(ctx:any,data:any){
 owner(ctx);
 const businessId=ctx.business.id,requestId=textField(data.requestId,'a message request',100);
 const subject=textField(data.subject,'a subject',200),body=textField(data.body,'a message',12000);
 if(!['all','selected'].includes(data.audience))throw new AppError('Choose selected staff or all active staff.');
 let selected:string[]=[];
 if(data.audience==='selected'){
  if(!Array.isArray(data.memberIds)||!data.memberIds.length||data.memberIds.length>200||data.memberIds.some((v:unknown)=>typeof v!=='string'))throw new AppError('Select 1–200 active staff members.');
  selected=[...new Set<string>(data.memberIds)].sort();
 }
 const targets=JSON.stringify(selected);
 const match=(message:any)=>{if(message.subject!==subject||message.body!==body||message.audience!==data.audience||message.target_member_ids!==targets)throw new AppError('This message request was already used. Open a new message.',409);};
 const existing=await stmt('SELECT * FROM staff_messages WHERE business_id=? AND request_id=?',businessId,requestId).first<any>();
 if(existing){match(existing);return;}
 const recipients=await rows<{id:string}>(`SELECT id FROM members WHERE business_id=? AND role='staff' AND active=1 ${data.audience==='selected'?'AND id IN (SELECT value FROM json_each(?))':''} ORDER BY id`,...(data.audience==='selected'?[businessId,targets]:[businessId]));
 if(!recipients.length)throw new AppError('Choose at least one active staff member.');
 if(data.audience==='selected'&&recipients.length!==selected.length)throw new AppError('Choose active staff from your own business.');
 const mids=JSON.stringify(recipients.map(m=>m.id)),messageId=id(),now=new Date().toISOString();
 // One transaction freezes the recipient list and makes retrying the same send safe.
 await db().batch([
  stmt(`INSERT OR IGNORE INTO staff_messages (id,business_id,request_id,audience,target_member_ids,subject,body,sender,sender_id,sent_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM members WHERE business_id=? AND role='staff' AND active=1 AND id IN (SELECT value FROM json_each(?)))=?`,messageId,businessId,requestId,data.audience,targets,subject,body,ctx.actor.name,ctx.user.userId,now,businessId,mids,recipients.length),
  stmt(`INSERT OR IGNORE INTO staff_message_recipients (message_id,member_id) SELECT ?,m.id FROM members m WHERE m.business_id=? AND m.role='staff' AND m.active=1 AND m.id IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM staff_messages WHERE id=? AND business_id=?)`,messageId,businessId,mids,messageId,businessId),
  stmt('INSERT INTO audit (id,business_id,actor,actor_id,action,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM staff_messages WHERE id=? AND business_id=?)',id(),businessId,ctx.actor.name,ctx.user.userId,'Staff message sent',`${subject} · ${recipients.length} staff · in-app delivery`,now,messageId,businessId)
 ]);
 const saved=await stmt('SELECT * FROM staff_messages WHERE business_id=? AND request_id=?',businessId,requestId).first<any>();
 if(!saved)throw new AppError('Staff availability changed. Refresh the recipient list and try again.',409);
 match(saved);
}

export async function readStaffMessage(ctx:any,data:any){
 if(ctx.actor.role!=='staff')throw new AppError('Only a message recipient can mark it as read.',403);
 const messageId=textField(data.messageId,'a message ID',100);
 const recipient=await stmt('SELECT r.message_id FROM staff_message_recipients r JOIN staff_messages m ON m.id=r.message_id WHERE r.message_id=? AND r.member_id=? AND m.business_id=?',messageId,ctx.actor.id,ctx.business.id).first();
 if(!recipient)throw new AppError('This message is unavailable.',404);
 await stmt('UPDATE staff_message_recipients SET read_at=COALESCE(read_at,?) WHERE message_id=? AND member_id=?',new Date().toISOString(),messageId,ctx.actor.id).run();
}
