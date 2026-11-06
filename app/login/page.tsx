'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export default function Login(){
 const router=useRouter();
 function afterLogin(){const target=new URLSearchParams(window.location.search).get('returnTo');if(target?.startsWith('/oauth/authorize?')){window.location.assign(target);}else{router.replace('/');router.refresh();}}
 const [password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <main className="login-screen"><form className="panel login-card" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const v=await r.json();if(!r.ok)throw Error(v.error||'Sign-in failed');afterLogin();}catch(err){setError(err instanceof Error?err.message:'Sign-in failed');}finally{setBusy(false);}}}><span className="eyebrow">PRIVATE WORKSPACE</span><h1>Career Compass</h1><p>Your opportunities, applications and conversations, in one place.</p><label>Workspace password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form></main>;
}
