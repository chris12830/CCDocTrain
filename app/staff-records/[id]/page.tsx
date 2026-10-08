import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {context,stmt} from '@/lib/store';
import {StaffReport} from '@/components/staff-report';
import {type StaffRecord} from '@/lib/model';
export const dynamic='force-dynamic';
export default async function StaffReportPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Report id={id}/>;}
async function Report({id}:{id:string}){
 await requireChatGPTUser('/staff-records/'+id);const ctx=await context();
 if(ctx.actor.role!=='owner')return <main className="report-unavailable"><h1>Owner access required</h1><p>Personnel records are available in the Business Owner Portal.</p><a href="/">Return to workspace</a></main>;
 const raw=await stmt('SELECT * FROM staff_records WHERE id=? AND business_id=?',id,ctx.business.id).first<any>();
 if(!raw)return <main className="report-unavailable"><h1>Report unavailable</h1><a href="/?view=stafffiles">Return to staff files</a></main>;
 const m=await stmt('SELECT * FROM members WHERE id=? AND business_id=?',raw.member_id,ctx.business.id).first<any>();
 if(!m)return <main className="report-unavailable"><h1>Report unavailable</h1></main>;
 const record={...raw,content:JSON.parse(raw.content)} as StaffRecord;
 return <main className="print-staff-report"><div className="print-report-controls"><a className="button-link" href="/?view=stafffiles">Return to staff files</a><a className="button-link" href={'/api/staff-records/'+raw.id+'?download=1'}>Download text report</a><p>Use your browser’s Print command (Ctrl+P or Cmd+P) to print or save as PDF.</p></div><StaffReport record={record} member={m} businessName={ctx.business.name}/></main>;
}
