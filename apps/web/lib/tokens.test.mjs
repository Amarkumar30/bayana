import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { contrast, dark, light, nonTextPairs, textPairs } from "./tokens.ts";

// The contrast script (P10): globals.css holds exactly the tokens in lib/tokens.ts, every pairing meets WCAG AA in both
// themes, amber is never a text colour, and there is one font family.
const root = path.resolve(import.meta.dirname, "..");
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
const declarations = block => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, value]) => [name, value.toLowerCase()]));
const between = (start, end) => { const from = css.indexOf(start); assert.ok(from >= 0, `globals.css has ${start}`); return css.slice(from, css.indexOf(end, from)); };

describe("design tokens", () => {
  it("globals.css holds exactly the light tokens in :root, and the dark tokens in both dark blocks", () => {
    const pick = theme => Object.fromEntries(Object.keys(light).map(name => [name, theme[name]]));
    assert.deepEqual(pick(declarations(between(":root {", "}"))), light);
    assert.deepEqual(pick(declarations(between(":root:not([data-theme=\"light\"]) {", "}"))), dark);
    assert.deepEqual(pick(declarations(between(":root[data-theme=\"dark\"] {", "}"))), dark);
  });
  it("uses deep blue #1E3A8A for action and amber #D97706 for marks in the light theme, which is the default", () => {
    assert.equal(light.primary, "#1e3a8a"); assert.equal(light.accent, "#d97706");
    assert.match(css, /:root \{\s*color-scheme: light;/);
  });
  for (const [name, theme] of [["light", light], ["dark", dark]]) {
    it(`${name}: every text pairing is at least 4.5:1`, () => {
      for (const [fg, bg] of textPairs) assert.ok(contrast(theme[fg], theme[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(theme[fg], theme[bg]).toFixed(2)}`);
    });
    it(`${name}: icons, focus rings and input borders are at least 3:1`, () => {
      for (const [fg, bg] of nonTextPairs) assert.ok(contrast(theme[fg], theme[bg]) >= 3, `${fg} on ${bg}: ${contrast(theme[fg], theme[bg]).toFixed(2)}`);
    });
  }
  it("amber is too light for text, which is why it is only ever a fill or an icon", () => {
    assert.ok(contrast(light.accent, light.surface) < 4.5);
  });
});

describe("how components use the tokens", () => {
  const sources = [];
  const walk = dir => { for (const entry of readdirSync(dir)) { const full = path.join(dir, entry); if (statSync(full).isDirectory()) walk(full); else if (/\.(tsx|ts|css)$/.test(entry) && !/\.test\./.test(entry)) sources.push([path.relative(root, full), readFileSync(full, "utf8")]); } };
  for (const dir of ["app", "components", "lib"]) walk(path.join(root, dir));
  it("amber (accent) is never a text colour: text uses accent-ink", () => {
    const found = sources.flatMap(([file, text]) => [...text.matchAll(/\btext-accent(?![-\w])/g)].map(() => file));
    assert.deepEqual(found, []);
  });
  it("one font family: the serif is gone", () => {
    const found = sources.filter(([, text]) => /font-serif|Fraunces|--font-fraunces/.test(text)).map(([file]) => file);
    assert.deepEqual(found, []);
  });
});
