import { contrast, dark, light, nonTextPairs, textPairs } from "@/lib/tokens";

// The token pairs shown with their AA status on /design: the same tokens and pairs lib/tokens.test.mjs checks in pnpm test.
export { contrast };
type Pair = { name: string; fg: string; bg: string; large?: boolean };
const pairsFor = (theme: typeof light): Pair[] => [
  ...textPairs.map(([fg, bg]) => ({ name: `${fg} on ${bg}`, fg: theme[fg], bg: theme[bg] })),
  ...nonTextPairs.map(([fg, bg]) => ({ name: `${fg} on ${bg} (icons, borders)`, fg: theme[fg], bg: theme[bg], large: true }))
];
export const tokenPairs: { theme: "light" | "dark"; pairs: Pair[] }[] = [{ theme: "light", pairs: pairsFor(light) }, { theme: "dark", pairs: pairsFor(dark) }];
