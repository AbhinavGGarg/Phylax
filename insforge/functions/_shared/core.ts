// ============================================================================
//  PHYLAX · edge-function shared core
//  ----------------------------------------------------------------------------
//  Runs on Deno (InsForge Edge Functions) AND Node (the local host / tests) —
//  it uses only Web-standard APIs (crypto.subtle, fetch, Request/Response) plus
//  npm:@insforge/sdk. `scripts/build-functions.mjs` inlines this file into each
//  function for single-file deploy, so keep it dependency-light and self-contained.
// ============================================================================
import { createAdminClient, createClient } from "npm:@insforge/sdk@^1";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Phylax-Signature",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extra },
  });
}

// Structured error objects — never leak internals to the browser.
export function fail(code: string, message: string, status = 400, details?: unknown): Response {
  return json({ error: { code, message, details } }, status);
}

// The monotonic containment state machine — MUST mirror migration 0002.
export const TRANSITIONS: Record<string, string[]> = {
  draft: ["awaiting_parties", "cancelled", "failed"],
  awaiting_parties: ["running", "cancelled", "failed"],
  running: ["protected_match", "failed", "cancelled"],
  protected_match: ["risk_scored", "failed", "cancelled"],
  risk_scored: ["awaiting_approval", "failed", "cancelled"],
  awaiting_approval: ["actioned", "cancelled", "failed"],
  actioned: ["receipted", "failed"],
  receipted: [],
  failed: [],
  cancelled: [],
};
export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

// Fields a worker callback is NEVER allowed to carry into the neutral plane.
export const FORBIDDEN_CALLBACK_KEYS = [
  "raw", "message", "email", "phone", "account", "account_number", "pan",
  "token", "tokens", "embedding", "embeddings", "vector", "vectors", "watchlist", "pii",
];
export function assertNoRawFields(obj: unknown, path = "body"): void {
  if (obj === null || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (FORBIDDEN_CALLBACK_KEYS.includes(k.toLowerCase())) {
      throw new PhylaxError("forbidden_field", `callback may not contain '${k}' at ${path}`, 422);
    }
    if (v && typeof v === "object") assertNoRawFields(v, `${path}.${k}`);
  }
}

export class PhylaxError extends Error {
  code: string; status: number; details?: unknown;
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message); this.code = code; this.status = status; this.details = details;
  }
}

// ---- crypto (Web Crypto; identical on Deno + Node 20) ----
const enc = new TextEncoder();
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v as object).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical((v as any)[k])).join(",") + "}";
}
export async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(message));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// ---- env / clients ----
export function env(name: string, fallback?: string): string {
  // deno-lint-ignore no-explicit-any
  const g: any = globalThis as any;
  const v = g.Deno?.env?.get?.(name) ?? g.process?.env?.[name] ?? fallback;
  if (v === undefined) throw new PhylaxError("config", `missing env ${name}`, 500);
  return v;
}
export function admin() {
  return createAdminClient({ baseUrl: env("INSFORGE_BASE_URL"), apiKey: env("API_KEY") });
}
// A signed-in user client (used by demo-partner to read under that org's RLS).
export async function demoUserClient(email: string, password: string) {
  const c = createClient({ baseUrl: env("INSFORGE_BASE_URL"), anonKey: env("ANON_KEY") });
  await c.auth.signInWithPassword({ email, password });
  return c;
}

export async function currentUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const client = createClient({ baseUrl: env("INSFORGE_BASE_URL"), accessToken: token });
  const { data } = await client.auth.getCurrentUser();
  return data?.user?.id ? { id: data.user.id } : null;
}

export type Membership = { org_id: string; slug: string; kind: string; role: string; is_control: boolean };

// Resolve the caller's org memberships from the authenticated user id — NEVER
// from a client-supplied org id.
export async function memberships(db: ReturnType<typeof admin>, userId: string): Promise<Membership[]> {
  const { data: members } = await db.database.from("organization_members").select("org_id, role").eq("user_id", userId);
  if (!members?.length) return [];
  const { data: orgs } = await db.database.from("organizations").select("id, slug, kind, is_control");
  const byId = new Map((orgs ?? []).map((o: any) => [o.id, o]));
  return members.map((m: any) => {
    const o: any = byId.get(m.org_id) ?? {};
    return { org_id: m.org_id, role: m.role, slug: o.slug, kind: o.kind, is_control: !!o.is_control };
  });
}

// ---- small DB helpers that throw on error ----
export async function insertRows(db: ReturnType<typeof admin>, table: string, rows: any[]) {
  const { data, error } = await db.database.from(table).insert(rows).select();
  if (error) throw new PhylaxError("db_insert", `${table}: ${error.message ?? error}`, 500, error);
  return data;
}
export async function updateRows(db: ReturnType<typeof admin>, table: string, patch: any, col: string, val: string) {
  const { data, error } = await db.database.from(table).update(patch).eq(col, val).select();
  if (error) throw new PhylaxError("db_update", `${table}: ${error.message ?? error}`, 409, error);
  return data;
}
export async function selectRows(db: ReturnType<typeof admin>, table: string, build: (q: any) => any) {
  const { data, error } = await build(db.database.from(table).select("*"));
  if (error) throw new PhylaxError("db_select", `${table}: ${error.message ?? error}`, 500, error);
  return data ?? [];
}

export async function updateWhere(db: ReturnType<typeof admin>, table: string, patch: any, filters: Record<string, string>) {
  let q: any = db.database.from(table).update(patch);
  for (const [c, v] of Object.entries(filters)) q = q.eq(c, v);
  const { data, error } = await q.select();
  if (error) throw new PhylaxError("db_update", `${table}: ${error.message ?? error}`, 409, error);
  return data;
}
export async function orgIndex(db: ReturnType<typeof admin>) {
  const { data } = await db.database.from("organizations").select("id, slug, kind, is_control");
  const bySlug = new Map((data ?? []).map((o: any) => [o.slug, o]));
  const byId = new Map((data ?? []).map((o: any) => [o.id, o]));
  return { bySlug, byId, all: data ?? [] };
}
export async function getRun(db: ReturnType<typeof admin>, runId: string) {
  const { data } = await db.database.from("detection_runs").select("*").eq("id", runId).limit(1);
  return data?.[0] ?? null;
}

// Resolve a seeded DEMO actor (user_id + org_id) for a role — used by the
// anon-callable demo-* functions to act on behalf of the demo operator/approvers.
export async function demoActor(db: ReturnType<typeof admin>, orgSlug: string, roles: string[]) {
  const { data: orgs } = await db.database.from("organizations").select("id").eq("slug", orgSlug).limit(1);
  const orgId = orgs?.[0]?.id;
  if (!orgId) return null;
  const { data: members } = await db.database.from("organization_members").select("user_id, role").eq("org_id", orgId);
  const hit = (members ?? []).find((m: any) => roles.includes(m.role));
  return hit ? { userId: hit.user_id, orgId, role: hit.role } : null;
}

export async function handle(req: Request, fn: (req: Request) => Promise<Response>): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    return await fn(req);
  } catch (e) {
    if (e instanceof PhylaxError) return fail(e.code, e.message, e.status, e.details);
    return fail("internal", (e as Error)?.message ?? "unexpected error", 500);
  }
}
