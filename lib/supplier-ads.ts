import {env} from 'cloudflare:workers';
import {SAS_PLACEMENT,SAS_PORTAL,validatedAds,type AdAudience,type SupplierFeed} from './supplier-ads-model';
function connection(){
 if(!env.SAS_APP_KEY||!env.SAS_APP_ID)return null;
 const url=new URL(env.SAS_URL||SAS_PORTAL);
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid advertising server configuration.');
 const headers:Record<string,string>={'X-SAS-App-Key':env.SAS_APP_KEY};
 if(env.SAS_SITE_ACCESS_TOKEN)headers['OAI-Sites-Authorization']='Bearer '+env.SAS_SITE_ACCESS_TOKEN;
 return {origin:url.origin,appId:env.SAS_APP_ID,headers};
}
export async function supplierFeed(audience:AdAudience):Promise<SupplierFeed>{
 const checkedAt=new Date().toISOString();
 try{
  const c=connection();if(!c)return {connected:false,status:'unconfigured',ads:[],speed:40,checkedAt};
  const url=new URL('/api/feed',c.origin);url.searchParams.set('app',c.appId);url.searchParams.set('audience',audience);url.searchParams.set('placement',SAS_PLACEMENT);
  const response=await fetch(url,{headers:c.headers,signal:AbortSignal.timeout(3000),cache:'no-store',redirect:'manual'});
  if(!response.ok)throw new Error('Advertising unavailable.');
  const data=await response.json() as {app?:string;preview?:boolean;ads?:unknown;settings?:{speed?:number}};
  if(data.app!==c.appId||data.preview!==false)throw new Error('Invalid advertising response.');
  const speed=typeof data.settings?.speed==='number'&&Number.isFinite(data.settings.speed)?Math.min(80,Math.max(20,data.settings.speed)):40;
  return {connected:true,status:'connected',ads:validatedAds(data.ads),speed,checkedAt};
 }catch(error){console.warn('Supplier feed unavailable:',error instanceof Error?error.message:'Request failed.');return {connected:false,status:'unavailable',ads:[],speed:40,checkedAt};}
}
export async function recordSupplierEvent(event:{id:string;campaignId:string;country:'CA'|'US';kind:'impression'|'click'},audience:AdAudience){
 try{
  const c=connection();if(!c)return false;
  const response=await fetch(new URL('/api/events',c.origin),{method:'POST',headers:{...c.headers,'Content-Type':'application/json'},body:JSON.stringify({...event,appId:c.appId,audience,placement:SAS_PLACEMENT,region:''}),signal:AbortSignal.timeout(3000),redirect:'manual'});
  return response.ok;
 }catch{return false;}
}
