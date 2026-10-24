import Link from "next/link";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export const metadata = previewMetadata("Set up your business");
/** SPEC 5.3 onboarding wizard. Step 1 shown; the working setup flow is on /dashboard today. */
export default function Onboarding() {
  return (
    <div className="grid gap-6">
      <PreviewBanner className="mb-0">The working setup lives on <Link href="/dashboard">your dashboard</Link> for now.</PreviewBanner>
      <Stepper steps={["Profile", "Service", "Hours", "Publish"]} current={0} />
      <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Step 1 of 4</p><h1 className="text-2xl">Tell clients who you are</h1><p className="text-sm text-muted">This appears at the top of your booking page.</p></div>
      <form className="grid gap-4">
        <Field label="Business name">{p => <Input {...p} placeholder="Studio Sunday" />}</Field>
        <Field label="Your link" hint="bayana.in/studio-sunday · lowercase letters, numbers and hyphens">{p => <Input {...p} placeholder="studio-sunday" />}</Field>
        <Field label="Category">{p => <Select {...p} defaultValue="photography"><option value="photography">Photography</option><option value="beauty-and-salon">Beauty and salon</option><option value="tutoring">Tutoring</option><option value="coaching-and-consulting">Coaching and consulting</option><option value="fitness">Fitness</option><option value="events">Events</option><option value="repair-and-maintenance">Repair and maintenance</option><option value="other">Other</option></Select>}</Field>
        <Field label="City">{p => <Input {...p} placeholder="Mumbai" />}</Field>
        <Field label="Short description" optional>{p => <Textarea {...p} placeholder="What you do, in one or two sentences." />}</Field>
        <div className="flex justify-between gap-2"><Button type="button" variant="ghost" disabled>Back</Button><Button type="button" disabled>Continue</Button></div>
      </form>
    </div>
  );
}
