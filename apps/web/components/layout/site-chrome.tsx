"use client";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Brand } from "./brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/dialog";

const links = [{ href: "/pricing", label: "Pricing" }, { href: "/about", label: "About" }, { href: "/my-bookings", label: "My bookings" }];

export function SiteHeader() {
  const [open, setOpen] = useState(false); const close = () => setOpen(false);
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Brand />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map(link => <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center rounded-input px-3 text-sm font-medium text-muted no-underline hover:text-ink">{link.label}</Link>)}
          <Link href="/login?next=/dashboard" className="inline-flex min-h-11 items-center rounded-input px-3 text-sm font-medium text-ink no-underline hover:bg-surface-muted">Sign in</Link>
          <Button asChild size="sm"><Link href="/dashboard">Set up your page</Link></Button>
        </nav>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu"><Menu className="size-5" aria-hidden /></Button></SheetTrigger>
          <SheetContent title="Menu">
            <nav aria-label="Mobile" className="grid gap-1">
              {links.map(link => <Link key={link.href} href={link.href} onClick={close} className="flex min-h-11 items-center rounded-input px-3 text-base text-ink no-underline hover:bg-surface-muted">{link.label}</Link>)}
              <Link href="/login?next=/dashboard" onClick={close} className="flex min-h-11 items-center rounded-input px-3 text-base text-ink no-underline hover:bg-surface-muted">Sign in</Link>
              <Button asChild block className="mt-3"><Link href="/dashboard" onClick={close}>Set up your page</Link></Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
