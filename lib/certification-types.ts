import {AppError,owner,stmt,rows,db,id,textField,log} from './store';
import {certificationNameKey} from './model';

export async function saveCertificationType(ctx:any,data:any){
 owner(ctx);const b=ctx.business.id,name=textField(data.name,'a certification name',300).replace(/\s+/g,' '),key=certificationNameKey(name),description=typeof data.description==='string'?data.description.trim():'';
 if(description.length>3000)throw new AppError('Certification descriptions must be 3000 characters or fewer.');
 const typeId=data.certificationTypeId?textField(data.certificationTypeId,'a certification name ID',100):id();
 if(data.certificationTypeId&&!await stmt('SELECT id FROM certification_types WHERE id=? AND business_id=?',typeId,b).first())throw new AppError('Certification name not found.',404);
 if(await stmt('SELECT id FROM certification_types WHERE business_id=? AND name_key=? AND id<>?',b,key,typeId).first())throw new AppError('This certification name already exists. Select it or edit its description.',409);
 const [needs,certificates]=await Promise.all([rows<any>("SELECT id,title FROM training_needs WHERE business_id=? AND kind='certification' AND certification_type_id IS NULL",b),rows<any>('SELECT id,title FROM certifications WHERE business_id=? AND certification_type_id IS NULL',b)]);
 const matching=(items:any[])=>JSON.stringify(items.filter(x=>certificationNameKey(x.title)===key).map(x=>x.id)),now=new Date().toISOString();
 try{await db().batch([
  data.certificationTypeId?stmt('UPDATE certification_types SET name=?,name_key=?,description=?,updated_at=? WHERE id=? AND business_id=?',name,key,description,now,typeId,b):stmt('INSERT INTO certification_types (id,business_id,name,name_key,description,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',typeId,b,name,key,description,now,now),
  // Existing records keep their original names, dates, and proof while acquiring
  // a stable identity when the owner defines their certification name.
  stmt('UPDATE training_needs SET certification_type_id=? WHERE business_id=? AND certification_type_id IS NULL AND id IN (SELECT value FROM json_each(?))',typeId,b,matching(needs)),
  stmt('UPDATE certifications SET certification_type_id=? WHERE business_id=? AND certification_type_id IS NULL AND id IN (SELECT value FROM json_each(?))',typeId,b,matching(certificates)),
  log(b,ctx.actor,'Certification name saved',name)
 ]);}catch(error){if(String(error).includes('UNIQUE'))throw new AppError('This certification name already exists. Refresh and select it.',409);throw error;}
}

export async function resolveCertificationChoice(b:string,data:any,previous?:any):Promise<{title:string;typeId:string|null}>{
 let requested=data.certificationTypeId;
 if(!requested&&previous?.certification_type_id&&typeof data.title==='string'&&certificationNameKey(data.title)===certificationNameKey(previous.title))requested=previous.certification_type_id;
 if(requested){const type=await stmt('SELECT id,name FROM certification_types WHERE id=? AND business_id=?',textField(requested,'a certification name',100),b).first<any>();if(!type)throw new AppError('Choose a certification name from your business.');return {title:type.name,typeId:type.id};}
 const title=textField(data.title,'a certification name',300),type=await stmt('SELECT id,name FROM certification_types WHERE business_id=? AND name_key=?',b,certificationNameKey(title)).first<any>();
 return {title:type?.name||title,typeId:type?.id||null};
}
