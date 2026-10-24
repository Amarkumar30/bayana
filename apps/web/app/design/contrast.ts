// WCAG 2.1 relative-luminance contrast, used to show AA status for each token pair on /design.
const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
export const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

type Pair = { name: string; fg: string; bg: string; large?: boolean };
export const tokenPairs: { theme: "light" | "dark"; pairs: Pair[] }[] = [
  { theme: "light", pairs: [
    { name: "Ink on background", fg: "#14181f", bg: "#fafaf7" }, { name: "Muted on background", fg: "#5b6472", bg: "#fafaf7" }, { name: "Muted on surface", fg: "#5b6472", bg: "#ffffff" },
    { name: "White on primary", fg: "#ffffff", bg: "#3730a3" }, { name: "Primary on surface", fg: "#3730a3", bg: "#ffffff" }, { name: "Primary on primary-soft", fg: "#3730a3", bg: "#eceafd" },
    { name: "Success on success-soft", fg: "#15803d", bg: "#dcfce7" }, { name: "Warning on warning-soft", fg: "#b45309", bg: "#fef3c7" }, { name: "Danger on danger-soft", fg: "#b91c1c", bg: "#fee2e2" },
    { name: "Accent-ink on accent-soft", fg: "#92400e", bg: "#fef3c7" }, { name: "White on danger", fg: "#ffffff", bg: "#b91c1c" }, { name: "Accent on surface (icons only)", fg: "#d97706", bg: "#ffffff", large: true }
  ] },
  { theme: "dark", pairs: [
    { name: "Ink on background", fg: "#eceef2", bg: "#0f1218" }, { name: "Muted on surface", fg: "#a3acb9", bg: "#171b23" }, { name: "Ink on primary", fg: "#14181f", bg: "#a5a1ff" },
    { name: "Primary on surface", fg: "#a5a1ff", bg: "#171b23" }, { name: "Success on success-soft", fg: "#4ade80", bg: "#12301f" }, { name: "Warning on warning-soft", fg: "#fbbf24", bg: "#3a2a0c" },
    { name: "Danger on danger-soft", fg: "#f87171", bg: "#3b1515" }, { name: "Accent-ink on accent-soft", fg: "#fcd34d", bg: "#3a2a0c" }, { name: "Muted on surface-muted", fg: "#a3acb9", bg: "#1e232d" }
  ] }
];
