# Versioning and Release Process

CareGuard follows [Semantic Versioning 2.0.0](https://semver.org/) (`MAJOR.MINOR.PATCH`).

## Version Bumping Rules

| Change type | Version bump | Release-drafter label |
|-------------|-------------|----------------------|
| Backwards-incompatible API or protocol change | `MAJOR` | `major`, `breaking-change` |
| New backwards-compatible feature | `MINOR` | `feat`, `feature` |
| Bug fix, docs, chore, dependency update | `PATCH` | `fix`, `bugfix`, `chore`, `docs`, `security` |

The `version-resolver` block in [`.github/release-drafter.yml`](../../.github/release-drafter.yml) drives the automatic bump. The label on the merged PR determines which component increments.

## Cutting a Release

1. Ensure `main` is green (CI + security scan).
2. Tag the commit: `git tag v<version> && git push --tags`.
3. The [release workflow](../../.github/workflows/release.yml) publishes a GitHub release and updates `CHANGELOG.md` automatically.
4. Update [`docs/release/compatibility-matrix.md`](./compatibility-matrix.md) to add a row for the new version.
5. Run through the pre-deploy gates in [`docs/release/production-readiness.md`](./production-readiness.md) before routing traffic.

## Pre-release Tags

Use `-beta.N` or `-rc.N` suffixes for pre-release tags (e.g. `v2.0.0-rc.1`). These are not auto-published by the release workflow.

## Related

- [Compatibility matrix](./compatibility-matrix.md) — Node, SDK, and API contract versions per release
- [Production-readiness checklist](./production-readiness.md) — go-live gates
- [Changelog guidelines](../../CONTRIBUTING.md#changelog-guidelines) — how entries are generated
- [CHANGELOG.md](../../CHANGELOG.md) — auto-generated change history
