"use client";
import {useState} from 'react';
import {Mail,Send,Eye,RefreshCw,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Checkbox} from '@/components/ui/checkbox';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from '@/components/ui/empty';
import type {AppState,StaffMessage,Member} from '@/lib/model';
type Save=(body:any,message:string)=>Promise<any>;
function timestamp(value:string,timeZone:string){return new Intl.DateTimeFormat('en-CA',{timeZone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));}

export default function StaffMessages({data,memberId='all',save,refresh}:{data:AppState;memberId?:string;save:Save;refresh?:()=>Promise<void>}){
 const owner=data.me.role==='owner',staff=data.members.filter(m=>m.role==='staff'),active=staff.filter(m=>m.active);
 const [filter,setFilter]=useState('all'),[modal,setModal]=useState<{kind:'compose'|'message';id?:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const messages=(data.messages||[]).filter(m=>!owner||memberId==='all'||m.recipients.some(r=>r.member_id===memberId));
 const ownReceipt=(m:StaffMessage)=>m.recipients.find(r=>r.member_id===data.me.id);
 const visible=messages.filter(m=>owner||filter==='all'||(filter==='unread'?!ownReceipt(m)?.read_at:!!ownReceipt(m)?.read_at));
 const selected=modal?.id?data.messages.find(m=>m.id===modal.id):undefined;
 const selectedMember=staff.find(m=>m.id===memberId);
 const act=async(body:any,message:string)=>{setBusy(true);setError('');try{const r=await save(body,message);if(!r)setError('The change could not be saved. Your message is still available here.');return r;}finally{setBusy(false);}};
 const openMessage=async(m:StaffMessage)=>{setError('');setModal({kind:'message',id:m.id});if(!owner&&!ownReceipt(m)?.read_at)await act({action:'readStaffMessage',messageId:m.id},'');};
 return <section className="panel message-panel">
  <div className="panel-heading"><div><h2>{owner?(selectedMember?'Messages to '+selectedMember.name:'Staff messages'):'Your messages'}</h2><p>{owner?'Send updates to selected staff or all active staff.':'Updates from your business owner, delivered in your staff portal.'}</p></div>{owner?<Button disabled={!active.length} onClick={()=>{setError('');setModal({kind:'compose'});}}><Send size={15}/>New bulk message</Button>:refresh&&<Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await refresh();}finally{setBusy(false);}}}><RefreshCw size={15}/>Refresh</Button>}</div>
  {!owner&&<div className="message-filters"><Tabs value={filter} onValueChange={setFilter}><TabsList variant="line"><TabsTrigger value="all">All messages</TabsTrigger><TabsTrigger value="unread">Unread <span className="tab-count">{messages.filter(m=>!ownReceipt(m)?.read_at).length}</span></TabsTrigger><TabsTrigger value="read">Read</TabsTrigger></TabsList></Tabs></div>}
  {visible.length?<Table className="records-table message-table"><TableHeader><TableRow><TableHead>Message</TableHead><TableHead>Sent</TableHead>{owner?<><TableHead>Recipients</TableHead><TableHead>Opened</TableHead></>:<TableHead>Status</TableHead>}<TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{visible.map(m=><TableRow key={m.id} className={!owner&&!ownReceipt(m)?.read_at?'unread-message':''}><TableCell><button className="message-subject" onClick={()=>void openMessage(m)}><Mail size={17}/><strong>{m.subject}</strong></button><small className="message-preview">{m.body.slice(0,130)}{m.body.length>130?'…':''}</small>{!owner&&<small>From {m.sender}</small>}</TableCell><TableCell><time dateTime={m.sent_at}>{timestamp(m.sent_at,data.business.timezone)}</time></TableCell>{owner?<><TableCell>{m.recipients.length} staff<small>{m.audience==='all'?'All active staff at send time':'Selected staff'}</small></TableCell><TableCell>{m.recipients.filter(r=>r.read_at).length}/{m.recipients.length}</TableCell></>:<TableCell><span className={'pill '+(ownReceipt(m)?.read_at?'neutral':'warn')}>{ownReceipt(m)?.read_at?'Read':'Unread'}</span></TableCell>}<TableCell><Button variant="outline" size="sm" onClick={()=>void openMessage(m)}><Eye size={14}/>Open message</Button></TableCell></TableRow>)}</TableBody></Table>:<Empty><EmptyHeader><Mail className="muted" size={30}/><EmptyTitle>{owner?'No sent messages in this staff file':filter==='unread'?'You’re caught up':'No messages in this view'}</EmptyTitle><EmptyDescription>{owner?'Create a message, choose recipients, and send it to their staff portals.':'Messages sent to you will appear here. Refresh to check for new updates.'}</EmptyDescription></EmptyHeader></Empty>}
  {owner&&<div className="panel-footnote"><Users size={15}/>Sent messages remain in each recipient’s staff file. The recipient list is fixed when sent; read times show when a message was opened.</div>}
  <Dialog open={!!modal} onOpenChange={v=>{if(!v&&!busy)setModal(null);}}><DialogContent className="app-dialog staff-message-dialog"><DialogHeader><DialogTitle>{modal?.kind==='compose'?'Send a staff message':selected?.subject}</DialogTitle><DialogDescription>{modal?.kind==='compose'?'Choose recipients and review your message before sending.':selected?'From '+selected.sender+' · '+timestamp(selected.sent_at,data.business.timezone):'Staff message'}</DialogDescription></DialogHeader>
   {error&&<p className="error-message" role="alert">{error}</p>}
   {modal?.kind==='compose'&&<MessageComposer staff={active} initialMemberId={memberId} busy={busy} send={async(body)=>{const r=await act(body,'Message sent to the selected staff portals.');if(r)setModal(null);}}/>}
   {modal?.kind==='message'&&selected&&<>
    <div className="message-body">{selected.body}</div>
    {owner?<div className="message-receipts"><h3>Recipient delivery & read status</h3><p>{selected.audience==='all'?'All active staff at send time':'Selected staff'} · {selected.recipients.length} recipients</p><ul>{selected.recipients.map(r=>{const m=staff.find(s=>s.id===r.member_id);return <li key={r.member_id}><span><b>{m?.name||'Former staff'}</b><small>{m?.sample?'Example staff':!m?.active?'Inactive staff':!m?.user_id?'Staff invitation pending':m.job}</small></span><span>{r.read_at?'Opened '+timestamp(r.read_at,data.business.timezone):'Available in staff portal · Unread'}</span></li>;})}</ul></div>:<div className="message-read-note">{ownReceipt(selected)?.read_at?<p>Opened {timestamp(ownReceipt(selected)!.read_at!,data.business.timezone)}</p>:<Button disabled={busy} variant="outline" onClick={()=>void act({action:'readStaffMessage',messageId:selected.id},'')}>{busy?'Saving read status…':'Mark as read'}</Button>}</div>}
   </>}
  </DialogContent></Dialog>
 </section>;
}

function MessageComposer({staff,initialMemberId,busy,send}:{staff:Member[];initialMemberId:string;busy:boolean;send:(body:any)=>Promise<void>}){
 const [audience,setAudience]=useState('selected'),[selected,setSelected]=useState<string[]>(staff.some(m=>m.id===initialMemberId)?[initialMemberId]:[]),[query,setQuery]=useState(''),[requestId]=useState(()=>crypto.randomUUID());
 const recipients=audience==='all'?staff:staff.filter(m=>selected.includes(m.id));
 const shown=staff.filter(m=>(m.name+' '+m.job).toLowerCase().includes(query.toLowerCase()));
 return <form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await send({action:'sendStaffMessage',requestId,audience,memberIds:selected,subject:f.get('subject'),body:f.get('body')});}}>
  <Tabs value={audience} onValueChange={v=>{if(!busy)setAudience(v);}}><TabsList><TabsTrigger value="selected" disabled={busy}>Selected staff</TabsTrigger><TabsTrigger value="all" disabled={busy}>All active staff ({staff.length})</TabsTrigger></TabsList></Tabs>
  {audience==='selected'?<><div className="message-recipient-controls"><Input aria-label="Find message recipients" placeholder="Find staff by name or role…" value={query} onChange={e=>setQuery(e.target.value)} disabled={busy}/><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>setSelected(staff.map(m=>m.id))}>Select all</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>setSelected([])}>Clear</Button></div><div className="staff-picker message-recipient-picker">{shown.map(m=><label className="staff-option" key={m.id}><Checkbox disabled={busy} checked={selected.includes(m.id)} onCheckedChange={v=>setSelected(v?[...selected,m.id]:selected.filter(id=>id!==m.id))}/><span><b>{m.name}</b><small>{m.job}{m.sample?' · Example staff':!m.user_id?' · Invitation pending':''}</small></span></label>)}{!shown.length&&<p className="muted">No matching staff.</p>}</div></>:<div className="form-note"><b>All {staff.length} active staff</b><p>{staff.map(m=>m.name).join(', ')}</p></div>}
  <div className="message-recipient-summary"><b>{recipients.length} recipient{recipients.length===1?'':'s'} selected</b>{audience==='selected'&&recipients.length>0&&<p>{recipients.map(m=>m.name).join(', ')}</p>}</div>
  <label className="field"><span>Subject</span><Input name="subject" required maxLength={200} placeholder="e.g. Team update or training reminder" disabled={busy}/></label>
  <label className="field"><span>Message</span><Textarea name="body" required maxLength={12000} rows={7} placeholder="Write the update, expectations, or information you want to share." disabled={busy}/></label>
  <p className="form-note">Delivery is in the staff portal. Email and SMS delivery are not connected. Read status records opening the message; document training acknowledgements remain separate.</p>
  <div className="dialog-actions"><span className="muted">{recipients.length} staff portals</span><Button disabled={busy||!recipients.length} type="submit"><Send size={15}/>{busy?'Sending…':'Send to '+recipients.length+' staff'}</Button></div>
 </form>;
}
