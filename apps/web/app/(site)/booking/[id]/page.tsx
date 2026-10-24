"use client";
import { env } from "@/env";
import Link from "next/link";
import {useParams} from "next/navigation"; import {useEffect,useState} from "react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, LoadingState, Money, Notice, Skeleton, StatusBadge } from "@/components/ui/display";
const api=env.NEXT_PUBLIC_API_URL;
type BookingView={status:string;advance_paise:string|number;balance_due_paise?:string|number;service_name?:string|null;display_name?:string;starts_at_utc?:string|null};
export default function Booking(){const {id}=useParams<{id:string}>();const[b,setB]=useState<BookingView>();const[error,setError]=useState("");async function load(){const r=await fetch(`${api}/v1/bookings/${id}`,{credentials:"include"});if(r.ok){setB(await r.json());setError("")}else if(r.status===401)setError("Sign in with the email used for this booking to view it.");else setError("This booking could not be found.")}useEffect(()=>{load();const t=setInterval(load,5000);return()=>clearInterval(t)},[id]);
  if(error)return <EmptyState title={error} description="Booking links are private. Use the link from your confirmation email, or sign in with the same email." action={<Button asChild><Link href="/login">Client sign in</Link></Button>}/>;
  if(!b)return <LoadingState label="Loading your booking…" className="mx-auto grid max-w-xl gap-4"><Skeleton className="h-6 w-28"/><Skeleton className="h-9 w-3/4"/><Skeleton className="h-40 rounded-card"/></LoadingState>;
  const held=b.status==="HELD";
  return <div className="mx-auto grid max-w-xl gap-6">
    <div className="grid gap-3"><StatusBadge status={b.status} className="w-fit"/><h1 className="text-2xl sm:text-4xl">{b.status==="CONFIRMED"?"Your date is confirmed":held?"Awaiting verified payment":"Your booking"}</h1><p className="text-muted">{held?"Razorpay will confirm the booking only after its signed webhook reaches Bayana.":"Payment and balance details are recorded below."}</p></div>
    <Card><dl className="grid gap-3">
      {b.display_name&&<div className="flex justify-between gap-4"><dt className="text-muted">With</dt><dd className="text-right font-medium">{b.display_name}</dd></div>}
      {b.service_name&&<div className="flex justify-between gap-4"><dt className="text-muted">Service</dt><dd className="text-right font-medium">{b.service_name}</dd></div>}
      <div className="flex justify-between gap-4 border-t border-border pt-3"><dt className="text-muted">Advance</dt><dd><Money paise={b.advance_paise} className="font-semibold"/></dd></div>
      <div className="flex justify-between gap-4"><dt className="text-muted">Remaining balance</dt><dd><Money paise={Number(b.balance_due_paise)} size="lg"/></dd></div>
    </dl></Card>
    {held&&<Notice tone="warning">If you closed Checkout before paying, return to the business’s page and start a new booking after this hold expires.</Notice>}
  </div>}
