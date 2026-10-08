import {supplierFeed} from '@/lib/supplier-ads';
export const dynamic='force-dynamic';
// Shared service diagnostics: no business, staff, document or credential data.
export async function GET(){
 const feed=await supplierFeed('owner');
 return Response.json({connected:feed.connected,status:feed.status,eligibleOffers:feed.ads.length,countries:{CA:feed.ads.filter(a=>a.country==='CA').length,US:feed.ads.filter(a=>a.country==='US').length},checkedAt:feed.checkedAt},{status:feed.connected?200:503,headers:{'Cache-Control':'no-store'}});
}
