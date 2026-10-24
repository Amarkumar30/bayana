import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/brand";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings | Bayana", robots: { index: false, follow: false } };
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // After connecting Google the API returns here with ?google=connected or ?error=<code>.
  const google = { connected: params.google === "connected", error: typeof params.error === "string" ? params.error : undefined };
  return <><PageHeader eyebrow="Settings" title="Account and business settings" /><SettingsView google={google} /></>;
}
