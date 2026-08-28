# CareGuard Tech Stack

## Runtime

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 22 (minimum) | Node 24 also tested |
| TypeScript | **5.8.3** | Exact pin — see below |

### TypeScript Version Policy

We pin to an exact TypeScript version (no `^` caret) to avoid surprise breaking changes from minor releases.

**Chosen version: `5.8.3`**

Rationale:
- TypeScript 6 has not been released; `^6.0.x` in `package.json` resolved to a non-existent pre-release on some registries and caused fresh-clone failures (issue #113).
- `5.8.3` is the latest stable 5.x patch at the time this document was written.
- Both root `package.json` and `dashboard/package.json` pin to `5.8.3`.

To upgrade TypeScript in the future: bump the exact version in both `package.json` files, run `npm install --legacy-peer-deps`, commit the lock file, and verify `tsc --version` in CI.

## Backend

| Package | Purpose |
|---------|---------|
| Express 5 | HTTP server framework |
| tsx 4.x | TypeScript loader (dev + prod, see ADR 006) |
| ioredis | Redis client (optional — falls back to in-process cache when `REDIS_URL` is unset) |
| zod | Runtime schema validation |
| dotenv | Environment variable loading |

## Frontend (dashboard)

| Package | Version |
|---------|---------|
| Next.js | 16.x |
| React | 19.x |
| TypeScript | 5.8.3 |
| Tailwind CSS | 4.x |

## Payments

| Package | Purpose |
|---------|---------|
| @x402/express | x402 payment middleware (Stellar) |
| @stellar/mpp + mppx | Machine Payments Protocol |
| @stellar/stellar-sdk | Stellar blockchain SDK |

## Observability

| Tool | Purpose |
|------|---------|
| Prometheus | Metrics scraping (docker-compose.override.yml) |
| Grafana | Metrics dashboard (docker-compose.override.yml) |

## Testing

| Tool | Purpose |
|------|---------|
| vitest | Unit & integration test runner |
| supertest | HTTP assertion helper |
| ioredis-mock | Redis mock for unit tests |
| Playwright | End-to-end tests (dashboard) |

## Dependency version pairing

Some dependencies must move together even though they are declared independently.
`scripts/check-vitest-version-lock.mjs` (wired into CI) enforces the first rule.

- **`vitest` ↔ `@vitest/coverage-v8` (issue #1395)** — `@vitest/coverage-v8` is
  published against the exact `vitest` version it instruments. Both are declared
  with identical `^` ranges and MUST be bumped together to the same release.
  `npm run check:vitest-lock` fails CI if the declared specifiers or the
  lockfile-resolved versions diverge.

- **`ioredis` ↔ `ioredis-mock` (issue #1385)** — ioredis-mock's major version is
  unrelated to ioredis's. This repo pairs `ioredis ^5` (dependencies) with
  `ioredis-mock ^8` (devDependencies); ioredis-mock 8.x declares `ioredis ^5` as
  a peer dependency and tracks the ioredis 5.x command surface. Commands used
  (`GET`, `SET` incl. `PX`/`NX`, `INCR`, `DEL`) are covered by the mock — see
  `shared/__tests__/redis-ioredis-mock.test.ts`. When bumping ioredis to a new
  major, move ioredis-mock to the 8.x line that tracks that major.

- **`proper-lockfile` (issue #1386)** — we intentionally stay on `^4.1.2`.
  `4.1.2` is the latest published release (Jun 2022) with no newer major; the
  package is a stable cooperative file-lock primitive with no known
  vulnerabilities. A Redis-based lock cannot replace it because the file locks
  (audit log, orders JSON, wallet migration) must work when `REDIS_URL` is unset.
  Do not migrate to a Redis lock without adding a filesystem fallback.
