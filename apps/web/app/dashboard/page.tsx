"use client";
import { env } from "@/env";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Copy, ExternalLink, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, LoadingState, Money, Notice, Skeleton, Stepper } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
const api = env.NEXT_PUBLIC_API_URL;
type Service={id:string;name:string;description:string;price_paise:string;duration_minutes:number;booking_mode:"TIMED"|"FULL_DAY";advance_type:"NONE"|"PERCENT"|"FIXED";advance_value:number;active:boolean};
type Profile={slug:string;business_name:string;description:string;city:string;service_area:string|null;timezone:string;terms:string;cancellation_policy:string;rescheduling_policy:string;phone_required:boolean;published:boolean;services:Service[]};
const request=(path:string,method:string,body?:object)=>fetch(`${api}${path}`,{method,credentials:"include",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
async function problem(response:Response){return (await response.json().catch(()=>null) as {error?:{message?:string;details?:{missing?:string[]}}}|null)?.error;}
export default function Dashboard(){const[profile,setProfile]=useState<Profile>();const[notice,setNotice]=useState("");const[loading,setLoading]=useState(true);const[editing,setEditing]=useState<Service>();const load=async()=>{setLoading(true);const r=await request("/v1/vendor/me","GET");if(r.ok)setProfile(await r.json() as Profile);else setNotice(r.status===401?"Sign in to manage your business.":"Create your business profile to begin.");setLoading(false);};useEffect(()=>{void load()},[]);const create=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const r=await request("/v1/vendor/me","POST",{business_name:f.get("business_name"),slug:f.get("slug"),city:f.get("city"),description:f.get("description"),categories:["other"]});if(!r.ok){setNotice((await problem(r))?.message??"Check your profile details.");return}await load()};const saveProfile=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const r=await request("/v1/vendor/me","PATCH",{business_name:f.get("business_name"),description:f.get("description"),city:f.get("city"),service_area:f.get("service_area")||null,timezone:f.get("timezone"),terms:f.get("terms"),cancellation_policy:f.get("cancellation_policy"),rescheduling_policy:f.get("rescheduling_policy"),phone_required:f.get("phone_required")==="on"});setNotice(r.ok?"Profile saved.":(await problem(r))?.message??"Could not save profile.");if(r.ok)await load()};const saveService=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const body={name:f.get("name"),description:f.get("description"),price_rupees:f.get("price_rupees"),duration_minutes:Number(f.get("duration_minutes")),booking_mode:f.get("booking_mode"),advance_type:f.get("advance_type"),advance_value:Number(f.get("advance_value")),active:f.get("active")==="on"};const r=await request(editing?`/v1/vendor/services/${editing.id}`:"/v1/vendor/services",editing?"PATCH":"POST",body);setNotice(r.ok?"Service saved.":(await problem(r))?.message??"Check service details.");if(r.ok){setEditing(undefined);await load()}};const publish=async()=>{const r=await request(`/v1/vendor/${profile?.published?"unpublish":"publish"}`,"POST");const error=await problem(r);setNotice(r.ok?(profile?.published?"Unpublished.":"Published."):`Finish: ${error?.details?.missing?.join(", ")??error?.message??"onboarding"}.`);if(r.ok)await load()};
  const noticeTone=notice.endsWith("saved.")||notice==="Published."||notice==="Unpublished."?"success":"info";
  if(loading)return <LoadingState label="Loading your dashboard…" className="grid gap-4"><Skeleton className="h-10 w-64"/><Skeleton className="h-8 w-full max-w-lg"/><Skeleton className="h-64 rounded-card"/><Skeleton className="h-48 rounded-card"/></LoadingState>;
  if(!profile&&notice==="Sign in to manage your business.")return <EmptyState className="mx-auto max-w-xl" title="Sign in to manage your business" description="Your dashboard is private. Sign in with your password or an email code." action={<div className="flex flex-wrap justify-center gap-2"><Button asChild><Link href="/login?next=/dashboard">Sign in</Link></Button><Button asChild variant="secondary"><Link href="/signup">Create an account</Link></Button></div>}/>;
  if(!profile)return <div className="mx-auto grid max-w-xl gap-6"><PageHeader eyebrow="Step 1 of 4 · Business" title="Set up your business" description="This creates your public page. You can change everything later."/><Stepper steps={["Business","Policies","Services","Publish"]} current={0}/>{notice&&<Notice tone="info">{notice}</Notice>}<Card><form onSubmit={create} className="grid gap-4"><Field label="Business name">{p=><Input {...p} name="business_name" required minLength={2}/>}</Field><Field label="Public link" hint="3–30 lowercase letters, numbers or hyphens. This becomes bayana.in/your-link.">{p=><Input {...p} name="slug" required pattern="[a-z0-9-]{3,30}"/>}</Field><Field label="City or location">{p=><Input {...p} name="city" required/>}</Field><Field label="Description">{p=><Textarea {...p} name="description" required/>}</Field><Button size="lg">Create business profile</Button></form></Card></div>;
  const step=profile.published?4:profile.services.length?3:profile.terms?2:1;
  return <div className="grid gap-6">
    <PageHeader eyebrow={profile.published?"Published":"Onboarding · saves as you go"} title={profile.business_name} actions={<Button variant={profile.published?"secondary":"primary"} onClick={()=>void publish()}>{profile.published?"Unpublish":"Publish"}</Button>}/>
    <Stepper steps={["Profile","Policies","Services","Publish"]} current={step}/>
    {notice&&<Notice tone={noticeTone}>{notice}</Notice>}
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-6">
        <Card><CardHeader title={editing?"Edit service":"Services"} description="What clients can book, with price, duration and advance."/>
          {!editing&&(profile.services.length?<ul className="mb-6 grid gap-2">{profile.services.map(s=><li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-input bg-surface-muted px-4 py-3"><div className="grid"><strong>{s.name}</strong><span className="text-sm text-muted"><Money paise={s.price_paise} size="sm"/> · {s.duration_minutes} min</span></div><div className="flex items-center gap-2">{!s.active&&<Badge>Inactive</Badge>}<Button size="sm" variant="secondary" onClick={()=>setEditing(s)}>Edit</Button></div></li>)}</ul>:<EmptyState className="mb-6" icon={<Sparkles/>} title="No services yet" description="Add your first service below. Clients can book once you publish."/>)}
          <form key={editing?.id??"new"} onSubmit={saveService} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">{p=><Input {...p} name="name" defaultValue={editing?.name} required/>}</Field>
            <Field label="Description" optional className="sm:col-span-2">{p=><Textarea {...p} name="description" defaultValue={editing?.description}/>}</Field>
            <Field label="Price in rupees">{p=><Input {...p} name="price_rupees" inputMode="decimal" defaultValue={editing?(Number(editing.price_paise)/100).toFixed(2):""} required/>}</Field>
            <Field label="Duration (minutes)">{p=><Input {...p} name="duration_minutes" type="number" min="5" defaultValue={editing?.duration_minutes??60} required/>}</Field>
            <Field label="Booking mode">{p=><Select {...p} name="booking_mode" defaultValue={editing?.booking_mode??"FULL_DAY"}><option value="FULL_DAY">Full day</option><option value="TIMED">Timed</option></Select>}</Field>
            <Field label="Advance rule">{p=><Select {...p} name="advance_type" defaultValue={editing?.advance_type??"PERCENT"}><option value="NONE">No advance</option><option value="PERCENT">Percent</option><option value="FIXED">Fixed paise</option></Select>}</Field>
            <Field label="Advance value">{p=><Input {...p} name="advance_value" type="number" min="0" defaultValue={editing?.advance_value??20} required/>}</Field>
            <Checkbox name="active" defaultChecked={editing?.active??true} label="Active" hint="Inactive services are hidden from your page." className="self-end"/>
            <div className="flex flex-wrap gap-2 sm:col-span-2"><Button>{editing?"Save service":"Add service"}</Button>{editing&&<Button type="button" variant="ghost" onClick={()=>setEditing(undefined)}>Cancel</Button>}</div>
          </form>
        </Card>
        <Card><CardHeader title="Business profile and policies" description="Shown on your public page before anyone books."/>
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">{p=><Input {...p} name="business_name" defaultValue={profile.business_name} required/>}</Field>
            <Field label="Location">{p=><Input {...p} name="city" defaultValue={profile.city} required/>}</Field>
            <Field label="Description" className="sm:col-span-2">{p=><Textarea {...p} name="description" defaultValue={profile.description} required/>}</Field>
            <Field label="Service area" optional>{p=><Input {...p} name="service_area" defaultValue={profile.service_area??""}/>}</Field>
            <Field label="Timezone" hint="IANA name, for example Asia/Kolkata.">{p=><Input {...p} name="timezone" defaultValue={profile.timezone} required/>}</Field>
            <Field label="Terms" className="sm:col-span-2">{p=><Textarea {...p} name="terms" defaultValue={profile.terms} required/>}</Field>
            <Field label="Cancellation policy">{p=><Textarea {...p} name="cancellation_policy" defaultValue={profile.cancellation_policy} required/>}</Field>
            <Field label="Rescheduling policy">{p=><Textarea {...p} name="rescheduling_policy" defaultValue={profile.rescheduling_policy} required/>}</Field>
            <Checkbox name="phone_required" defaultChecked={profile.phone_required} label="Require customer phone number" className="sm:col-span-2"/>
            <div className="sm:col-span-2"><Button>Save profile</Button></div>
          </form>
        </Card>
      </div>
      <aside className="grid content-start gap-6">
        <Card><CardHeader title="Your public page" description={profile.published?"Live. Share it anywhere.":"Publish when your checklist is done."}/>
          <p className="mb-4 break-all rounded-input bg-surface-muted px-3 py-2.5 font-mono text-sm">bayana.in/{profile.slug}</p>
          <div className="grid gap-2"><Button asChild variant="secondary"><a href={`/${profile.slug}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden/>Preview</a></Button><Button type="button" variant="ghost" onClick={()=>void navigator.clipboard.writeText(`${location.origin}/${profile.slug}`)}><Copy aria-hidden/>Copy public link</Button></div>
        </Card>
        <Card><CardHeader title="Availability" description="Weekly hours, closed days and blocked periods."/><Button asChild variant="secondary" block><Link href="/dashboard/availability">Manage availability</Link></Button></Card>
      </aside>
    </div>
  </div>}
