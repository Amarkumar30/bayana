import { AdminAudit } from "@/components/admin/lists";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <AdminAudit initial={{ q: one(params.q) }} />;
}
