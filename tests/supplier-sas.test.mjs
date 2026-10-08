import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

// Exercise both built Workers against isolated databases; never published data.
const root=fileURLToPath(new URL('..',import.meta.url));
const sasRoot=process.env.SAS_TEST_PROJECT_PATH||path.resolve(root,'../supplier-advertising-system');
const require=createRequire(root+'/package.json'),mfRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=await import(mfRequire.resolve('miniflare'));
function options(dir){return {modules:fs.readdirSync(dir+'/dist/server',{recursive:true}).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(f=>({type:'ESModule',path:dir+'/dist/server/'+f})),modulesRoot:dir+'/dist/server',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs'],fallthrough:true}]};}
const key='sas_local_integration_test_only';
const sas=new Miniflare({...options(sasRoot),bindings:{SAS_DOCTRAIN_APP_KEY:key}});
let upstream='normal',captured=[];
const doc=new Miniflare({...options(root),r2Buckets:['BUCKET'],bindings:{SAS_URL:'https://sas.test',SAS_APP_ID:'doctrain',SAS_APP_KEY:key},outboundService:async request=>{
 const url=new URL(request.url);assert.equal(url.origin,'https://sas.test');
 const body=request.method==='POST'?await request.text():undefined;
 captured.push({path:url.pathname,params:Object.fromEntries(url.searchParams),body:body?JSON.parse(body):null});
 if(upstream==='failure')return new Response('Unavailable',{status:503});
 if(upstream==='redirect')return new Response(null,{status:302,headers:{Location:'https://elsewhere.test'}});
 if(upstream==='wrong-app')return Response.json({app:'owners',ads:[],preview:false});
 if(upstream==='unsafe')return Response.json({app:'doctrain',preview:false,ads:[{id:'unsafe',supplier:'Unsafe',text:'Invalid destination',url:'javascript:alert(1)',country:'CA',currency:'CAD',sample:false},{id:'sample',supplier:'Example',text:'Example',url:'https://example.test',country:'CA',currency:'CAD',sample:true}]});
 return sas.dispatchFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),body});
}});
const sasOwner={'oai-authenticated-user-id':'sas-owner-test','oai-authenticated-user-email':'owner@example.test'},docOwner={'oai-authenticated-user-id':'doc-owner-test','oai-authenticated-user-email':'owner@example.test'};
async function call(worker,url,headers={},body){const response=await worker.dispatchFetch(url,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
async function migrations(worker,dir){const db=await worker.getD1Database('DB');for(const f of fs.readdirSync(dir+'/drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync(dir+'/drizzle/'+f,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql.trim()).run();return db;}
function pass(message){console.log('PASS '+message);}
try{
 const sasDb=await migrations(sas,sasRoot);await migrations(doc,root);
 let state=await call(sas,'https://sas.test/api/state',sasOwner);assert.equal(state.status,200);assert.equal(state.data.state.apps.find(a=>a.id==='doctrain').hasKey,true);assert(!JSON.stringify(state.data).includes(key));assert(!JSON.stringify(state.data).includes('integrationHash'));
 assert.equal((await call(sas,'https://sas.test/api/feed?app=doctrain',{'X-SAS-App-Key':'wrong'})).status,401);
 assert.equal((await call(sas,'https://sas.test/api/feed?app=owners',{'X-SAS-App-Key':key})).status,401);
 assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads')).status,401);
 let feed=await call(doc,'https://doctrain.test/api/supplier-ads',docOwner);assert.equal(feed.status,200);assert.equal(feed.data.connected,true,JSON.stringify({feed:feed.data,captured}));assert.equal(feed.data.ads.length,0);assert(!JSON.stringify(feed.data).includes(key));
 const health=await call(doc,'https://doctrain.test/api/supplier-ads/health');assert.equal(health.status,200);assert.equal(health.data.connected,true);assert.equal(health.data.eligibleOffers,0);assert.equal(health.data.ads,undefined);
 assert((await sasDb.prepare('SELECT last_seen FROM sas_connections WHERE app_id=?').bind('doctrain').first()).last_seen);
 pass('server secrets provision only DocTrain; authenticated requests register the connection and exclude samples');

 const raw=await sasDb.prepare('SELECT data FROM sas_networks WHERE id=?').bind('main').first();
 let network=JSON.parse(raw.data);for(const supplier of network.suppliers)supplier.sample=false;for(const campaign of network.campaigns)campaign.sample=false;
 async function save(){await sasDb.prepare('UPDATE sas_networks SET data=?,version=version+1 WHERE id=?').bind(JSON.stringify(network),'main').run();}
 await save();feed=await call(doc,'https://doctrain.test/api/supplier-ads',docOwner);assert.equal(feed.data.ads.length,4);assert.deepEqual([...new Set(feed.data.ads.map(a=>a.country))].sort(),['CA','US']);assert(feed.data.ads.every(a=>a.sample===false));
 const workspace=await call(doc,'https://doctrain.test/api/workspace',docOwner),staff=workspace.data.members.find(m=>m.role==='staff');
 const preview={...docOwner,'x-staff-preview':staff.id};
 const staffFeed=await call(doc,'https://doctrain.test/api/supplier-ads?audience=owner',preview);assert.equal(staffFeed.status,200);assert.equal(staffFeed.data.ads.length,0);
 assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads',{...docOwner,'x-staff-preview':'foreign'})).status,403);
 network.apps.find(a=>a.id==='doctrain').audiences.push('staff');await save();assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads',preview)).data.ads.length,4);
 pass('Canada/USA campaigns reach the ticker; staff audience is derived by the server and cannot be overridden');

 const offer=feed.data.ads[0],event={id:randomUUID(),campaignId:offer.id,country:offer.country,kind:'impression'};
 assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads/events',docOwner,event)).data.recorded,true);
 assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads/events',docOwner,event)).data.recorded,true);
 const click={...event,id:randomUUID(),kind:'click'};assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads/events',docOwner,click)).data.recorded,true);
 assert.equal((await sasDb.prepare('SELECT COUNT(*) AS n FROM sas_events').first()).n,2);
 assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads/events',{},event)).status,401);
 assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads/events',{...docOwner,origin:'https://untrusted.test'},event)).status,403);
 assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads/events',docOwner,{...event,appId:'owners'})).status,400);
 assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads/events',docOwner,{...event,campaignId:'ad-play',id:randomUUID()})).data.recorded,false);
 assert(captured.every(r=>!JSON.stringify(r).includes(staff.name)&&!JSON.stringify(r).includes('business_id')&&!JSON.stringify(r).includes('owner@example.test')));
 pass('impressions/clicks reach SAS once per event; ineligible ads, spoofed context and cross-origin writes are rejected');

 const campaign=network.campaigns.find(c=>c.id===offer.id),supplier=network.suppliers.find(s=>s.id===campaign.supplierId);
 for(const change of ['paused','unpaid','expired','removed']){
  campaign.status='published';supplier.billingStatus='active';campaign.end='2027-12-31';campaign.appIds=['owners','doctrain'];
  if(change==='paused')campaign.status='paused';if(change==='unpaid')supplier.billingStatus='past_due';if(change==='expired')campaign.end='2020-01-01';if(change==='removed')campaign.appIds=['owners'];
  await save();assert(!(await call(doc,'https://doctrain.test/api/supplier-ads',docOwner)).data.ads.some(a=>a.id===offer.id));
 }
 network.settings.paused=true;await save();feed=await call(doc,'https://doctrain.test/api/supplier-ads',docOwner);assert.equal(feed.data.connected,true);assert.equal(feed.data.ads.length,0);
 pass('central campaign pauses, payments, expiry, targeting and network pause immediately govern new feed requests');

 for(const mode of ['failure','wrong-app','redirect']){upstream=mode;feed=await call(doc,'https://doctrain.test/api/supplier-ads',docOwner);assert.equal(feed.status,200);assert.equal(feed.data.connected,false);assert.equal(feed.data.ads.length,0);}
 upstream='unsafe';feed=await call(doc,'https://doctrain.test/api/supplier-ads',docOwner);assert.equal(feed.data.connected,true);assert.equal(feed.data.ads.length,0);
 upstream='normal';network.settings.paused=false;await save();state=await call(sas,'https://sas.test/api/state',sasOwner);
 const rotated=await call(sas,'https://sas.test/api/action',sasOwner,{action:'generate_key',input:{id:'doctrain'},version:state.data.version});assert.equal(rotated.status,200);assert.equal(typeof rotated.data.key,'string');
 assert.equal((await call(sas,'https://sas.test/api/feed?app=doctrain',{'X-SAS-App-Key':key})).status,401);
 assert.equal((await call(sas,'https://sas.test/api/feed?app=doctrain',{'X-SAS-App-Key':rotated.data.key})).status,200);
 assert.equal((await call(doc,'https://doctrain.test/api/supplier-ads',docOwner)).data.connected,false);
 pass('outages/redirects fail without blocking DocTrain, unsafe destinations are excluded, and key rotation revokes the initial key');
}finally{await doc.dispose();await sas.dispose();}
