import { redirect } from "next/navigation";
import { safeNext } from "@/lib/api";

/** The old combined page now lives at /login, /signup and /forgot. Kept as a redirect so existing links keep working. */
export default async function LegacyAuth({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  const target = typeof next === "string" ? safeNext(next, "") : "";
  redirect(target ? `/login?next=${encodeURIComponent(target)}` : "/login");
}
