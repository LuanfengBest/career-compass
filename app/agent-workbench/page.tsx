"use client";
import {useState,useEffect,useRef,useCallback} from 'react';
import Link from 'next/link';
import {Heading} from '../components/ui';
import {recoverableClaimKind} from '../lib/tasks';
import {prepareDiscoveryCompletion,prepareWorkbenchRequest,readWorkbenchClaim,redactWorkbenchResponse,type WorkbenchClaim} from '../lib/workbench';
type QueueTask = {id:string;owner:string;kind:string;status:string;title:string;version:number;leaseUntil?:string};
const claimKey='career-workbench-private-claim';
async function request(url:string,method='GET',value?:unknown) {
 const r=await fetch(url,{method,headers:method==='POST'?{'Content-Type':'application/json'}:undefined,body:value===undefined?undefined:JSON.stringify(value),cache:'no-store'});
 const v=await r.json();if(!r.ok)throw Error(`${r.status}: ${v.error || 'Request failed'}`);return v;
}
export default function Page(){
 const [actor,setActor]=useState<string|null>(null),[choice,setChoice]=useState('muse');
 const [output,setOutput]=useState(''),[payload,setPayload]=useState(''),[endpoint,setEndpoint]=useState('/api/agents');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[tasks,setTasks]=useState<QueueTask[]>([]);
 const [queueAt,setQueueAt]=useState('');
 const [submitError,setSubmitError]=useState(''),[submitStatus,setSubmitStatus]=useState(''),[formats,setFormats]=useState('');
 const [claim,setClaim]=useState<WorkbenchClaim|null>(null),[paused,setPaused]=useState(false),[lastRenewed,setLastRenewed]=useState('');
 const active=useRef<WorkbenchClaim|null>(null);
 const [completionSummary,setCompletionSummary]=useState(''),[coverage,setCoverage]=useState('');
 const completionAttempt=useRef({key:'',eventId:''});
 const remember=useCallback((c:WorkbenchClaim|null)=>{
  active.current=c;setClaim(c);
  try{if(c)sessionStorage.setItem(claimKey,JSON.stringify(c));else sessionStorage.removeItem(claimKey);}catch{/* Current tab can still retain the claim in memory. */}
 },[]);
 function show(v:unknown){setOutput(JSON.stringify(redactWorkbenchResponse(v),null,2));}
 const renew=useCallback(async()=>{
  const c=active.current;if(!c)return;
  try{
   if(Date.parse(c.leaseUntil)<=Date.now())throw Error('The claim expired. Request requeue; renewal cannot revive it.');
   const v=await request('/api/agents/tasks','POST',{action:'heartbeat',eventId:crypto.randomUUID(),taskId:c.id,claimToken:c.claimToken});
   if(active.current?.claimToken!==c.claimToken)return;
   remember({...c,leaseUntil:v.leaseUntil});setPaused(false);setLastRenewed(new Date().toISOString());setError('');
  }catch(e){if(active.current?.claimToken===c.claimToken){setPaused(true);const message=e instanceof Error?e.message:'Renewal failed.';if(message.includes('CLAIM_TOKEN_MISMATCH')||message.includes('CLAIM_NOT_ACTIVE'))remember(null);setError(message);}}
 },[remember]);
 useEffect(()=>{
  let cancelled=false;
  (async()=>{
   const session=await request('/api/agent-session');if(cancelled)return;setActor(session.actor);
   if(!session.actor){remember(null);return;}
   const queue=await request('/api/agents/tasks');if(cancelled)return;setTasks(queue.tasks);setActor(queue.actor);setQueueAt(queue.checkedAt);
   let saved:WorkbenchClaim|null=null;
   try{saved=readWorkbenchClaim(JSON.parse(sessionStorage.getItem(claimKey)||'null'));}catch{}
   const current=queue.tasks.find((t:QueueTask)=>t.id===saved?.id);
   if(saved&&saved.owner===queue.actor&&current?.status==='claimed'&&Date.parse(current.leaseUntil||'')>Date.now()){
    remember({...saved,leaseUntil:current.leaseUntil});await renew();
   }else remember(null);
  })().catch(e=>{if(!cancelled)setError(e.message);});
  return()=>{cancelled=true;};
 },[remember,renew]);
 useEffect(()=>{
  if(!claim||paused)return;
  const tick=setInterval(()=>void renew(),120000);
  const visible=()=>{if(document.visibilityState==='visible')void renew();};
  document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(tick);document.removeEventListener('visibilitychange',visible);};
 },[claim,paused,renew]);
 async function perform(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function refresh(){
  const v=await request('/api/agents/tasks');
  if(v.actor!=='dot'&&v.actor!=='muse')throw Error('Queue identity unavailable. Reload this page.');
  const c=active.current, current=v.tasks.find((t:QueueTask)=>t.id===c?.id);
  if(c&&(c.owner!==v.actor||current?.status!=='claimed')){remember(null);setPaused(false);}
  setActor(v.actor);setTasks(v.tasks);setQueueAt(v.checkedAt);
  show({actor:v.actor,checkedAt:v.checkedAt,queuedCount:v.tasks.filter((t:QueueTask)=>t.status==='queued').length,tasks:v.tasks.map((t:QueueTask)=>({id:t.id,owner:t.owner,kind:t.kind,status:t.status,title:t.title})),discoveryCount:v.discoveries.length});
 }
 async function acceptClaim(v:Record<string,unknown>){
  const c=readWorkbenchClaim(v.task);if(!c||c.owner!==actor)throw Error('Claim response is incomplete or belongs to another agent.');
  remember(c);setPaused(false);show({ok:true,taskId:c.id,owner:c.owner,kind:c.kind,leaseUntil:c.leaseUntil,credentials:'Saved privately in this tab; do not copy a token.'});
  await renew();
 }
 async function recover(t:QueueTask){
  if(active.current)throw Error('Finish your current task before recovering another.');
  const v=await request('/api/agents/tasks','POST',{action:'recover_claim',taskId:t.id,version:t.version,stopPreviousContext:true});
  await acceptClaim(v);
  setSubmitError('');setSubmitStatus('Claim recovered here. Old tabs cannot renew or submit. Continue with the same record eventIds and read back existing receipts.');
 }
 async function submit(){
  setSubmitError('');setSubmitStatus('Submitting…');
  try {
  if(paused)throw Error('Renewal is paused. Resolve the error and renew before submitting.');
  const value=prepareWorkbenchRequest(endpoint,JSON.parse(payload),active.current,actor||'');
  if(['claim','recover_claim'].includes(String(value.action))&&endpoint==='/api/agents/tasks'&&active.current)throw Error('Finish the current claim before claiming another task.');
  const v=await request(endpoint,'POST',value);
  if(endpoint==='/api/agents/tasks'&&['claim','recover_claim'].includes(String(value.action))){await acceptClaim(v);setSubmitStatus('Claim ready; prepare your record.');return;}
  show(v);setSubmitStatus('Server receipt received. Read back the saved record before marking discovery complete.');
  if(endpoint==='/api/agents/tasks'&&value.action==='heartbeat'&&active.current)remember({...active.current,leaseUntil:v.leaseUntil});
  if(endpoint==='/api/agents/tasks'&&value.action==='report'){remember(null);setPaused(false);setTasks((await request('/api/agents/tasks')).tasks);}
  } catch(e) {
   const message=e instanceof Error?e.message:'Submission failed';
   setSubmitError(message);setSubmitStatus('');show({ok:false,endpoint,error:message});
  }
 }
 async function completeDiscovery(){
  setSubmitError('');setSubmitStatus('Submitting discovery completion…');
  try {
   if(paused)throw Error('Resolve renewal before completing discovery.');
   const key=JSON.stringify([active.current?.id,completionSummary,coverage]);
   if(completionAttempt.current.key!==key)completionAttempt.current={key,eventId:crypto.randomUUID()};
   const value=prepareDiscoveryCompletion(active.current,actor||'',{eventId:completionAttempt.current.eventId,summary:completionSummary,coverage});
   const v=await request('/api/agents/tasks','POST',value);
   show(v);remember(null);setPaused(false);setSubmitStatus('Discovery completion saved. Check my queue to view execution assignments.');
   setTasks((await request('/api/agents/tasks')).tasks);
  }catch(e){const message=e instanceof Error?e.message:'Completion failed';setSubmitError(message);setSubmitStatus('');show({ok:false,endpoint:'/api/agents/tasks',action:'report',taskId:active.current?.id,error:message});}
 }
 return <><Heading eyebrow="BROWSER ACCESS" title="Agent workbench" description="Claim tasks and report results. The workbench carries your claim token privately and renews while this tab stays open."/>
 <section className="panel"><h2>{actor?`Browser paired as ${actor}`:'Pair this browser'}</h2><p>Browser authorization lasts 12 hours. Use this agent&apos;s dedicated browser profile. This does not start a personal agent or authorize sending.</p>
 {!actor?<div className="button-row"><label>Agent<select value={choice} onChange={e=>setChoice(e.target.value)}><option value="muse">Muse</option><option value="dot">Dot</option></select></label><button disabled={busy} className="button primary" onClick={()=>void perform(async()=>{await request('/api/agent-session','POST',{actor:choice});remember(null);setActor(choice);await refresh();})}>Authorize this browser</button></div>:<button disabled={busy} className="button secondary" onClick={()=>void perform(async()=>{await request('/api/agent-session','POST',{action:'disconnect'});remember(null);setActor(null);})}>End browser session</button>}
 </section>
 {actor&&<>
 <section className="panel"><h2>1. Claim your task</h2><div className="button-row"><button disabled={busy} className="button secondary" onClick={()=>void perform(refresh)}>Check my queue</button><button disabled={busy} className="button secondary" onClick={()=>void perform(async()=>show(await request('/api/agents')))}>Read shared context</button><button disabled={busy} className="button secondary" onClick={()=>void perform(async()=>show(await request('/api/agents/guide')))}>Read API guide</button></div>
 <p aria-live="polite">Queue identity: <strong>{actor}</strong> · Last checked: {queueAt?new Date(queueAt).toLocaleString():'Not checked'} · <strong>{tasks.filter(t=>t.owner===actor&&t.status==='queued').length} queued</strong></p>
 {!claim?<div>{tasks.filter(t=>t.owner===actor).map(t=><article className="panel" key={t.id}><strong>{t.title}</strong><p>Task ID: {t.id}<br/>Owner: {t.owner} · Status: {t.status}</p>{t.status==='queued'?<button className="button primary" disabled={busy} onClick={()=>void perform(async()=>{await acceptClaim(await request('/api/agents/tasks','POST',{action:'claim',taskId:t.id,usesLocalBrowser:true}));})}>Claim task {t.id.slice(0,8)}</button>:t.status==='claimed'&&recoverableClaimKind(t.kind)?<div><p>This task is active in another context. Recover here to invalidate its old claim token. Stop using the old tab; saved records remain intact. Do not run both contexts.</p><button className="button secondary" disabled={busy} onClick={()=>void perform(()=>recover(t))}>Recover task {t.id.slice(0,8)} here</button></div>:<span className="muted">{t.status==='blocked'?'Blocked — owner review is needed before retry.':t.status==='claimed'?'External form/send work is active. Use its original context or reconcile in Tasks; it cannot be moved automatically.':'No action required here.'}</span>}</article>)}{!tasks.some(t=>t.owner===actor)&&<p>No tasks returned for this identity. Check my queue and report the identity and timestamp above.</p>}</div>:<div className="info-note"><strong>{paused?'Renewal paused — resolve the error below':'Claim ready · automatic renewal every 2 minutes'}</strong><p>Task: {claim.id}<br/>Expires: {new Date(claim.leaseUntil).toLocaleString()}<br/>Last renewed: {lastRenewed?new Date(lastRenewed).toLocaleTimeString():'Restored from this tab'}</p><button className="button secondary" disabled={busy} onClick={()=>void perform(renew)}>Renew now</button></div>}
 <p>Keep this tab open and the Mac awake. Closing the tab or sleeping can stop renewal. Expired claims are never revived automatically. Reloading this tab restores its unexpired claim. In a different tab, use Recover task for live discovery/read/draft work. Recovery invalidates the old token; it does not approve external actions. No token is displayed.</p></section>
 <section className="panel"><h2>2. Submit one record</h2><p>Paste one real request at a time. Omit <code>claimToken</code>, <code>taskId</code> and <code>batchId</code>: this workbench adds them from your active claim. Keep the record&apos;s stable <code>eventId</code>. Existing conflicting IDs are rejected.</p>
 <p>Job format: <code>{'{"eventId":"stable-id","type":"opportunity","job":{...}}'}</code><br/>Contact format: <code>{'{"eventId":"stable-id","type":"contact","contact":{...}}'}</code>. Each request contains one record; <code>action: result</code> is not supported.</p>
 <button type="button" className="button secondary" disabled={busy} onClick={()=>void perform(async()=>{const guide=await request('/api/agents/guide');setFormats(JSON.stringify({opportunity:guide.examples.opportunity,contact:guide.examples.contact},null,2));})}>Show job and contact format examples</button>
 {formats&&<><p>Format examples only — replace all illustrative values with your real evidence before submission.</p><pre className="task-json">{formats}</pre></>}
 <label>Write endpoint<select value={endpoint} onChange={e=>setEndpoint(e.target.value)}><option value="/api/agents">Discovery / draft / evidence report</option><option value="/api/agents/tasks">Task heartbeat / completion / blocked result</option></select></label><label>JSON request<textarea rows={10} className="agent-instructions" value={payload} onChange={e=>setPayload(e.target.value)} placeholder='One real record, without claimToken.'/></label><button disabled={busy||!payload.trim()||paused} className="button primary" onClick={()=>void perform(submit)}>{submitStatus==='Submitting…'?'Submitting…':'Submit report'}</button>
 {submitError&&<div role="alert" style={{border:'2px solid #b42318',background:'#fff1f0',color:'#912018',padding:'16px',marginTop:'12px'}}><strong>Report not saved</strong><p>{submitError}</p><p>Correct the JSON above and submit again. This error does not require a new claim if renewal is still active.</p></div>}
 {submitStatus&&<p role="status">{submitStatus}</p>}
 <p>After each successful receipt, read back the saved record. After all records are confirmed, submit the discovery completion using the task endpoint. Sending and application submission still require separately approved tasks in <Link className="text-link" href="/tasks">Tasks</Link>.</p></section>
 {claim?.kind==='discover'&&<section className="panel"><h2>3. Complete discovery</h2><p>Complete only after reading back all saved records. This reports discovery completion and may release preparation assignments; it does not send messages or submit applications.</p><p>Task: <strong>{claim.id}</strong> · Owner: {claim.owner}</p><label>Completion summary<textarea rows={3} maxLength={5000} value={completionSummary} onChange={e=>setCompletionSummary(e.target.value)} placeholder="Actual saved findings and counts"/></label><label>Search coverage and gaps<textarea rows={3} maxLength={4000} value={coverage} onChange={e=>setCoverage(e.target.value)} placeholder="Sources checked, date range and unknown or unverified fields"/></label><button type="button" className="button primary" disabled={busy||paused||!completionSummary.trim()||!coverage.trim()} onClick={()=>void perform(completeDiscovery)}>Complete discovery for {claim.id.slice(0,8)}</button>{submitError&&<p role="alert" style={{color:'#912018'}}>Not saved: {submitError}</p>}</section>}
 <section className="panel"><h2>Last response</h2><pre className="task-json" aria-live="polite">{output||'Check the queue to start.'}</pre></section></>}
 {error&&<p className="info-note" role="alert">{error}</p>}</>;
}
