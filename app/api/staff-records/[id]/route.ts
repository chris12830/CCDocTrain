import {AppError,context,owner,stmt,cleanFilename} from '@/lib/store';
import {appraisalCriteria} from '@/lib/model';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const ctx=await context(request);owner(ctx);const {id}=await params;
 const r=await stmt('SELECT r.*,m.name AS member_name,m.job AS member_job FROM staff_records r JOIN members m ON m.id=r.member_id WHERE r.id=? AND r.business_id=?',id,ctx.business.id).first<any>();if(!r)throw new AppError('Staff report not found.',404);
 const c=JSON.parse(r.content);
 if(!new URL(request.url).searchParams.has('download'))return Response.json({...r,content:c},{headers:{'Cache-Control':'private, no-store'}});
 const sections=[['Report',r.title],['Business',ctx.business.name],['Staff member',r.member_name],['Job role',r.member_job],['Report date',r.record_date],['Prepared by',r.author],['Status',r.status.toUpperCase()],['Filed at',r.filed_at||'Not filed'],...(r.kind==='writeup'?[['Issue level',c.issueLevel],['Observed facts',c.facts],['Expected policy or standard',c.standard],['Staff response',c.staffResponse],['Corrective actions',c.correctiveAction]]:[['Appraisal year',r.appraisal_year],['Review period',c.periodStart+' to '+c.periodEnd],...appraisalCriteria.map(criterion=>[criterion,c.ratings?.[criterion]||'Not rated']),['Strengths and achievements',c.strengths],['Areas for improvement',c.improvements],['Goals and target dates',c.goals],['Training and support',c.support]]),['Follow-up date',r.follow_up_date||'Not set'],['Follow-up results',r.follow_up_notes||'Not yet recorded'],['Follow-up recorded at',r.completed_at||'']];
 const text='CONFIDENTIAL STAFF RECORD\n\n'+sections.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([title,value])=>title+'\n'+value).join('\n\n')+'\n\nRetained in the staff file. No staff signature or acknowledgement is recorded by filing.\n';
 return new Response(text,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="'+cleanFilename(r.member_name+'-'+r.kind+'-'+r.record_date+'.txt')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){if(!(e instanceof AppError))console.error('Staff report retrieval failed',e);return Response.json({error:e instanceof AppError?e.message:'This staff report is temporarily unavailable.'},{status:e instanceof AppError?e.status:503,headers:{'Cache-Control':'no-store'}});}
}
