import { PageHeader } from "@/components/layout/brand";
import { AvailabilityManager } from "../availability-manager";

export const metadata = { title: "Availability | Bayana" };
export default function AvailabilityPage() {
  return <><PageHeader eyebrow="Availability" title="When clients can book" description="Weekly windows, one-off changes and blocked time." /><AvailabilityManager /></>;
}
