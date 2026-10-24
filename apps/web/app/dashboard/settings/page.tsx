import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/brand";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings | Bayana", robots: { index: false, follow: false } };
export default function SettingsPage() {
  return <><PageHeader eyebrow="Settings" title="Account and business settings" /><SettingsView /></>;
}
