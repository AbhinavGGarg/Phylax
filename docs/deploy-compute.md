# Deploying the Phylax party compute layer

The **compute layer** is the privacy-preserving PSI/MPC core: a protected
**coordinator** service plus one **party** detection-agent service per partner
org (`fintrust`, `swiftcart`, `pingline`). The **control plane** (Postgres, Auth,
RLS, Realtime, Storage, edge functions) is **InsForge cloud** — project
`kd6vibk3`, `https://kd6vibk3.us-east.insforge.app` — and is deployed separately
(migrations + `functions deploy`). This document covers only the compute layer.

| Service | Image | Port | Env |
|---|---|---|---|
| coordinator | `parties/Dockerfile.coordinator` | 8090 | `.env.local` |
| party-fintrust | `parties/Dockerfile.party` | 8091 → 8091 | `.env.local` + `PHYLAX_ORG=fintrust` |
| party-swiftcart | `parties/Dockerfile.party` | 8092 → 8091 | `.env.local` + `PHYLAX_ORG=swiftcart` |
| party-pingline | `parties/Dockerfile.party` | 8093 → 8091 | `.env.local` + `PHYLAX_ORG=pingline` |
| coordinator-secretflow (opt.) | `parties/Dockerfile.secretflow` | 8090 | `.env.local` + `PHYLAX_PSI_BACKEND=secretflow` |

---

## (a) Local — Docker Compose party layer + Node host

The demo host (`control-plane/server.mjs`) drives the LIVE InsForge control plane
and, in the demo, spawns the Python coordinator **in-process** (`runCoordinator`).
The Compose party layer is the functional, HTTP-addressable topology of that same
core. Both read the same `.env.local`.

```bash
# 1. Bring up the party compute layer (coordinator + 3 party services).
#    Reads shared secrets from .env.local via env_file. Build context is repo root.
docker compose up --build
#    coordinator      → http://localhost:8090/health
#    party-fintrust   → http://localhost:8091/health
#    party-swiftcart  → http://localhost:8092/health
#    party-pingline   → http://localhost:8093/health

# 2. In another shell, run the operator console host (talks to InsForge cloud).
npm run dev
#    → http://localhost:8890/console

# 3. Exercise the coordinator directly (the same call dispatch-party-run makes):
curl -s localhost:8090/health
curl -s -X POST localhost:8090/run -H 'content-type: application/json' \
     -d '{"runId":"local-smoke-1"}' | head -c 400

# Party service endpoints (true distributed topology seam):
curl -s localhost:8091/health
curl -s -X POST localhost:8091/psi/blind-own            # -> {"elements":["<decimal-string>", ...]}
curl -s localhost:8091/commitments
curl -s localhost:8091/features
```

> **Wire format:** PSI group elements are 2048-bit integers and cross the wire as
> **decimal strings** (JSON numbers would lose precision). `/psi/raise` takes and
> returns `{"elements":[<decimal-string>...]}`; parse back with `int()`.

`docker compose down` to stop. The end-to-end verifier `npm run verify:e2e` uses
the in-process coordinator path and does not require Compose.

---

## (b) InsForge Custom Compute deploy

> ⚠️ **Compute is in InsForge private preview** — access is gated per project and
> flags may change. Source of truth:
> `~/.agents/skills/insforge-cli/references/compute-deploy.md`.

### Flag reality check (important)

The InsForge CLI **has no `--dockerfile` flag**. `compute deploy` accepts a
positional **`[dir]`** (source mode) that must contain a file named literally
`Dockerfile`, **or** `--image <url>` (image mode). Documented options are only:
`--name` (required), `--port`, `--cpu`, `--memory`, `--region`, and
`--env <json>` **or** `--env-file <path>` (mutually exclusive).

Because `parties/` holds **three** Dockerfiles (`Dockerfile.party`,
`Dockerfile.coordinator`, `Dockerfile.secretflow`), plain source mode cannot pick
one — it looks for `parties/Dockerfile`, which does not exist. Use **image mode**
(recommended), or stage a per-service dir whose file is named `Dockerfile`.

### Recommended — image mode

Build each image locally with `-f`, push to a public registry, deploy by image
(nothing but the InsForge CLI needed at deploy time):

```bash
# --- coordinator ---
docker build -f parties/Dockerfile.coordinator -t ghcr.io/<you>/phylax-coordinator:v1 .
docker push ghcr.io/<you>/phylax-coordinator:v1
npx @insforge/cli compute deploy \
  --image ghcr.io/<you>/phylax-coordinator:v1 \
  --name phylax-coordinator \
  --port 8090 \
  --env-file .env.local

# --- party services (one image, three deploys with a per-org env file) ---
docker build -f parties/Dockerfile.party -t ghcr.io/<you>/phylax-party:v1 .
docker push ghcr.io/<you>/phylax-party:v1

# .env.local has no PHYLAX_ORG, so append it per org (env-file and --env are
# mutually exclusive, so bake ORG into a copy of the env file):
for org in fintrust swiftcart pingline; do
  cat .env.local > .env.$org
  printf '\nPHYLAX_ORG=%s\n' "$org" >> .env.$org
  npx @insforge/cli compute deploy \
    --image ghcr.io/<you>/phylax-party:v1 \
    --name phylax-party-$org \
    --port 8091 \
    --env-file .env.$org
done
# (rm .env.fintrust .env.swiftcart .env.pingline afterwards — they hold secrets.)
```

### Alternative — source mode (needs `flyctl` on PATH, no local Docker daemon)

Source mode builds on Fly's remote builder but requires the target file to be
named `Dockerfile` in the deploy dir. Stage one per service, e.g.:

```bash
mkdir -p .deploy/coordinator && cp -r parties/* .deploy/coordinator/
cp parties/Dockerfile.coordinator .deploy/coordinator/Dockerfile
# NOTE: these Dockerfiles COPY `parties/...` (build context = repo root). For
# source mode with context = the staged dir, adjust the COPY paths to `./` first,
# or keep image mode above (which uses the repo-root context as written).
npx @insforge/cli compute deploy .deploy/coordinator \
  --name phylax-coordinator --port 8090 --env-file .env.local
```

> Image mode is preferred here precisely because the Dockerfiles are written for
> a **repo-root** build context (`COPY parties/...`), which `docker build -f ... .`
> and Compose satisfy directly.

### Rotate a single secret without wiping the rest

```bash
npx @insforge/cli compute update <service-id> \
  --env-set WORKER_HMAC_SECRET=<new> \
  --env-set PHYLAX_JOINT_SECRET=<new>
```

### Unverified / flag caveats

- `--dockerfile` — **does not exist** in the InsForge CLI (verified against
  `compute-deploy.md`). Do not pass it.
- `--port` default is `8080`; always pass `--port 8090` (coordinator) / `8091`
  (party) explicitly.
- `--cpu`/`--memory` default to `shared-1x` / `512 MB`. The stdlib DDH backend is
  CPU-light; the **SecretFlow** image is much heavier — size it up (e.g.
  `--cpu performance-2x --memory 4096`) if you deploy `Dockerfile.secretflow`.

---

## (c) Flipping the PSI backend to SecretFlow SPU

The protected match runs on one of two backends, selected by
`PHYLAX_PSI_BACKEND`:

- `modp-ddh` (default) — pure-stdlib DDH/ECDH PSI over the RFC 3526 2048-bit MODP
  group. Runs anywhere; identical results.
- `secretflow` — SecretFlow SPU `ECDH_PSI_3PC` (see
  `parties/common/psi_secretflow.py`, pinned `secretflow==1.10.0b1`).

**`secretflow` only works on the SecretFlow image.** On the stdlib
`Dockerfile.coordinator` image, setting `PHYLAX_PSI_BACKEND=secretflow` **fails
closed**: `run_psi` imports the SecretFlow backend, `_available()` returns
`False`, and it raises `PSIError` (the coordinator service returns HTTP 500) — by
design, so you never silently fall back. SecretFlow requires **Linux + Python
3.10/3.11**.

**Local (Compose):**
```bash
docker compose stop coordinator                 # 8090 conflict: run one or the other
# uncomment the coordinator-secretflow service in docker-compose.yml, then:
docker compose up --build coordinator-secretflow
```
`Dockerfile.secretflow` sets `PHYLAX_PSI_BACKEND=secretflow` and the compose
service overrides `.env.local` with the same value.

**InsForge:**
```bash
docker build -f parties/Dockerfile.secretflow -t ghcr.io/<you>/phylax-coordinator-sf:v1 .
docker push ghcr.io/<you>/phylax-coordinator-sf:v1
cat .env.local > .env.sf && printf '\nPHYLAX_PSI_BACKEND=secretflow\n' >> .env.sf
npx @insforge/cli compute deploy \
  --image ghcr.io/<you>/phylax-coordinator-sf:v1 \
  --name phylax-coordinator --port 8090 \
  --cpu performance-2x --memory 4096 \
  --env-file .env.sf
# rm .env.sf afterwards (holds secrets).
```

> The base image `secretflow/secretflow-anolis8 (tag per Ant Group registry)` may need to be pulled on
> a Linux/amd64 builder. If that tag is unavailable, the `Dockerfile.secretflow`
> header documents the `python:3.11-slim` + `requirements-secretflow.txt` fallback
> (Linux only). This image is **not built in this environment** (no docker daemon).
