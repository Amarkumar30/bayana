import { PageHeader } from "@/components/layout/brand";
import { ServicesManager } from "./services-manager";

export const metadata = { title: "Services | Bayana", robots: { index: false, follow: false } };
export default function ServicesPage() {
  return <><PageHeader eyebrow="Services" title="What clients can book" description="Price, duration, advance, refunds and terms for each service." /><ServicesManager /></>;
}
