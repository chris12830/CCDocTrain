import {AppError,context,stmt,bucket,cleanFilename} from '@/lib/store';
import {canStaffView,isPreviewable} from '@/lib/model';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params,ctx=await context(request),url=new URL(request.url),isCert=url.searchParams.get('kind')==='certification';let row:any;
  if(isCert){row=await stmt('SELECT * FROM certifications WHERE id=? AND business_id=?',id,ctx.business.id).first<any>();if(row&&ctx.actor.role!=='owner'&&row.member_id!==ctx.actor.id)throw new AppError('This certification is private.',403);}
  else{row=await stmt('SELECT r.*,d.current_revision_id,d.archived,d.code,d.title,d.staff_access,d.deleted_at FROM revisions r JOIN documents d ON d.id=r.document_id AND d.business_id=r.business_id WHERE r.id=? AND r.business_id=?',id,ctx.business.id).first<any>();if(row&&ctx.actor.role!=='owner'){
   if(!canStaffView(row.staff_access)||row.id!==row.current_revision_id||row.archived||row.status!=='released')throw new AppError('This item is unavailable for staff viewing.',403);
   if(row.staff_access==='view_only'&&(url.searchParams.has('download')||!isPreviewable(row.mime)))throw new AppError('This item is view only. Printing and downloading are unavailable.',403);
  }}
  if(!row)throw new AppError('File not found.',404);const prefix=isCert?'':row.deleted_at?'DELETED_':row.status==='released'?'CURRENT_':`${row.status.toUpperCase()}_`;
  if(!row.file_key)return new Response(row.content||'',{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`${url.searchParams.has('download')?'attachment':'inline'}; filename="${cleanFilename(prefix+(row.code||'document')+'_rev'+(row.version||1)+'.txt')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  const obj=await bucket().get(row.file_key);if(!obj)throw new AppError('This file is temporarily unavailable.',503);const inline=isPreviewable(row.mime);
  return new Response(obj.body,{headers:{'Content-Type':row.mime||'application/octet-stream','Content-Disposition':`${url.searchParams.has('download')||!inline?'attachment':'inline'}; filename="${cleanFilename(prefix+row.filename)}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'self'"}});
 }catch(e){console.error('File retrieval failed',e instanceof AppError?e.message:e);return Response.json({error:e instanceof AppError?e.message:'File storage is unavailable.'},{status:e instanceof AppError?e.status:503});}
}
