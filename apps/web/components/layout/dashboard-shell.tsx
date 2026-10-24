"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, CreditCard, LayoutDashboard, ListChecks, Menu, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Brand } from "./brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };
const items: Item[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/bookings", label: "Bookings", icon: ListChecks },
  { href: "/dashboard/services", label: "Services", icon: Sparkles },
  { href: "/dashboard/availability", label: "Availability", icon: Clock },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];
const mobilePrimary = ["/dashboard", "/dashboard/calendar", "/dashboard/bookings", "/dashboard/payments"];
const isActive = (pathname: string, href: string) => href === "/dashboard" ? pathname === href : pathname.startsWith(href);

function NavLink({ item, active, onNavigate }: { item: Item; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-input px-3 text-sm font-medium no-underline transition-colors", active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-muted hover:text-ink")}><Icon className="size-4.5 shrink-0" aria-hidden />{item.label}</Link>;
}

/** Sidebar on desktop; top bar with a menu sheet plus a bottom tab bar on mobile. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* The column carries the background and border for the full page height; the inner panel stays pinned while content scrolls. */}
      <aside className="hidden border-r border-border bg-surface lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-6 px-4 py-5">
          <Brand />
          <nav aria-label="Dashboard" className="grid gap-1">{items.map(item => <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />)}</nav>
          <div className="mt-auto rounded-card bg-surface-muted p-4 text-sm"><p className="font-medium">Need a hand?</p><p className="text-muted">Write to hello@bayana.in</p></div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Brand />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Open dashboard menu"><Menu className="size-5" aria-hidden /></Button></SheetTrigger>
            <SheetContent side="left" title="Dashboard">
              <nav aria-label="Dashboard" className="grid gap-1">{items.map(item => <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={() => setMenuOpen(false)} />)}</nav>
            </SheetContent>
          </Sheet>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
        <nav aria-label="Dashboard shortcuts" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
          {items.filter(item => mobilePrimary.includes(item.href)).map(item => { const Icon = item.icon; const active = isActive(pathname, item.href); return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium no-underline", active ? "text-primary" : "text-muted")}><Icon className="size-5" aria-hidden />{item.label}</Link>
          ); })}
        </nav>
      </div>
    </div>
  );
}
