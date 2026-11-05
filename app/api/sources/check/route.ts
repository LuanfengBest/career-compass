import { guard, failure, json } from "../../../lib/server/http";
export async function GET(req:Request) { try{guard(req);return json({error:"Website job collection was removed. Use agent discovery tasks.",mode:"agent-only"},410);}catch(e){return failure(e);} }
export async function POST(req:Request) { try{guard(req,true);return json({error:"Website job collection was removed. Use agent discovery tasks.",mode:"agent-only"},410);}catch(e){return failure(e);} }
