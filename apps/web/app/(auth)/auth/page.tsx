"use client";
import { env } from "@/env";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice, Skeleton } from "@/components/ui/display";
import { cn } from "@/lib/utils";
const api=env.NEXT_PUBLIC_API_URL;
const request=(path:string,body:object)=>fetch(`${api}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify(body)});
function Auth(){const router=useRouter(),query=useSearchParams();const[mode,setMode]=useState<"login"|"signup"|"forgot">("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[code,setCode]=useState(""),[ticket,setTicket]=useState(""),[otp,setOtp]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");const next=query.get("next")?.startsWith("/")?query.get("next")!:"/dashboard";const run=async(path:string,body:object)=>{setBusy(true);setMessage("");const r=await request(path,body);const data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok){setMessage(data.error?.message??"Please try again.");return null}return data};const submit=async(e:React.FormEvent)=>{e.preventDefault();if(mode==="login"&&!otp){const d=await run("/v1/auth/login/password",{email,password});if(d)router.push(next);return}if(mode==="login"){const d=code?await run("/v1/auth/login/otp/verify",{email,code}):await run("/v1/auth/login/otp/request",{email});if(d&&code)router.push(next);else if(d)setCode(" ");return}if(mode==="signup"){if(!ticket){if(!code){const d=await run("/v1/auth/signup/start",{email});if(d)setCode(" ")}else{const d=await run("/v1/auth/signup/verify",{email,code:code.trim()});if(d){setTicket(d.ticket);setCode("")}}}else{const d=await run("/v1/auth/signup/complete",{ticket,password});if(d)router.push(next)}return}if(!ticket){if(!code){const d=await run("/v1/auth/password/forgot",{email});if(d)setCode(" ")}else{const d=await run("/v1/auth/password/verify",{email,code:code.trim()});if(d){setTicket(d.ticket);setCode("")}}}else await run("/v1/auth/password/reset",{ticket,newPassword:password})};const title=mode==="signup"?ticket?"Create your password":code?"Enter your code":"Create an account":mode==="forgot"?ticket?"Choose a new password":code?"Enter your code":"Reset your password":"Sign in";
  const submitLabel=mode==="signup"?(ticket?"Create account":code?"Verify code":"Send code"):mode==="forgot"?(ticket?"Reset password":code?"Verify code":"Send reset code"):otp?(code?"Verify and continue":"Send login code"):"Sign in";
  const segment=(active:boolean)=>cn("min-h-11 flex-1 rounded-input px-3 text-sm font-semibold transition-colors",active?"bg-surface text-ink shadow-soft":"text-muted hover:text-ink");
  return <div className="grid gap-6">
    <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Secure access</p><h1 className="text-2xl">{title}</h1>{(code||ticket)&&<p className="text-sm text-muted">{ticket?"Your email is verified.":`We sent a six-digit code to ${email}. It expires in 10 minutes.`}</p>}</div>
    <div className="flex gap-1 rounded-card bg-surface-muted p-1" aria-label="Account action">
      <button type="button" aria-pressed={mode==="login"} className={segment(mode==="login")} onClick={()=>{setMode("login");setOtp(false);setCode("");setTicket("")}}>Sign in</button>
      <button type="button" aria-pressed={mode==="signup"} className={segment(mode==="signup")} onClick={()=>{setMode("signup");setCode("");setTicket("")}}>Create account</button>
    </div>
    <form onSubmit={submit} className="grid gap-4" noValidate={false}>
      <Field label="Email">{p=><Input {...p} type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={!!code||!!ticket} required/>}</Field>
      {mode==="login"&&!otp&&<Field label="Password">{p=><Input {...p} type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/>}</Field>}
      {(code||ticket)&&!ticket&&<Field label="Six-digit code">{p=><Input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} required autoFocus className="text-center text-lg tracking-[0.5em] tabular-nums"/>}</Field>}
      {ticket&&<Field label="Password" hint="Use 10–128 characters and avoid common passwords.">{p=><Input {...p} type="password" minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required/>}</Field>}
      {message&&<Notice tone="danger">{message}</Notice>}
      <Button block size="lg" loading={busy} loadingText="Please wait…">{submitLabel}</Button>
      <div className="flex flex-wrap justify-between gap-2">
        {mode==="login"&&!otp&&<Button type="button" variant="ghost" size="sm" onClick={()=>setOtp(true)}>Use email code</Button>}
        {mode==="login"&&<Button type="button" variant="ghost" size="sm" onClick={()=>{setMode("forgot");setCode("");setTicket("")}}>Forgot password?</Button>}
      </div>
    </form>
  </div>}
export default function Page(){return <Suspense fallback={<div role="status" className="grid gap-4"><span className="sr-only">Loading secure sign in…</span><Skeleton className="h-8 w-40"/><Skeleton className="h-11"/><Skeleton className="h-11"/><Skeleton className="h-12"/></div>}><Auth/></Suspense>}
