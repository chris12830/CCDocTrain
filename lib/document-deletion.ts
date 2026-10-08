import {AppError,owner,stmt,db,id,textField} from './store';

export async function deleteDocument(ctx:any,data:any){
 owner(ctx);const b=ctx.business.id,did=textField(data.documentId,'a document or media item',100),reason=textField(data.reason,'a reason for deletion',2000);
 const doc=await stmt('SELECT * FROM documents WHERE id=? AND business_id=?',did,b).first<any>();if(!doc)throw new AppError('Document or media item not found.',404);
 if(doc.deleted_at){if(doc.deletion_reason!==reason)throw new AppError('This item has already been deleted. Its recorded reason cannot be changed.',409);return;}
 const now=new Date().toISOString();
 await db().batch([
  stmt('INSERT INTO audit (id,business_id,actor,actor_id,action,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM documents WHERE id=? AND business_id=? AND deleted_at IS NULL)',id(),b,ctx.actor.name,ctx.actor.user_id||ctx.actor.id,'Document / media deleted',`${doc.code} · ${doc.title}\nReason: ${reason}`,now,did,b),
  stmt("UPDATE documents SET deleted_at=?,deletion_reason=?,deleted_by=?,archived=1,staff_access='not_viewable' WHERE id=? AND business_id=? AND deleted_at IS NULL",now,reason,ctx.actor.name,did,b),
  stmt("UPDATE training SET status='superseded' WHERE document_id=? AND business_id=? AND status IN ('pending','help')",did,b),
  stmt("UPDATE training_needs SET active=0 WHERE document_id=? AND business_id=? AND kind='document'",did,b)
 ]);
}
