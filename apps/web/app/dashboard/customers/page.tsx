import type { Metadata } from "next";
import { CustomersView } from "./customers-view";

export const metadata: Metadata = { title: "Customers | Bayana", robots: { index: false, follow: false } };
export default function CustomersPage() { return <CustomersView />; }
