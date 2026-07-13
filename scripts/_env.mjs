// Minimal .env.local loader (Node 20 has no built-in dotenv).
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function loadEnv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const path = join(root, ".env.local");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  }
  return {
    baseUrl: process.env.INSFORGE_BASE_URL,
    apiKey: process.env.API_KEY,
    anonKey: process.env.INSFORGE_ANON_KEY,
    workerSecret: process.env.WORKER_HMAC_SECRET,
    receiptKey: process.env.RECEIPT_SIGNING_KEY,
    jointSecret: process.env.PHYLAX_JOINT_SECRET || "demo-consortium-shared-secret",
    psiBackend: process.env.PHYLAX_PSI_BACKEND || "modp-ddh",
    root,
  };
}

export const DEMO_PASSWORD = process.env.PHYLAX_DEMO_PASSWORD || "phylax-demo-2026";
export const DEMO_USERS = [
  { email: "operator@phylax.demo",  org: "phylax",    role: "operator" },
  { email: "auditor@phylax.demo",   org: "phylax",    role: "auditor" },
  { email: "admin@fintrust.demo",   org: "fintrust",  role: "partner_admin" },
  { email: "admin@swiftcart.demo",  org: "swiftcart", role: "partner_admin" },
  { email: "admin@pingline.demo",   org: "pingline",  role: "partner_admin" },
];
