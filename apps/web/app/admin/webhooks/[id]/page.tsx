import { AdminWebhookDetail } from "@/components/admin/details";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminWebhookDetail id={decodeURIComponent(id)} />;
}
