import { redirect } from "next/navigation";

/** Old emailed links (/booking/<id>?t=) keep working: the customer booking page now lives at /b/<id>. */
export default async function LegacyBookingLink({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = typeof query.t === "string" ? query.t : null;
  redirect(`/b/${encodeURIComponent(id)}${token ? `?t=${encodeURIComponent(token)}` : ""}`);
}
