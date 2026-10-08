import {AppError,owner,stmt,rows,id,textField} from './store';
import type {ReleaseRolePlan} from './model';

export async function validateReleaseRolePlan(ctx:any,data:any,fallback?:string|null):Promise<ReleaseRolePlan|null>{
 owner(ctx);let choice=data.roleTrainingRequired,roleIds=data.trainingRoleIds,dueDays=data.roleTrainingDueDays;
 if(choice===undefined){
  if(roleIds!==undefined||dueDays!==undefined)throw new AppError('Choose whether this material needs to be added to job-role training.');
  if(!fallback)return null;
  let stored;try{stored=JSON.parse(fallback);}catch{throw new AppError('The saved role training plan is unavailable. Review it before release.');}
  choice=stored.required;roleIds=stored.roleIds;dueDays=stored.dueDays;
 }
 if(![true,false,'true','false'].includes(choice))throw new AppError('Choose whether this material needs to be added to job-role training.');
 const required=choice===true||choice==='true';
 if(roleIds===undefined)roleIds=[];
 if(typeof roleIds==='string'){try{roleIds=JSON.parse(roleIds);}catch{throw new AppError('Choose job training roles from the list.');}}
 if(!Array.isArray(roleIds)||roleIds.length>200)throw new AppError('Select up to 200 job training roles.');
 const selected=[...new Set<string>(roleIds.map((v:unknown)=>textField(v,'a job training role',100)))];
 if(!required){if(selected.length)throw new AppError('Select Yes to add this material to job-role training.');return {required:false,roleIds:[],dueDays:7};}
 if(!selected.length)throw new AppError('Select at least one job training role.');
 const due=dueDays===undefined?7:Number(dueDays);if((dueDays!==undefined&&!['string','number'].includes(typeof dueDays))||dueDays===''||!Number.isInteger(due)||due<0||due>3650)throw new AppError('Set a role-training deadline of 0–3650 days.');
 const roles=await rows<{id:string}>('SELECT id FROM training_roles WHERE business_id=? AND id IN (SELECT value FROM json_each(?))',ctx.business.id,JSON.stringify(selected));
 if(roles.length!==selected.length)throw new AppError('Every selected job training role must belong to your business.');
 return {required:true,roleIds:selected,dueDays:due};
}
export function releaseRoleTrainingStatements(b:string,r:any,plan:ReleaseRolePlan|null,now:string){
 if(!plan?.required)return [];
 // Requirements become active in the same transaction as owner approval.
 // Existing requirements keep their schedules, repeats, and completion history.
 return [stmt("INSERT INTO training_needs (id,business_id,role_id,kind,document_id,title,start_offset_days,due_offset_days,renewal_lead_days,created_at) SELECT json_extract(choice.value,'$.id'),?,roles.id,'document',?,?,0,?,60,? FROM json_each(?) choice JOIN training_roles roles ON roles.id=json_extract(choice.value,'$.roleId') AND roles.business_id=? WHERE EXISTS (SELECT 1 FROM revisions v JOIN documents d ON d.id=v.document_id AND d.business_id=v.business_id WHERE v.id=? AND v.business_id=? AND v.status='draft' AND d.archived=0 AND d.staff_access IN ('view_only','view_print')) AND NOT EXISTS (SELECT 1 FROM training_needs n WHERE n.business_id=? AND n.role_id=roles.id AND n.kind='document' AND n.document_id=? AND n.active=1)",b,r.document_id,r.title,plan.dueDays,now,JSON.stringify(plan.roleIds.map(roleId=>({id:id(),roleId}))),b,r.id,b,b,r.document_id)];
}
