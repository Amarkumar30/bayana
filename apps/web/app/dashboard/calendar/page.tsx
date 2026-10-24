import type { Metadata } from "next";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar | Bayana", robots: { index: false, follow: false } };
export default function CalendarPage() { return <CalendarView />; }
