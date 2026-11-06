// Browser-only claim helpers. Tokens stay out of rendered receipts and chats.
export type WorkbenchClaim = {
  id: string; owner: string; kind: string; claimToken: string;
  leaseUntil: string; batchId?: string;
};
export function readWorkbenchClaim(value: unknown): WorkbenchClaim | null {
  if (!value || typeof value !== 'object') return null;
  const t = value as Record<string, unknown>;
  if (['id','owner','kind','claimToken','leaseUntil'].some(k => typeof t[k] !== 'string' || !t[k])) return null;
  if (!['dot','muse'].includes(String(t.owner)) || !Number.isFinite(Date.parse(String(t.leaseUntil)))) return null;
  return {id:String(t.id),owner:String(t.owner),kind:String(t.kind),claimToken:String(t.claimToken),leaseUntil:String(t.leaseUntil),...(typeof t.batchId === 'string' ? {batchId:t.batchId} : {})};
}
export function prepareWorkbenchRequest(endpoint: string, value: unknown, claim: WorkbenchClaim | null, actor: string, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Enter one JSON object per request.');
  const v = {...value as Record<string,unknown>};
  if (endpoint === '/api/agents/tasks' && !['begin_discovery_round','register_worker','claim','heartbeat','report'].includes(String(v.action))) {
    throw Error('Unsupported task action. Completion requires action:"report", status:"completed", eventId, summary and coverage. Use the Complete discovery form for a discovery task.');
  }
  if (endpoint === '/api/agents' && !['opportunity','contact','draft','progress','outreach_report','interpretation','application_analysis'].includes(String(v.type))) {
    throw Error('Unsupported report format. Jobs require {eventId, type:"opportunity", job:{...}}; people require {eventId, type:"contact", contact:{...}}. action:"result" and jobs.windowOutsideDiscoveries are not supported. Convert one record using the API guide; do not report task completion before records are saved.');
  }
  const needsClaim = endpoint === '/api/agents/tasks' ? ['heartbeat','report'].includes(String(v.action)) : endpoint === '/api/agents' && ['opportunity','contact','draft'].includes(String(v.type));
  if (!needsClaim) return v;
  if (!claim || claim.owner !== actor) throw Error('Claim your task using its Claim task button first.');
  if (Date.parse(claim.leaseUntil) <= now) throw Error('The claim expired. Stop and request requeue; no automatic retry.');
  if (v.taskId !== undefined && v.taskId !== claim.id) throw Error('JSON taskId differs from the selected claim.');
  if (v.batchId !== undefined && v.batchId !== claim.batchId) throw Error('JSON batchId differs from the selected claim.');
  if (v.claimToken !== undefined && v.claimToken !== claim.claimToken) throw Error('Remove the old claimToken from your JSON. This workbench supplies the current token privately.');
  return {...v,taskId:claim.id,claimToken:claim.claimToken,...(claim.batchId ? {batchId:claim.batchId} : {})};
}
export function prepareDiscoveryCompletion(claim: WorkbenchClaim | null, actor: string, fields: {eventId:string;summary:string;coverage:string}) {
  if (claim?.kind !== 'discover') throw Error('An active discovery claim is required.');
  if (!fields.summary.trim() || fields.summary.length > 5000 || !fields.coverage.trim() || fields.coverage.length > 4000) throw Error('Provide a summary (up to 5000 characters) and coverage/gaps (up to 4000 characters).');
  return prepareWorkbenchRequest('/api/agents/tasks', {action:'report',status:'completed',eventId:fields.eventId,summary:fields.summary.trim(),coverage:fields.coverage.trim()}, claim, actor);
}
export function redactWorkbenchResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactWorkbenchResponse);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['claimToken','token','authorization','password','secret'].includes(key)).map(([k,v]) => [k,redactWorkbenchResponse(v)]));
}
