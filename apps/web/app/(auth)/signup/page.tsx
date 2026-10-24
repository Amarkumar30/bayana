import { previewMetadata } from "@/components/layout/preview-banner";
import { AuthPreview } from "@/components/preview/auth-preview";

export const metadata = previewMetadata("Create account");
export default function Page() { return <AuthPreview mode="signup" />; }
