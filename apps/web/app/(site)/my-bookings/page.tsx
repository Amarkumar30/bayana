"use client";
import { env } from "@/env";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import {useEffect,useState}from"react";
import { PageHeader } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, Money, Skeleton, StatusBadge } from "@/components/ui/display";
const api=env.NEXT_PUBLIC_API_URL;
type ClientBooking={id:string;event_date:string;status:string;display_name:string;balance_due_paise:string|number};
export default function MyBookings(){const[data,setData]=useState<{bookings:ClientBooking[]}>();const[error,setError]=useState("");useEffect(()=>{fetch(`${api}/v1/client/bookings`,{credentials:"include"}).then(async r=>{if(!r.ok)throw new Error("Sign in to view your bookings.");setData(await r.json())}).catch(e=>setError(e.message))},[]);
  if(error)return <EmptyState icon={<CalendarDays/>} title={error} description="Use the email you booked with. We'll send you a one-time code." action={<Button asChild><Link href="/auth?role=client">Client sign in</Link></Button>}/>;
  if(!data)return <LoadingState label="Loading bookings…" className="grid gap-3"><Skeleton className="h-9 w-48"/>{[0,1,2].map(i=><Skeleton key={i} className="h-20 rounded-card"/>)}</LoadingState>;
  return <div><PageHeader eyebrow="Client account" title="Your bookings"/>
    {data.bookings.length===0?<EmptyState icon={<CalendarDays/>} title="You have no bookings yet" description="When you book a service through a Bayana link, it will appear here."/>:
    <ul className="grid gap-3">{data.bookings.map(b=><li key={b.id}><Link className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4 text-ink no-underline shadow-soft ring-1 ring-border/70 hover:ring-primary/40" href={`/booking/${b.id}`}><div className="grid gap-0.5"><strong>{b.display_name}</strong><span className="text-sm text-muted">{new Date(b.event_date).toLocaleDateString("en-IN",{dateStyle:"medium"})}</span></div><div className="flex items-center gap-3"><StatusBadge status={b.status}/><span className="text-sm"><Money paise={b.balance_due_paise} className="font-semibold"/> due</span></div></Link></li>)}</ul>}
  </div>}
