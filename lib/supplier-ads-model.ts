export type AdAudience='owner'|'admin'|'staff';
export type SupplierAd={id:string;supplier:string;text:string;url:string;country:'CA'|'US';currency:'CAD'|'USD';sample:false};
export type SupplierFeed={connected:boolean;ads:SupplierAd[];speed:number;status:'connected'|'unavailable'|'unconfigured';checkedAt:string};
export const SAS_PLACEMENT='Dashboard ticker';
export const SAS_PORTAL='https://supplier-advertising-system.christ519.chatgpt.site';
export function safeOfferUrl(value:unknown):string|null{
 if(typeof value!=='string')return null;
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.toString():null;}catch{return null;}
}
export function validatedAds(value:unknown):SupplierAd[]{
 if(!Array.isArray(value))throw new Error('Invalid supplier feed.');
 const ids=new Set<string>();
 return value.slice(0,200).flatMap(ad=>{
  const url=safeOfferUrl(ad?.url);
  if(!ad||typeof ad.id!=='string'||!ad.id||ad.id.length>200||ids.has(ad.id)||typeof ad.supplier!=='string'||typeof ad.text!=='string'||ad.sample!==false||!url||!['CA','US'].includes(ad.country)||ad.currency!==(ad.country==='CA'?'CAD':'USD'))return [];
  ids.add(ad.id);return [{id:ad.id,supplier:ad.supplier.slice(0,200),text:ad.text.slice(0,300),url,country:ad.country,currency:ad.currency,sample:false}];
 });
}
