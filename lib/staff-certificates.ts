import {AppError,stmt,rows,db,id,textField,dateField,upload,bucket} from './store';
import {dateInZone,shiftMonths,certificationMatches} from './model';
import {requiredCertifications} from './role-training';
import {resolveCertificationChoice} from './certification-types';

export async function submitCertificatePhoto(ctx:any,data:any,file:File|null){
 if(ctx.actor.role!=='staff')throw new AppError('Use the staff portal to submit your certificate photo.',403);
 const b=ctx.business.id,mid=ctx.actor.id,today=dateInZone(ctx.business.timezone);
 if(data.memberId&&data.memberId!==mid)throw new AppError('You can upload your own certificates only.',403);
 if(data.confirmed!==true&&data.confirmed!=='true')throw new AppError('Confirm that the photo and certificate details are correct.');
 if(!file?.size)throw new AppError('Upload a photo of your new certificate to close out this training.');
 if(file.size>10*1024*1024)throw new AppError('Choose a certificate photo smaller than 10 MB.');
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new AppError('Upload a JPG, PNG, or WebP certificate photo.');
 const bytes=new Uint8Array(await file.arrayBuffer()),signature=Array.from(bytes.slice(0,8)).join(','),ascii=(from:number,to:number)=>String.fromCharCode(...bytes.slice(from,to));
 if(!(file.type==='image/png'&&signature==='137,80,78,71,13,10,26,10'||file.type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255||file.type==='image/webp'&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'))throw new AppError('This file is not a supported image. Choose a JPG, PNG, or WebP photo.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join(''),requestId=textField(data.requestId,'a submission request',100);
 const previous=data.replacesId?await stmt('SELECT * FROM certifications WHERE id=? AND business_id=? AND member_id=?',data.replacesId,b,mid).first<any>():null;
 if(data.replacesId&&!previous)throw new AppError('Your original certificate is unavailable.',404);
 const certificates=await rows<any>('SELECT * FROM certifications WHERE business_id=? AND member_id=?',b,mid);
 const needs=await requiredCertifications(ctx,certificates,today),need=data.needId?needs.find(n=>n.need_id===data.needId&&n.member_id===mid):undefined;
 if(data.needId&&!need)throw new AppError('Choose your own assigned certification training.',403);
 if(!need&&!previous)throw new AppError('Choose a certification requirement or a certificate to renew.');
 if(need&&need.start_date>today)throw new AppError('This certification training has not started yet.');
 const {title,typeId}=await resolveCertificationChoice(b,{title:need?.title||previous.title,certificationTypeId:need?.certification_type_id||previous?.certification_type_id}),issuer=textField(data.issuer,'an issuing organization'),issued=dateField(data.issuedAt,'an issue date'),expires=dateField(data.expiresAt,'an expiry date'),number=typeof data.number==='string'?data.number.trim().slice(0,100):'';
 if(previous&&!certificationMatches(previous,{title,certification_type_id:typeId}))throw new AppError('Choose the certificate matching this training.');
 if(issued>today||expires<today||expires<issued)throw new AppError('Use a certificate already issued and valid today, with expiry on or after its issue date.');
 if(need?.source==='scheduled'&&issued<need.start_date)throw new AppError('This course needs a new certificate issued on or after the training start date.');
 if(need?.repeat_every_months&&shiftMonths(issued,need.repeat_every_months)<=today)throw new AppError('This repeating training needs a newer certificate. Its issue date must be within the selected repeat period.');
 const existing=await stmt('SELECT * FROM certifications WHERE business_id=? AND submission_id=?',b,requestId).first<any>();
 if(existing){if(existing.member_id!==mid||existing.photo_hash!==hash||!certificationMatches(existing,{title,certification_type_id:typeId})||existing.issuer!==issuer||existing.number!==number||existing.issued_at!==issued||existing.expires_at!==expires||existing.replaces_id!==(previous?.id||null))throw new AppError('This submission request was already used. Start a new upload.',409);return;}
 if(previous?.superseded)throw new AppError('This certificate has already been renewed. Refresh and choose the current record.',409);
 const now=new Date().toISOString(),cid=id(),u=await upload(file,b),reminder=need?.renewal_lead_days||previous?.reminder_days||60;
 const ops=[stmt("INSERT OR IGNORE INTO certifications (id,business_id,member_id,title,issuer,number,issued_at,expires_at,reminder_days,file_key,filename,mime,replaces_id,created_at,photo_submitted_by,photo_submitted_at,submission_id,photo_hash,certification_type_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM certifications WHERE id=? AND business_id=? AND member_id=? AND superseded=0)",cid,b,mid,title,issuer,number,issued,expires,reminder,u.key,u.name,u.mime,previous?.id||null,now,mid,now,requestId,hash,typeId,previous?.id||null,previous?.id||null,b,mid)];
 if(previous)ops.push(stmt('UPDATE certifications SET superseded=1 WHERE id=? AND EXISTS (SELECT 1 FROM certifications WHERE id=?)',previous.id,cid));
 ops.push(stmt('INSERT INTO audit (id,business_id,actor,actor_id,action,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM certifications WHERE id=?)',id(),b,ctx.actor.name,ctx.user.userId,ctx.actor.sample?'Example certificate photo submitted':'Certificate photo submitted',`${title} · ${ctx.actor.name} · valid until ${expires}`,now,cid));
 try{await db().batch(ops);}catch(error){if(u.key)await bucket().delete(u.key);throw error;}
 const saved=await stmt('SELECT * FROM certifications WHERE business_id=? AND submission_id=?',b,requestId).first<any>();
 if(!saved||saved.file_key!==u.key){if(u.key)await bucket().delete(u.key);}
 if(!saved||saved.member_id!==mid||saved.photo_hash!==hash)throw new AppError('The certificate changed during upload. Refresh and try again.',409);
}
