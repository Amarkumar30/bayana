import { PageHeader } from "@/components/layout/brand";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { SettingsPreview } from "./settings-preview";

export const metadata = previewMetadata("Settings");
export default function SettingsPage() {
  return <><PreviewBanner /><PageHeader eyebrow="Settings" title="Account and business settings" /><SettingsPreview /></>;
}
