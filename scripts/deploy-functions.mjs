#!/usr/bin/env node
// Build (inline) then deploy all 8 edge functions to the linked InsForge project.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "insforge", "functions", "_dist");

execFileSync("node", ["scripts/build-functions.mjs"], { cwd: root, stdio: "inherit" });

for (const file of readdirSync(dist).filter((f) => f.endsWith(".ts"))) {
  const slug = file.replace(/\.ts$/, "");
  process.stdout.write(`deploying ${slug} … `);
  try {
    execFileSync("npx", ["-y", "@insforge/cli@latest", "functions", "deploy", slug, "--file", join(dist, file)],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    console.log("ok");
  } catch (e) {
    console.log("FAILED");
    console.error(e.stdout?.toString() || e.message);
    process.exit(1);
  }
}
console.log("\nAll functions deployed. Verify with: npx @insforge/cli functions list");
