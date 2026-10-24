import { previewMetadata } from "@/components/layout/preview-banner";
import { AuthPreview } from "@/components/preview/auth-preview";

export const metadata = previewMetadata("Sign in");
export default function Page() { return <AuthPreview mode="login" />; }
