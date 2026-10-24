import type { Metadata } from "next";
import { PaymentsView } from "./payments-view";

export const metadata: Metadata = { title: "Payments | Bayana", robots: { index: false, follow: false } };
export default function PaymentsPage() { return <PaymentsView />; }
