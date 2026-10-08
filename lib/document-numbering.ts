import {AppError,owner,stmt,db,log,textField} from './store';
import type {DocumentNumberingMode} from './model';

function numberingMode(value:unknown):DocumentNumberingMode{
 if(value!=='automatic'&&value!=='custom')throw new AppError('Choose system-generated or custom control numbers.');
 return value;
}
export async function saveDocumentNumbering(ctx:any,data:any){
 owner(ctx);const mode=numberingMode(data.mode);
 await db().batch([
  stmt('UPDATE businesses SET document_numbering_mode=? WHERE id=?',mode,ctx.business.id),
  log(ctx.business.id,ctx.actor,'Document numbering settings saved',mode==='automatic'?'New documents and media receive unique system-generated control numbers. Existing numbers remain unchanged.':'New documents and media use business-entered control numbers. Existing numbers remain unchanged.')
 ]);
 ctx.business={...ctx.business,document_numbering_mode:mode};
}
export function checkDocumentNumbering(ctx:any,data:any){
 const mode=numberingMode(ctx.business.document_numbering_mode);
 if(data.numberingMode!==undefined&&numberingMode(data.numberingMode)!==mode)throw new AppError('Document numbering settings changed. Close and reopen the upload form before saving.',409);
 return mode;
}
export async function documentControlNumber(ctx:any,data:any){
 owner(ctx);const mode=checkDocumentNumbering(ctx,data);
 if(mode==='custom'){
  const code=textField(data.code,'a document or media control number',40);
  if(/^CDT-\d+$/i.test(code))throw new AppError('CDT followed by a number is reserved for system-generated control numbers. Choose automatic numbering or enter your business’s own format.');
  if(await stmt('SELECT id FROM documents WHERE business_id=? AND code=?',ctx.business.id,code).first())throw new AppError('This control number is already used by your business, including archived or deleted items. Enter a different number.',409);
  return {code,systemNumber:null};
 }
 // SQLite serializes this allocation. A platform-wide sequence and unique
 // system-number index protect simultaneous uploads across different businesses.
 // Existing custom numbers in the reserved format are skipped without renumbering.
 const allocated=await stmt("INSERT INTO document_control_numbers (id,created_at) SELECT MAX(COALESCE((SELECT MAX(id) FROM document_control_numbers),0),COALESCE((SELECT MAX(CAST(SUBSTR(TRIM(code),5) AS INTEGER)) FROM documents WHERE UPPER(TRIM(code)) GLOB 'CDT-[0-9]*' AND SUBSTR(TRIM(code),5) NOT GLOB '*[^0-9]*' AND LENGTH(TRIM(code))<=19),0))+1,? RETURNING id",new Date().toISOString()).first<{id:number}>();
 if(!allocated||!Number.isSafeInteger(allocated.id)||allocated.id<1)throw new AppError('A control number could not be generated. Please try again.',503);
 const code='CDT-'+String(allocated.id).padStart(8,'0');
 // Reservations are never deleted, including when a later upload fails.
 return {code,systemNumber:code};
}
