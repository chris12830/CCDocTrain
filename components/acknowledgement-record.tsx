import type {Training} from '@/lib/model';

export default function AcknowledgementRecord({record,currentRevisionId,timeZone}:{record?:Training;currentRevisionId?:string|null;timeZone:string}){
 if(!record?.acknowledged_at)return <span className="acknowledgement-empty">Not yet acknowledged</span>;
 const timestamp=new Intl.DateTimeFormat('en-CA',{timeZone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(record.acknowledged_at));
 return <div className="acknowledgement-record"><time dateTime={record.acknowledged_at}>{timestamp}</time><small>Revision {record.revision_version} · {record.revision_id===currentRevisionId?'Current revision':currentRevisionId?'Earlier revision':'Historical revision'}</small></div>;
}
