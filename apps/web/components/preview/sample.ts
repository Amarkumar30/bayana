// Placeholder data for preview pages only. Nothing here is fetched or persisted.
export type PreviewState = "ready" | "loading" | "empty";
export async function previewState(searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<PreviewState> {
  const { state } = await searchParams; return state === "loading" || state === "empty" ? state : "ready";
}

export const sampleBookings = [
  { id: "7f3c2a10-0001-4000-8000-000000000001", customer: "Ananya Iyer", service: "Bridal makeup trial", date: "Mon, 2 Nov", time: "10:00", status: "confirmed", total: 450000, paid: 135000 },
  { id: "7f3c2a10-0002-4000-8000-000000000002", customer: "Rohit Malhotra", service: "Portrait session · 90 min", date: "Mon, 2 Nov", time: "15:30", status: "held", total: 800000, paid: 0 },
  { id: "7f3c2a10-0003-4000-8000-000000000003", customer: "Fatima Shaikh", service: "Home tuition · Class 10 maths", date: "Wed, 4 Nov", time: "17:00", status: "pending", total: 120000, paid: 0 },
  { id: "7f3c2a10-0004-4000-8000-000000000004", customer: "Karthik Rao", service: "AC servicing", date: "Sat, 31 Oct", time: "11:00", status: "completed", total: 150000, paid: 150000 },
  { id: "7f3c2a10-0005-4000-8000-000000000005", customer: "Meera Joshi", service: "Personal training · 4 sessions", date: "Fri, 30 Oct", time: "07:00", status: "cancelled", total: 600000, paid: 0 },
  { id: "7f3c2a10-0006-4000-8000-000000000006", customer: "Arjun Nair", service: "Portrait session · 90 min", date: "Thu, 29 Oct", time: "16:00", status: "expired", total: 800000, paid: 0 }
] as const;

export const sampleCustomers = [
  { name: "Ananya Iyer", email: "ananya@example.in", bookings: 3, spent: 1185000, last: "2 Nov" },
  { name: "Rohit Malhotra", email: "rohit.m@example.in", bookings: 1, spent: 0, last: "2 Nov" },
  { name: "Fatima Shaikh", email: "fatima.s@example.in", bookings: 6, spent: 720000, last: "4 Nov" },
  { name: "Karthik Rao", email: "karthik@example.in", bookings: 2, spent: 300000, last: "31 Oct" }
];

export const sampleLedger = [
  { date: "28 Oct", description: "Advance · Ananya Iyer", method: "Razorpay", amount: 135000, kind: "payment" },
  { date: "27 Oct", description: "Balance · Karthik Rao", method: "UPI (offline)", amount: 105000, kind: "payment" },
  { date: "25 Oct", description: "Refund · Meera Joshi", method: "Razorpay", amount: -180000, kind: "refund" },
  { date: "24 Oct", description: "Advance · Karthik Rao", method: "Razorpay", amount: 45000, kind: "payment" }
];
