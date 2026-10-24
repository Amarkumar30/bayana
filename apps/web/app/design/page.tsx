import { notFound } from "next/navigation";
import { DesignGallery } from "./gallery";

export const metadata = { title: "Design system | Bayana", robots: { index: false, follow: false } };
/** Development-only component gallery. Production builds return 404. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignGallery />;
}
