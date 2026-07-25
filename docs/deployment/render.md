# Render Deployment (Build Artifact Pipeline)

This document describes the build artifact pipeline used by the Render deployment for CareGuard.

## Overview

The project compiles TypeScript to JavaScript using the standard `tsc` compiler with a build-specific configuration. The compiled output is emitted to the `dist/` directory and served from there by the Render service.

## Build Pipeline

1. **`npm ci`** — Install exact dependency versions from `package-lock.json`.
2. **`npm run build`** — Compile TypeScript to JavaScript using `tsc -p tsconfig.build.json`.

The `tsconfig.build.json` extends the root `tsconfig.json` with the following overrides:

| Option | Value | Description |
|--------|-------|-------------|
| `noEmit` | `false` | Enable output file emission |
| `outDir` | `./dist` | Emit compiled files to the `dist/` directory |
| `rewriteRelativeImportExtensions` | `true` | Rewrite `.ts` import extensions to `.js` in the output |
| `declaration` | `false` | Skip `.d.ts` emission for the production build |
| `sourceMap` | `true` | Generate source maps for error stack traces |

### Runtime

The `startCommand` in `render.yaml` runs the compiled entrypoint:

```
node dist/server.js
```

No Node.js experimental flags (`--experimental-strip-types`, `--experimental-transform-types`) are needed at runtime because all TypeScript has been compiled to JavaScript during the build step.

## Required Node.js Version

The service must run on **Node.js 22** or later (as specified in `.nvmrc` and `package.json` `engines`).

## Verification

To verify the build locally before deployment:

```bash
npm run build
ls dist/server.js              # compiled entrypoint exists
node dist/server.js             # starts the server from compiled output
```

## Comparison with Local Development

| Aspect | Render (Production) | Local Development |
|--------|---------------------|-------------------|
| Build | `tsc` compiles to `dist/` | `tsx` runtime loads `.ts` directly |
| Start command | `node dist/server.js` | `node --import tsx server.ts` |
| Flags needed | None | None (tsx runtime) |

## Pre-Deploy Checklist

Before routing live traffic to a Render deployment, work through the gates in
[`docs/release/production-readiness.md`](../release/production-readiness.md).

Key items specific to Render:

- Set `NODE_ENV=production` as a Render environment variable.
- Store all secrets (`AGENT_SECRET_KEY`, `OZ_FACILITATOR_API_KEY`, `LLM_API_KEY`, `CAREGIVER_TOKEN`) as **secret environment variables** in the Render dashboard — not plain env vars — so they are not visible in logs or the UI.
- After deploy, verify `GET /health` returns 200 (Render uses this as the `healthCheckPath` in `render.yaml`).
- Run `GET /ready` manually after deploy to confirm all dependency checks pass before routing caregiver traffic.
- For testnet → mainnet cutovers, check the dedicated gates in the production-readiness checklist (Horizon URL, USDC issuer, `MOCK_NETWORK`, agent wallet funding).

See the full pre-deploy checklist: [`docs/release/production-readiness.md`](../release/production-readiness.md).

## Related

- [`docs/release/production-readiness.md`](../release/production-readiness.md) — full go-live checklist
- [`docs/observability/health-checks.md`](../observability/health-checks.md) — `/health` and `/ready` response schemas
- [`docs/sla.md`](../../docs/sla.md) — uptime targets and maintenance-window policy
