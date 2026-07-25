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

## Security

- Never commit secrets or `.env` files — they are gitignored
- Stellar private keys must stay out of source control
- Report vulnerabilities privately via GitHub Security Advisories

## Code Style

- TypeScript strict mode — no `any` without justification
- ESLint + Prettier (run `npm run lint` before pushing)
- Keep services self-contained; shared code goes in `shared/`

## Changelog Guidelines

`CHANGELOG.md` is **auto-generated** — do not edit it by hand. The [release workflow](../.github/workflows/release.yml) runs [release-drafter](https://github.com/release-drafter/release-drafter) on every `v*` tag push, then [changelog-updater-action](https://github.com/stefanzweifel/changelog-updater-action) commits the result to `CHANGELOG.md` on `main`.

### How entries are generated

1. The release-drafter scans merged PRs since the previous tag.
2. It groups them by the **label** on the PR into changelog categories (see below).
3. Each entry is formatted as:  
   `- <PR title> @<author> (#<number>)`
4. The resulting release notes are committed to `CHANGELOG.md` automatically.

Because the generator uses PR **titles** and **labels**, writing good PR titles and applying the correct label are the only two things contributors need to do.

### PR title conventions

- Use the imperative mood: "Add X", "Fix Y", "Remove Z".
- Keep titles concise (≤ 72 characters) — they appear verbatim in the changelog.
- For breaking changes, prefix the title with `[BREAKING]`:  
  `[BREAKING] Remove deprecated /v1/agent endpoint`
- Do not include issue numbers in the title — the PR link is enough.

### Changelog categories and label mapping

| Changelog category | PR label(s) | When to use |
|--------------------|-------------|-------------|
| 🚀 Features | `feat`, `feature` | New user-facing functionality |
| 🐛 Bug Fixes | `fix`, `bugfix` | Defect corrections |
| 🔒 Security | `security` | Vulnerability fixes, auth/secret changes |
| 📦 Maintenance | `chore`, `deps`, `dependencies` | Refactors, dependency bumps, CI changes |
| 📚 Documentation | `docs`, `documentation` | Docs-only changes (no code change) |

Apply exactly **one** category label per PR. If a PR touches multiple categories, use the highest-impact one (Security > Features > Bug Fixes > Maintenance > Documentation).

### Breaking-change markers

To trigger a **MAJOR** version bump (per the `version-resolver` in `release-drafter.yml`):

- Apply the `major` or `breaking-change` label to the PR.
- Prefix the PR title with `[BREAKING]`.
- Describe the migration path in the PR body.

Minor bumps are triggered by the `feat` / `feature` label. All other labels produce a patch bump.

### Excluding a PR from the changelog

Some PRs should not appear in user-facing release notes (e.g. internal tooling, test-only changes):

- Apply the `chore` label — these are grouped under 📦 Maintenance, which is the least prominent category.
- If the PR should be **completely invisible** in release notes (no current mechanism in release-drafter to fully suppress a category), open a follow-up to configure an `exclude-labels` block in `.github/release-drafter.yml`.

### Cross-references

- [docs/release/versioning.md](docs/release/versioning.md) — version bumping rules and release process
- [CHANGELOG.md](CHANGELOG.md) — auto-generated change history
- [.github/release-drafter.yml](.github/release-drafter.yml) — category/label configuration

---

## Smart Contract Guidelines (Stellar/Soroban)

If contributing to on-chain components:

- Use a **two-step ownership transfer** (`propose_admin` → `accept_admin`) to prevent accidental transfers to dead addresses
- Set the admin to a **Stellar multisig account** with appropriate `low_threshold`, `med_threshold`, and `high_threshold` — a single-key admin is a single point of failure
- Vesting rights transfers (`transfer_vesting_rights`) must require `recipient.require_auth()` — never admin auth — so only the recipient can rotate their own address
- Fee parameters must be stored in `DataKey::FeeConfig` in persistent storage and must be immutable within a transaction to prevent bait-and-switch scenarios
- Major contract changes require a security review before deployment
