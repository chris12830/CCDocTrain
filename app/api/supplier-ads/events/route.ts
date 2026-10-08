import {z} from 'zod';
import {AppError,context} from '@/lib/store';
import {recordSupplierEvent} from '@/lib/supplier-ads';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
  const ctx=await context(request),event=z.object({id:z.string().uuid(),campaignId:z.string().min(1).max(200),country:z.enum(['CA','US']),kind:z.enum(['impression','click'])}).strict().parse(await request.json());
  const recorded=await recordSupplierEvent(event,ctx.actor.role==='owner'?'owner':'staff');
  return Response.json({recorded},{status:recorded?200:503,headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:'Advertising activity could not be recorded.'},{status:e instanceof AppError?e.status:400});}
}
