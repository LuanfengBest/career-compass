import {drafts} from './portal';
import {sendPortalDraft} from './portal-mail';
import {userTaskAction} from './task-actions';
import {readWorkspace} from './database';
import {HttpError} from './http';
type Approved = {id:string;version:number;recipient:string};
export async function sendApprovedDrafts(input:unknown, transports={email:sendPortalDraft,linkedin:userTaskAction}){
 if(!Array.isArray(input)||input.length<1||input.length>20)throw new HttpError(400,'Review and select 1–20 drafts.');
 const selected:Approved[]=input;const current=drafts();const identities=new Set<string>();
 const records=selected.map(item=>{
  if(!item||typeof item.id!=='string'||!Number.isSafeInteger(item.version))throw new HttpError(400,'Invalid selected draft.');
  const d=current.find(x=>x.id===item.id);
  if(!d||d.status!=='draft'||d.version!==item.version)throw new HttpError(409,'A selected draft changed. Refresh and review the current text.');
  const c=readWorkspace().workspace.contacts.find(c=>c.id===d.contactId);
  const recipient=d.channel==='email' ? (d.recipient||c?.email) : c?.linkedin;
  if(!recipient||item.recipient!==recipient)throw new HttpError(409,'A recipient changed. Review it again before sending.');
  // One contact per approval batch avoids accidental cross-channel double contact.
  if(identities.has(d.contactId))throw new HttpError(409,'Choose one message per contact in each approval batch.');
  identities.add(d.contactId);return d;
 });
 const results:{id:string;status:string;message:string}[]=[];
 for(const d of records){
  try{
   if(d.channel==='email')await transports.email(d.id,d.version);
   else await transports.linkedin({action:'queue_linkedin',draftId:d.id,version:d.version});
   results.push({id:d.id,status:d.channel==='email'?'sent':'queued',message:d.channel==='email'?'Gmail accepted the send; delivery is not confirmed.':'Queued for the assigned agent; not sent yet.'});
  }catch(e){
   results.push({id:d.id,status:'attention',message:e instanceof HttpError?e.message:'Outcome needs review. Check the original record before retrying.'});
   for(const rest of records.slice(results.length))results.push({id:rest.id,status:'not_attempted',message:'Batch stopped; no automatic retry.'});
   break;
  }
 }
 return {results};
}
