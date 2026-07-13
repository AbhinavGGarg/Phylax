#!/usr/bin/env node
// Inline insforge/functions/_shared/core.ts into each function in
// insforge/functions/src/*.ts, producing self-contained single files in
// insforge/functions/_dist/ for `npx @insforge/cli functions deploy`.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fnDir = join(root, "insforge", "functions");
const srcDir = join(fnDir, "src");
const distDir = join(fnDir, "_dist");

// inline ANY `import { ... } from "../_shared/<name>.(ts|js)"` by pasting that file
const SHARED_RE = /import\s*\{[\s\S]*?\}\s*from\s*["']\.\.\/_shared\/([\w.-]+)["'];?/g;

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const slugs = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
for (const file of slugs) {
  const src = readFileSync(join(srcDir, file), "utf8");
  if (!SHARED_RE.test(src)) {
    console.error(`✗ ${file}: no _shared import found`);
    process.exit(1);
  }
  const banner = `// ⚠ GENERATED — edit insforge/functions/src/${file} + _shared/*, then\n`
    + `//   run: node scripts/build-functions.mjs\n`;
  let out = src.replace(SHARED_RE, (_m, name) => {
    const content = readFileSync(join(fnDir, "_shared", name), "utf8");
    return `\n/* ---- inlined _shared/${name} ---- */\n${content}\n/* ---- end ${name} ---- */\n`;
  });
  out = banner + out;
  if (/\.\.\/_shared\//.test(out)) {
    console.error(`✗ ${file}: unresolved _shared import remains after inlining`);
    process.exit(1);
  }
  const sdkImports = (out.match(/from\s*["']npm:@insforge\/sdk/g) || []).length;
  if (sdkImports !== 1) {
    console.error(`✗ ${file}: expected exactly 1 @insforge/sdk import, found ${sdkImports}`);
    process.exit(1);
  }
  writeFileSync(join(distDir, file), out);
  console.log(`✓ ${file}  (${out.length} bytes)`);
}
console.log(`\nBuilt ${slugs.length} functions -> insforge/functions/_dist/`);
