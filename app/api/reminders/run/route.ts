import {getChatGPTUser} from '@/app/chatgpt-auth';
import {AppError,context,owner,rows} from '@/lib/store';
import {runAutomaticReminders} from '@/lib/reminders';
export const dynamic='force-dynamic';
// Hosted Sites protects this route with its private audience / service bearer boundary.
// Service access has no visitor identity. Visitors must be owners and remain business-scoped.
async function scope(request:Request){if(await getChatGPTUser()){const ctx=await context(request);owner(ctx);return ctx.business.id;}return undefined;}
function fail(e:unknown){return Response.json({error:e instanceof AppError?e.message:'Reminder check could not finish.'},{status:e instanceof AppError?e.status:500});}
export async function POST(request:Request){try{const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AppError('Use your workspace to check reminders.',403);return Response.json(await runAutomaticReminders(await scope(request)),{headers:{'Cache-Control':'no-store'}});}catch(e){console.error('Reminder run failed',e);return fail(e);}}
export async function GET(request:Request){try{const b=await scope(request);return Response.json({businesses:await rows(`SELECT id,reminder_enabled,reminder_every_days,reminder_last_run FROM businesses ${b?'WHERE id=?':''}`,...(b?[b]:[])),channel:'in-app'},{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e);}}
