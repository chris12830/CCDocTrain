import {AppError,owner,stmt,rows,db,log,textField} from './store';
import {isPreviewable,staffAccessOptions,staffAccessLabel,type StaffAccess} from './model';

export function validStaffAccess(value:unknown):StaffAccess{
 if(!staffAccessOptions.some(option=>option.value===value))throw new AppError('Choose View only, View and print, or Not viewable.');
 return value as StaffAccess;
}
export function requirePreviewable(access:StaffAccess,mime:string|null|undefined){
 if(access==='view_only'&&!isPreviewable(mime))throw new AppError('View-only access needs an online-preview format. Use a PDF, text, image, video, or audio file instead of Word or PowerPoint.');
}
export async function saveDocumentAccess(ctx:any,data:any){
 owner(ctx);const access=validStaffAccess(data.staffAccess),did=textField(data.documentId,'a document or media item',100),b=ctx.business.id;
 const doc=await stmt('SELECT * FROM documents WHERE id=? AND business_id=?',did,b).first<any>();if(!doc)throw new AppError('Document or media item not found.',404);
 if(doc.deleted_at)throw new AppError('This item has been deleted. Staff access cannot be restored.',410);
 if(access==='view_only'){
  const relevant=await rows<any>("SELECT mime FROM revisions WHERE document_id=? AND business_id=? AND (id=? OR status='draft')",did,b,doc.current_revision_id);
  for(const revision of relevant)requirePreviewable(access,revision.mime);
 }
 if(doc.staff_access===access)return;
 await db().batch([stmt('UPDATE documents SET staff_access=? WHERE id=? AND business_id=?',access,did,b),log(b,ctx.actor,'Staff media access updated',`${doc.title} · ${staffAccessLabel(doc.staff_access)} → ${staffAccessLabel(access)}`)]);
}
