"use client";
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Pause,Play,Megaphone,ExternalLink,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {SAS_PORTAL,type SupplierAd,type SupplierFeed} from '@/lib/supplier-ads-model';
function Flag({country}:{country:string}){return <svg viewBox="0 0 30 20" className="ticker-flag" aria-hidden="true"><rect width="30" height="20" fill="#fff"/>{country==='Canada'?<><path d="M0 0h7.5v20H0zM22.5 0H30v20h-7.5z" fill="#d80621"/><path d="M15 3l1.1 3.1 1.8-1-.4 3 2.5-1.1-.7 2 1.5.8-3.9 3.3.6 1.3-3-.3V18h-1v-3.9l-3 .3.6-1.3-3.9-3.3 1.5-.8-.7-2 2.5 1.1-.4-3 1.8 1Z" fill="#d80621"/></>:<><path d="M0 .77h30M0 3.85h30M0 6.92h30M0 10h30M0 13.08h30M0 16.15h30M0 19.23h30" stroke="#b22234" strokeWidth="1.54"/><rect width="12" height="10.77" fill="#3c3b6e"/>{Array.from({length:9},(_,row)=>Array.from({length:row%2?5:6},(_,col)=><path key={row+'-'+col} d="m0-.42.1.29.3.01-.24.18.08.29L0 .17l-.24.18.08-.29-.24-.18.3-.01Z" transform={`translate(${1+col*2+(row%2?1:0)} ${.9+row*1.1})`} fill="#fff"/>))}</>}</svg>;}
export default function SupplierAdTicker({preview='owner',isOwner=true}:{preview?:string;isOwner?:boolean}){
 const [paused,setPaused]=useState(false),[feed,setFeed]=useState<SupplierFeed|null>(null),[reload,setReload]=useState(0),[loading,setLoading]=useState(true);
 const panel=useRef<HTMLElement>(null),seen=useRef(new Set<string>());
 const headers:Record<string,string>=preview==='owner'?{}:{'x-staff-preview':preview};
 function event(ad:Pick<SupplierAd,'id'|'country'>,kind:'impression'|'click'){
  void fetch('/api/supplier-ads/events',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),campaignId:ad.id,country:ad.country,kind}),keepalive:true}).catch(()=>{});
 }
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  seen.current.clear();setFeed(null);setLoading(true);
  async function refresh(){
   if(document.visibilityState==='hidden')return;
   try{
    const response=await fetch('/api/supplier-ads',{headers:preview==='owner'?{}:{'x-staff-preview':preview},cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('Supplier offers unavailable.');
    const data=await response.json() as SupplierFeed;if(active)setFeed(data);
   }catch{if(active&&!controller.signal.aborted)setFeed({connected:false,status:'unavailable',ads:[],speed:40,checkedAt:new Date().toISOString()});}
   finally{if(active)setLoading(false);}
  }
  void refresh();const timer=setInterval(()=>void refresh(),60000);
  const onVisibility=()=>{if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',onVisibility);
  return()=>{active=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);};
 },[preview,reload]);
 useEffect(()=>{
  if(!feed?.connected||!panel.current||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{
   if(document.visibilityState!=='visible')return;
   for(const entry of entries){if(!entry.isIntersecting||entry.intersectionRatio<.5)continue;
    const el=entry.target as HTMLElement,id=el.dataset.adId,country=el.dataset.country;
    if(id&&(country==='CA'||country==='US')&&!seen.current.has(id)){seen.current.add(id);event({id,country},'impression');}
   }
  },{threshold:.5});
  panel.current.querySelectorAll('[data-ad-id]').forEach(el=>observer.observe(el));return()=>observer.disconnect();
 },[feed,preview]);
 const empty=loading?'Loading supplier offers…':feed?.connected?'No live offers for this row yet. Approved CC SAS campaigns appear automatically.':'Supplier offers are temporarily unavailable.';
 return <section ref={panel} className={'supplier-ad-panel '+(paused?'ticker-paused':'')} aria-label="Supplier advertisements">
  <div className="supplier-ad-heading"><h2><Megaphone size={19}/>Supplier Ads</h2><span role="status">{loading?'Connecting to CC SAS…':feed?.connected?'Connected to CC SAS · Sponsored offers':'CC SAS connection unavailable'}</span><div className="supplier-ad-tools">
   {isOwner&&<a className="supplier-manage-link" href={SAS_PORTAL+'/?view=campaigns'} target="_blank" rel="noopener noreferrer">Manage in CC SAS <ExternalLink size={13}/></a>}
   <Button variant="ghost" size="sm" disabled={loading} aria-label="Refresh supplier offers" onClick={()=>setReload(n=>n+1)}><RefreshCw size={15}/></Button>
   <Button variant="ghost" size="sm" aria-label={paused?'Resume supplier ticker':'Pause supplier ticker'} aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?<Play size={15}/>:<Pause size={15}/>}<span>{paused?'Resume':'Pause'}</span></Button>
  </div></div>
  {(['CA','US'] as const).map(code=>{
   const country=code==='CA'?'Canada':'USA',items=feed?.ads.filter(a=>a.country===code)||[];
   const slots=items.length?Array.from({length:Math.max(1,Math.ceil(4/items.length))},()=>items).flat():[];
   return <div key={code} className={'supplier-ticker-row '+(code==='CA'?'ticker-canada':'ticker-usa')}><div className="ticker-country"><Flag country={country}/><b>{country}</b></div><div className="ticker-window">{items.length?<div className="supplier-ticker-track" style={{animationDuration:Math.max(12,slots.length*528/(feed?.speed||40))+'s'} as CSSProperties}>{[0,1].map(copy=><div className="ticker-group" key={copy} aria-hidden={copy===1?true:undefined}>{slots.map((ad,index)=><a className="ticker-offer" key={ad.id+'-'+index} data-ad-id={ad.id} data-country={ad.country} href={ad.url} target="_blank" rel="noopener noreferrer sponsored" tabIndex={copy||index>=items.length?-1:0} onClick={()=>event(ad,'click')} title={ad.supplier+' · '+ad.text+' · '+ad.currency}><Flag country={country}/><strong>{ad.supplier}</strong><span>{ad.text}</span><small>{ad.currency} · Explore →</small></a>)}</div>)}</div>:<p className="supplier-ticker-empty">{empty}</p>}</div></div>;
  })}
  <div className="supplier-ad-footer">Offers are provided by independent suppliers. View the supplier’s terms before purchasing.</div>
 </section>;
}
