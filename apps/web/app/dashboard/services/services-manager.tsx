"use client";
import Link from "next/link";
import { ArrowDown, ArrowUp, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { advancePaise } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger, Sheet, SheetContent } from "@/components/ui/dialog";
import { Badge, EmptyState, LoadingState, Money, Notice, Skeleton } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { ServiceForm } from "@/components/vendor/service-form";
import type { Service } from "@/components/vendor/types";
import { ApiError, api, humanMessage } from "@/lib/api";
import { serviceLength } from "@/lib/service-label";

export function ServicesManager() {
  const toast = useToast();
  const [services, setServices] = useState<Service[]>(); const [error, setError] = useState(""); const [needsProfile, setNeedsProfile] = useState(false);
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const load = useCallback(() => api<{ services: Service[] }>("/v1/vendor/services").then(data => { setServices(data.services); setError(""); }).catch(failure => { if (failure instanceof ApiError && failure.code === "PROFILE_NOT_FOUND") setNeedsProfile(true); else setError(humanMessage(failure)); }), []);
  useEffect(() => { void load(); }, [load]);

  const move = async (index: number, by: -1 | 1) => {
    if (!services) return; const next = [...services]; [next[index], next[index + by]] = [next[index + by], next[index]];
    setServices(next);
    try { await api("/v1/vendor/services/reorder", { body: { ids: next.map(service => service.id) } }); } catch (failure) { setError(humanMessage(failure)); await load(); }
  };
  const remove = async (service: Service) => {
    try { await api(`/v1/vendor/services/${service.id}`, { method: "DELETE" }); toast({ title: `${service.name} deleted`, tone: "success" }); await load(); }
    catch (failure) { setError(humanMessage(failure)); }
  };
  const saved = async (service: Service) => { toast({ title: `${service.name} saved`, tone: "success" }); setEditing(null); await load(); };

  if (needsProfile) return <EmptyState icon={<Sparkles />} title="Set up your business first" description="Services belong to your booking page. It takes about two minutes." action={<Button asChild><Link href="/onboarding">Start setup</Link></Button>} />;
  if (error && !services) return <Notice tone="danger">{error}</Notice>;
  if (!services) return <LoadingState label="Loading services…" className="grid gap-3">{[0, 1, 2].map(index => <Skeleton key={index} className="h-20 rounded-card" />)}</LoadingState>;
  return (
    <div className="grid gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <div><Button onClick={() => setEditing("new")}><Plus aria-hidden />Add service</Button></div>
      {services.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="Step 1: add your first service" description="A name, a price and how long it takes is enough. Clients can book once you also set your hours and publish." action={<Button onClick={() => setEditing("new")}>Add your first service</Button>} />
      ) : (
        <ul className="grid gap-3" aria-label="Services, in the order clients see them">
          {services.map((service, index) => { const price = Number(service.price_paise); return (
            <li key={service.id} className="flex flex-wrap items-center gap-3 rounded-card bg-surface p-4 shadow-soft ring-1 ring-border/70">
              <div className="flex flex-col"><Button size="icon" variant="ghost" disabled={index === 0} aria-label={`Move ${service.name} up`} onClick={() => void move(index, -1)}><ArrowUp aria-hidden /></Button><Button size="icon" variant="ghost" disabled={index === services.length - 1} aria-label={`Move ${service.name} down`} onClick={() => void move(index, 1)}><ArrowDown aria-hidden /></Button></div>
              <div className="grid min-w-0 flex-1 gap-0.5"><strong className="flex flex-wrap items-center gap-2">{service.name}{!service.active && <Badge>Hidden</Badge>}{service.cancellation_tiers.length > 0 && <Badge tone="primary">{service.cancellation_tiers.length} refund tier{service.cancellation_tiers.length > 1 ? "s" : ""}</Badge>}</strong><span className="text-sm text-muted">{service.booking_mode === "daily" ? `Per day · ${serviceLength(service)}` : serviceLength(service)} · advance <Money paise={advancePaise(price, service.advance_type, service.advance_value)} size="sm" /></span></div>
              <Money paise={price} className="font-semibold" />
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" aria-label={`Edit ${service.name}`} onClick={() => setEditing(service)}><Pencil aria-hidden /></Button>
                <Dialog><DialogTrigger asChild><Button size="icon" variant="ghost" aria-label={`Delete ${service.name}`}><Trash2 aria-hidden /></Button></DialogTrigger>
                  <DialogContent title={`Delete ${service.name}?`} description="If it already has bookings it can't be deleted; turn it off instead to hide it."><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button variant="secondary">Keep it</Button></DialogClose><DialogClose asChild><Button variant="danger" onClick={() => void remove(service)}>Delete</Button></DialogClose></div></DialogContent>
                </Dialog>
              </div>
            </li>
          ); })}
        </ul>
      )}
      <Sheet open={editing !== null} onOpenChange={open => { if (!open) setEditing(null); }}>
        <SheetContent title={editing === "new" ? "Add a service" : "Edit service"} className="w-[min(36rem,100vw)]">
          {editing !== null && <ServiceForm key={editing === "new" ? "new" : editing.id} service={editing === "new" ? undefined : editing} onSaved={saved} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
