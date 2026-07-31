# Implementation Plan: Document the Audit-Log JSONL Record Schema (#756)

Add a precise schema doc for the hash-chained JSONL records `shared/audit-log.ts` writes to `data/audit.log.jsonl`, so operators/integrators can parse and verify the log without reverse-engineering the source.

## Proposed Changes

### Data Documentation

#### [NEW] [audit-log-schema.md](docs/data/audit-log-schema.md)
New schema doc, scoped as the operator/integrator reference (as opposed to ADR 008's design rationale). Documents:
- Every field of a record — `timestamp`, `event`, `actor`, `details`, `prevHash`, `hash` — with type, who sets it, and meaning, sourced from the `AuditEntry` interface and `appendAuditEntry()` in `shared/audit-log.ts`.
- An event/actor catalog enumerated from every real (non-test) call site of `appendAuditEntry()` across the codebase (`agent/runner.ts`, `agent/server.ts`, `agent/tools.ts`, `server.ts`, `shared/wallet-balance.ts`, `shared/task-validation.ts`).
- The `canonicalize()` serialization rules and the exact hash formula (`hash_i = SHA256(prevHash_i + canonicalize(payload_i))`), plus a hand-verification snippet.
- Offline verification via `scripts/verify-audit-log.ts`, including the `AUDIT_FILE` env override to point it at a specific rotated archive instead of only the live file.
- Rotation file naming (`.1` newest archive .. `.12` oldest) and the exact rotation algorithm from `rotateLogs()`.
- **Empirically verified** (not inferred from reading the code): rotation does not carry the hash chain forward. I reproduced the actual rotation code path in isolation (forcing rotation with oversized entries) and confirmed that the new active file's first entry, and every rotated segment's first entry, starts at the genesis `prevHash` (`000...000`) — there is no cryptographic link between one segment's last hash and the next segment's first entry. This corrects an ambiguous implication in ADR 008's rotation note and is documented precisely, with the reasoning traced through `rotateLogs()` and `getLastLine()`.
- An annotated example record, generated against the real `appendAuditEntry()`/`canonicalize()` logic (not hand-typed) so every hash in the example is genuine — independently re-verified with a standalone Python re-implementation of `canonicalize()` that reproduces the stored `hash` from the example JSON.

#### [MODIFY] [storage.md](docs/data/storage.md)
Added `audit.log.jsonl` / `audit.log.jsonl.1..12` to the existing directory-layout tree and one linking sentence to the new schema doc. No existing content removed or reworded.

#### [MODIFY] [008-audit-log-hash-chain.md](docs/adr/008-audit-log-hash-chain.md)
Added one blockquote pointer to the new schema doc directly under the ADR header, distinguishing the ADR's design-rationale scope from the new doc's operator-reference scope. No existing ADR content removed or reworded.

---

## Verification Plan

### Manual Verification
- Every field, event value, and actor value cross-checked against `shared/audit-log.ts` and its real (non-test) call sites — not assumed from the ADR alone.
- Rotation chain-continuity behavior verified empirically: extracted the audit-log write/rotate logic into a standalone script, forced rotation with oversized entries, and inspected the resulting files directly to confirm the genesis-reset behavior at each segment boundary.
- The annotated example record's `hash` independently re-verified with a second, standalone implementation of `canonicalize()` (Python) against the example JSON — confirmed to reproduce the exact stored hash.
- No source files touched — `shared/audit-log.ts` and `scripts/verify-audit-log.ts` were read only, not modified, per the issue's scope.
