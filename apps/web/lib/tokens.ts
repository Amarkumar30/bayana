// The colour tokens, in one place: app/globals.css must hold exactly these values (lib/tokens.test.mjs checks it), and the
// same test checks every pairing below against WCAG AA. No imports, so node --test loads this file directly.

export type Theme = Record<TokenName, string>;
export type TokenName = "background" | "surface" | "surface-muted" | "ink" | "muted" | "border" | "input" | "primary" | "primary-hover" | "primary-foreground" | "primary-soft"
  | "accent" | "accent-soft" | "accent-ink" | "success" | "success-soft" | "warning" | "warning-soft" | "danger" | "danger-soft" | "danger-foreground" | "ring";

/** Light is the default theme: deep blue for action, amber for marks and fills. */
export const light: Theme = {
  background: "#f7f8fa", surface: "#ffffff", "surface-muted": "#f1f3f6", ink: "#0f172a", muted: "#475569", border: "#e2e8f0", input: "#7b8aa1",
  primary: "#1e3a8a", "primary-hover": "#172f70", "primary-foreground": "#ffffff", "primary-soft": "#e8eefb",
  accent: "#d97706", "accent-soft": "#fef3c7", "accent-ink": "#92400e",
  success: "#15803d", "success-soft": "#dcfce7", warning: "#b45309", "warning-soft": "#fef3c7", danger: "#b91c1c", "danger-soft": "#fee2e2", "danger-foreground": "#ffffff", ring: "#1e3a8a"
};
/** A full second theme on deep navy, still blue and amber: light text, lighter blue for action, a brighter amber for marks. */
export const dark: Theme = {
  background: "#0b1220", surface: "#111a2e", "surface-muted": "#18233a", ink: "#e6eaf2", muted: "#a3aec2", border: "#243149", input: "#64748b",
  primary: "#93b4f5", "primary-hover": "#b4cbf8", "primary-foreground": "#0b1220", "primary-soft": "#1b2b4f",
  accent: "#f59e0b", "accent-soft": "#3a2a0c", "accent-ink": "#fcd34d",
  success: "#4ade80", "success-soft": "#12301f", warning: "#fbbf24", "warning-soft": "#3a2a0c", danger: "#f87171", "danger-soft": "#3b1515", "danger-foreground": "#0b1220", ring: "#93b4f5"
};

/**
 * Every pairing the components use. Text needs 4.5:1 (WCAG AA). Non-text (icons, focus rings, input borders) needs 3:1. Amber icons
 * sit on surfaces (cards): on the light page background #D97706 is 3.00:1, so it is not used there; the brand mark is a logo.
 */
export const textPairs: [fg: TokenName, bg: TokenName][] = [
  ["ink", "background"], ["ink", "surface"], ["ink", "surface-muted"], ["ink", "accent-soft"], ["muted", "background"], ["muted", "surface"], ["muted", "surface-muted"],
  ["primary", "background"], ["primary", "surface"], ["primary", "surface-muted"], ["primary", "primary-soft"], ["primary-foreground", "primary"], ["primary-foreground", "primary-hover"],
  ["accent-ink", "accent-soft"], ["accent-ink", "surface"], ["success", "success-soft"], ["success", "surface"], ["warning", "warning-soft"], ["warning", "surface"],
  ["danger", "danger-soft"], ["danger", "surface"], ["danger-foreground", "danger"]
];
export const nonTextPairs: [fg: TokenName, bg: TokenName][] = [["accent", "surface"], ["ring", "background"], ["ring", "surface"], ["input", "surface"], ["input", "background"], ["primary", "surface"]];

const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
/** WCAG 2.1 contrast ratio of two #rrggbb colours. */
export const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
