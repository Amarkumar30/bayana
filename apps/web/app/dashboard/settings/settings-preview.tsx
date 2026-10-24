"use client";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Badge, Card, CardHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SettingsPreview() {
  return (
    <Tabs defaultValue="profile">
      <TabsList aria-label="Settings sections"><TabsTrigger value="profile">Profile</TabsTrigger><TabsTrigger value="notifications">Notifications</TabsTrigger><TabsTrigger value="payouts">Payouts</TabsTrigger><TabsTrigger value="security">Security</TabsTrigger></TabsList>
      <TabsContent value="profile"><Card className="grid gap-4"><CardHeader title="Public page" /><Field label="Contact email" hint="Shown on your page only if you turn it on below.">{p => <Input {...p} type="email" defaultValue="studio@example.in" />}</Field><Switch label="Show my email on my public page" /><Switch label="Show my phone number on my public page" /><div><Button disabled>Save</Button></div></Card></TabsContent>
      <TabsContent value="notifications"><Card className="grid gap-1"><CardHeader title="Email me when" /><Switch label="A new booking is confirmed" defaultChecked /><Switch label="A hold expires without payment" defaultChecked /><Switch label="A client cancels" defaultChecked /><Switch label="Daily summary at 8 am" /></Card></TabsContent>
      <TabsContent value="payouts"><Card><CardHeader title="Payout account" description="Needed before online payments can reach you." action={<Badge tone="warning">Not started</Badge>} /><Button variant="secondary" disabled>Connect Razorpay</Button></Card></TabsContent>
      <TabsContent value="security"><Card className="grid gap-4"><CardHeader title="Signed-in devices" />
        <ul className="grid gap-2">{[{ icon: Monitor, name: "Chrome on Windows", meta: "This device · Mumbai" }, { icon: Smartphone, name: "Safari on iPhone", meta: "Last used 2 days ago · Pune" }].map(({ icon: Icon, name, meta }) => <li key={name} className="flex items-center gap-3 rounded-input bg-surface-muted px-4 py-3"><Icon className="size-5 text-muted" aria-hidden /><div className="grid flex-1"><span className="font-medium">{name}</span><span className="text-xs text-muted">{meta}</span></div><Button size="sm" variant="ghost" disabled>Sign out</Button></li>)}</ul>
        <Dialog><DialogTrigger asChild><Button variant="danger" className="w-fit">Delete account</Button></DialogTrigger>
          <DialogContent title="Delete your account?" description="Your page goes offline immediately. Payment records are kept for the period tax law requires, with personal details removed.">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button variant="secondary">Keep my account</Button></DialogClose><Button variant="danger" disabled>Delete (preview)</Button></div>
          </DialogContent>
        </Dialog>
      </Card></TabsContent>
    </Tabs>
  );
}
