"use client";
import {useEffect,useState} from 'react';
import {Camera,Upload} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {shiftDate,type Certification,type CertificationType} from '@/lib/model';
export default function CertificatePhotoForm({previous,prefill,definition,today,busy,save}:{previous?:Certification;definition?:CertificationType;prefill?:{title:string;memberId:string;needId?:string;reminderDays:number};today:string;busy:boolean;save:(f:FormData)=>Promise<void>}){
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[confirmed,setConfirmed]=useState(false),[requestId]=useState(()=>crypto.randomUUID());
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return ()=>URL.revokeObjectURL(url);},[file]);
 return <form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);f.set('requestId',requestId);f.set('confirmed',String(confirmed));if(previous)f.set('replacesId',previous.id);if(prefill?.needId)f.set('needId',prefill.needId);if(file)f.set('file',file);await save(f);}}>
  <div className="form-note"><strong>{definition?.name||prefill?.title||previous?.title}</strong>{definition?.description&&<p className="certification-description">{definition.description}</p>}<p>Your certificate photo is saved in your staff certification history.</p></div>
  <label className="upload-zone certificate-camera"><Camera size={28}/><strong>{file?.name||'Take or choose a certificate photo'}</strong><span>JPG, PNG, or WebP · up to 10 MB · show the full certificate clearly</span><Input aria-label="New certificate photo" name="photo" type="file" required accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
  {preview&&<img className="certificate-photo-preview" src={preview} alt="Your selected certificate photo"/>}
  <label className="field"><span>Issuing organization</span><Input name="issuer" required maxLength={300} defaultValue={previous?.issuer||''}/></label>
  <label className="field"><span>Certificate / registration number</span><Input name="number" maxLength={100}/></label>
  <div className="form-grid"><label className="field"><span>Issued date</span><Input name="issuedAt" type="date" required max={today} defaultValue={today}/></label><label className="field"><span>Expiry date</span><Input name="expiresAt" type="date" required min={today} defaultValue={shiftDate(today,365)}/></label></div>
  <label className="check-row"><Checkbox checked={confirmed} onCheckedChange={v=>setConfirmed(v===true)}/>The photo shows my certificate and the details above are correct.</label>
  <p className="form-note">A photo and valid dates are required. A scheduled recertification course needs a certificate issued on or after its start date.</p><div className="dialog-actions"><Button type="submit" disabled={busy||!file||!confirmed}><Upload size={16}/>{busy?'Uploading…':'Submit certificate photo'}</Button></div>
 </form>;
}
