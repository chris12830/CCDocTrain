import {AppError,context} from '@/lib/store';
import {supplierFeed} from '@/lib/supplier-ads';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{const ctx=await context(request);return Response.json(await supplierFeed(ctx.actor.role==='owner'?'owner':'staff'),{headers:{'Cache-Control':'no-store'}});}
 catch(e){return Response.json({error:'Sign in to view supplier offers.'},{status:e instanceof AppError?e.status:503,headers:{'Cache-Control':'no-store'}});}
}
