# Contributing to CareGuard

## Getting Started

```bash
git clone https://github.com/harystyleseze/careguard
cd careguard
npm install --legacy-peer-deps
cp .env.example .env
npm run setup   # generates testnet wallets
```

See [QUICKSTART.md](QUICKSTART.md) for full environment setup.

## Node.js Version Policy

This project requires **Node.js 22** and will refuse to install on earlier versions.

| Artifact | Pin |
|----------|-----|
| `.nvmrc` | `22` |
| `package.json` `engines` | `>=22.0.0` |
| CI matrix (`ci.yml`) | `[22]` (single version, no drift) |
| `render.yaml` `NODE_VERSION` | `22` |

If you use [nvm](https://github.com/nvm-sh/nvm), running `nvm use` in the project root will activate the correct version automatically.

**Why Node 22?** The server and agent entry-points use `--experimental-strip-types` and `--experimental-transform-types`, which reached stable shape in Node 22. Running on Node 20 will fail silently in some code paths and loudly in others.

## Development Workflow

1. Fork the repo and create a branch from `main`
2. Make your changes with tests where applicable
3. Run `npm test` (root) and `cd dashboard && npm test` before pushing
4. Open a pull request — CI must be green before merge

When cutting a release, update [`docs/release/compatibility-matrix.md`](docs/release/compatibility-matrix.md) with the new version row (Node, SDK, and API contract versions). See [docs/release/versioning.md](docs/release/versioning.md) for the full release process.

## Dependency Management

Dependencies are kept up to date automatically via [Dependabot](.github/dependabot.yml).

### What gets updated automatically

| Ecosystem | Directory | Schedule | Auto-merge |
|-----------|-----------|----------|------------|
| npm (root) | `/` | Weekly (Monday) | patch + minor |
| npm (dashboard) | `/dashboard` | Weekly (Monday) | patch + minor |
| GitHub Actions | `/.github/workflows` | Weekly (Monday) | patch + minor |
| Docker | `/` | Weekly (Monday) | patch + minor |

### Grouped updates

Related packages are batched into a single PR to reduce noise:

- `@stellar/*` — Stellar SDK and related packages
- `@x402/*` — x402 payment protocol packages
- `openai` — OpenAI SDK (solo PR, intentionally ungrouped)
- `next` + `react` + `react-dom` — Next.js core (dashboard)
- `tailwindcss` + `@tailwindcss/*` — Tailwind (dashboard)

### Workspace pin alignment (enforced)

To prevent silent drift between the root and `dashboard/` workspaces, the following
pins are intentionally aligned and checked in CI/lint:

| Package | Root | Dashboard | Strategy | Rationale |
|---------|------|-----------|----------|-----------|
| `@types/node` | `^25.6.0` | `^25.6.0` | **Exact caret major aligned** — both `^25.6.0` | `engines.node >=22` requires Node 22+ globals/APIs. Node 20 types (`^20`) omit `fetch`/`ReadableStream`/`URLPattern` refinements and other lib updates, causing incorrect type-checking for dashboard server code and API routes. Majors are intentionally aligned on `25` (latest compatible with `>=22`). Any Node 20-specific type workarounds must be removed; `tsc --noEmit` is run on both workspaces in CI. |
| `tailwindcss` | `^4.3.1` | `^4.3.1` | **Pinned minor `^4.3.1`** | `^4` allowed dashboard to resolve `4.2.x` while root used `4.3.1`, silently diverging utility-class behavior between builds. Pinning both to `^4.3.1` guarantees reproducible builds and identical utility output. Verify with `npm ls tailwindcss` and diff Tailwind build output before/after bumps. |
| `@tailwindcss/postcss` | `^4.3.1` | `^4.3.1` | **Pinned minor `^4.3.1`** | Same rationale as `tailwindcss` — the PostCSS plugin must match the Tailwind minor to avoid untested 4.x combinations. Lockfiles are regenerated so both workspaces resolve identical versions. |
| `react` / `react-dom` | `^19.2.5` | `^19.2.5` | **Caret `^19.2.5` on both** | Mixed strategies (root `^19.2.5` vs dashboard exact `19.2.5`) risk silent drift and duplicate React copies, which breaks hooks/context. The project standardizes on **caret** to allow Dependabot patch/minor auto-merges while keeping the range identical. Verify with `npm ls react` (and `npm ls react-dom`) — must show a single deduped version. Exact pinning was considered but rejected because it blocks automated security patches. |

**Preventing future drift:**
- `npm ls react`, `npm ls tailwindcss`, and `npm ls @tailwindcss/postcss` must show single resolved versions; add to CI if not present.
- Dependabot groups (`next`+`react`+`react-dom` and `tailwindcss`+`@tailwindcss/*`) are kept in sync — do not update one workspace without the other.
- A manual lint check: `node -p "require('./package.json').devDependencies.react === require('./dashboard/package.json').dependencies.react"` should be truthy for the shared packages above.

### Major version bumps

Major bumps are **not** auto-merged. Dependabot will open a PR labeled `major-update` + `needs-review`. A maintainer must:

1. Review the changelog / migration guide
2. Update any breaking API usage
3. Approve and merge manually

### Auto-merge behavior

The [dependabot-automerge workflow](.github/workflows/dependabot-automerge.yml) runs on every Dependabot PR:

- Waits for CI to pass
- Auto-squash-merges patch and minor updates
- Adds a comment and labels on major updates, blocking auto-merge

## Release Process

For information on versioning, deprecations, hotfixes, and rollbacks, see:

- [Versioning Guidelines](docs/release/versioning.md) — SemVer rules for breaking/minor/patch releases
- [Deprecation Policy](docs/release/deprecation-policy.md) — How to safely deprecate APIs and env vars
- [Hotfix Process](docs/release/hotfix-process.md) — Emergency patch release workflow
- [Rollback Procedure](docs/release/rollback.md) — How to revert a bad release

## Architecture Decisions

Significant architectural decisions are documented as ADRs in
[docs/adr/README.md](docs/adr/README.md). Before making a major
change, check whether a prior ADR covers the topic. If no existing
ADR addresses the decision, propose one using the template in the
ADR index.

## Security

- Never commit secrets or `.env` files — they are gitignored
- Stellar private keys must stay out of source control
- Report vulnerabilities privately via GitHub Security Advisories

## Code Style

- TypeScript strict mode — no `any` without justification
- ESLint + Prettier (run `npm run lint` before pushing)
- Keep services self-contained; shared code goes in `shared/`

## API Changes

HTTP endpoints are described by [`docs/openapi.yml`](docs/openapi.yml), rendered
at `/docs` on the running server (<http://localhost:3000/docs> locally). The spec
is **generated** — never edit the YAML by hand:

1. Change the endpoint definition in [`scripts/gen-openapi.ts`](scripts/gen-openapi.ts)
2. Run `npm run gen-openapi` and commit the regenerated `docs/openapi.yml`
3. Run `npm run validate:openapi` — CI runs the same check plus a full OpenAPI
   3.1 lint, and fails on a malformed or out-of-date spec

See [`docs/api/README.md`](docs/api/README.md) for how the docs are hosted, how
CI validates the spec, and how the x402 `X-PAYMENT` auth scheme behaves.

## Observability

When adding or modifying metrics, follow the conventions in
[`docs/observability/metrics-naming.md`](docs/observability/metrics-naming.md).
This document covers naming conventions (prefixes, `_total` suffix, base-unit
policy), label-cardinality rules, and includes a checklist for new metrics.
Every new metric must also be added to
[`docs/observability/metrics-catalog.md`](docs/observability/metrics-catalog.md).

## Smart Contract Guidelines (Stellar/Soroban)

If contributing to on-chain components:

- Use a **two-step ownership transfer** (`propose_admin` → `accept_admin`) to prevent accidental transfers to dead addresses
- Set the admin to a **Stellar multisig account** with appropriate `low_threshold`, `med_threshold`, and `high_threshold` — a single-key admin is a single point of failure
- Vesting rights transfers (`transfer_vesting_rights`) must require `recipient.require_auth()` — never admin auth — so only the recipient can rotate their own address
- Fee parameters must be stored in `DataKey::FeeConfig` in persistent storage and must be immutable within a transaction to prevent bait-and-switch scenarios
- Major contract changes require a security review before deployment
