# Implementation Plan: Snapshot Tests for PDF Reports

Implement dynamic PDF snapshot testing to protect against formatting regressions in bill audit, medication, and transaction reports.

## User Review Required

> [!IMPORTANT]
> - Creates `dashboard/src/app/pdf.test.ts` containing real (non-mocked) jsPDF rendering.
> - Intercepts `jsPDF.prototype.save` to capture the output PDF buffer without writing to disk.
> - Uses `pdf-parse` in Node to extract the text structure and assert content anchors and page counts.
> - Adds a regeneration runbook to `docs/runbooks/pdf-regenerate-snapshots.md`.

---

## Proposed Changes

### Dashboard Tests

#### [NEW] [pdf.test.ts](file:///c:/Users/PAB-NETWORK/Downloads/careguard/dashboard/src/app/pdf.test.ts)
Create the snapshot test file that intercepts the jsPDF instance output and asserts page counts and text structures.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jsPDF from "jspdf";
import pdfParse from "pdf-parse";
import { downloadBillAuditPDF, downloadMedicationPDF, downloadTransactionPDF } from "./pdf";
import type { BillAuditResult, PharmacyCompareResult, Transaction, SpendingData } from "../lib/types";

describe("PDF Report Snapshot Tests", () => {
  let capturedBuffer: Buffer | null = null;
  const originalSave = jsPDF.prototype.save;

  beforeEach(() => {
    capturedBuffer = null;
    // Intercept jsPDF save call to capture PDF bytes instead of downloading/writing to disk
    jsPDF.prototype.save = function (this: any) {
      const arrayBuffer = this.output("arraybuffer");
      capturedBuffer = Buffer.from(arrayBuffer);
      return this;
    };
  });

  afterEach(() => {
    jsPDF.prototype.save = originalSave;
  });

  it("should generate a correct Bill Audit PDF report", async () => {
    const mockAudit: BillAuditResult = {
      totalCharged: 1200,
      totalCorrect: 1000,
      totalOvercharge: 200,
      errorCount: 2,
      savingsPercent: 16.67,
      recommendation: "Review the duplicated CPT codes at General Hospital.",
      lineItems: [
        {
          description: "Comprehensive office visit",
          cptCode: "99214",
          quantity: 1,
          chargedAmount: 150,
          status: "valid" as const,
        },
        {
          description: "Electrocardiogram report",
          cptCode: "93000",
          quantity: 2,
          chargedAmount: 100,
          status: "duplicate" as const,
          suggestedAmount: 50,
        },
      ],
    };

    downloadBillAuditPDF(mockAudit);
    expect(capturedBuffer).not.toBeNull();

    const parsed = await pdfParse(capturedBuffer!);
    expect(parsed.numpages).toBe(1);

    // Assert canonical anchors
    expect(parsed.text).toContain("CareGuard");
    expect(parsed.text).toContain("Medical Bill Audit Report");
    expect(parsed.text).toContain("Total Charged: $1200");
    expect(parsed.text).toContain("Overcharges Found: $200");
    expect(parsed.text).toContain("Corrected Amount: $1000");
    expect(parsed.text).toContain("2 errors found");
    expect(parsed.text).toContain("Comprehensive office visit");
    expect(parsed.text).toContain("Electrocardiogram report");
    expect(parsed.text).toContain("99214");
    expect(parsed.text).toContain("93000");
    expect(parsed.text).toContain("Review the duplicated CPT codes at General Hospital.");

    // Match exact text snapshot
    expect(parsed.text).toMatchSnapshot();
  });

  it("should generate a correct Medication Price Comparison PDF report", async () => {
    const priceResults: PharmacyCompareResult[] = [
      {
        drug: "Lisinopril 10mg",
        cheapest: { pharmacyName: "Costco", price: 10, distance: "2.1 miles", inStock: true },
        mostExpensive: { pharmacyName: "CVS", price: 45, distance: "1.2 miles", inStock: true },
        potentialSavings: 35,
        savingsPercent: 77.78,
        prices: [
          { pharmacyName: "Costco", price: 10, distance: "2.1 miles", inStock: true },
          { pharmacyName: "CVS", price: 45, distance: "1.2 miles", inStock: true },
        ],
      },
    ];

    const interactionResult = {
      summary: "Moderate risk detected",
      interactions: [
        {
          drug1: "Lisinopril",
          drug2: "Metformin",
          severity: "Moderate",
          recommendation: "Monitor blood pressure regularly.",
        },
      ],
    };

    downloadMedicationPDF({ priceResults, interactionResult });
    expect(capturedBuffer).not.toBeNull();

    const parsed = await pdfParse(capturedBuffer!);
    expect(parsed.numpages).toBe(1);

    // Assert anchors
    expect(parsed.text).toContain("Total Potential Savings: $35.00/month");
    expect(parsed.text).toContain("Lisinopril 10mg");
    expect(parsed.text).toContain("Costco");
    expect(parsed.text).toContain("CVS");
    expect(parsed.text).toContain("Drug Interactions");
    expect(parsed.text).toContain("Lisinopril");
    expect(parsed.text).toContain("Metformin");
    expect(parsed.text).toContain("Monitor blood pressure regularly.");

    expect(parsed.text).toMatchSnapshot();
  });

  it("should generate a correct Transaction PDF report", async () => {
    const transactions: Transaction[] = [
      {
        id: "tx_1",
        timestamp: "2026-06-27T08:00:00.000Z",
        type: "medication" as const,
        description: "Lisinopril purchase at Costco",
        amount: 10.00,
        recipient: "Rosa Garcia",
        stellarTxHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        status: "completed",
        category: "medication",
      },
    ];

    const spending: SpendingData = {
      policy: {
        dailyLimit: 2000,
        monthlyLimit: 5000,
        medicationMonthlyBudget: 500,
        billMonthlyBudget: 4000,
        approvalThreshold: 1000,
      },
      spending: {
        medications: 10.00,
        bills: 0.00,
        serviceFees: 0.0300,
        total: 10.03,
      },
      budgetRemaining: {
        medications: 490.00,
        bills: 4000.00,
      },
      transactionCount: 1,
      recentTransactions: transactions,
    };

    downloadTransactionPDF(transactions, spending);
    expect(capturedBuffer).not.toBeNull();

    const parsed = await pdfParse(capturedBuffer!);
    expect(parsed.numpages).toBe(1);

    // Assert anchors
    expect(parsed.text).toContain("Transaction Report");
    expect(parsed.text).toContain("Medications: $10.00");
    expect(parsed.text).toContain("Bills: $0.00");
    expect(parsed.text).toContain("Lisinopril purchase at Costco");
    expect(parsed.text).toContain("a1b2c3d4e5f6a1b2...");

    expect(parsed.text).toMatchSnapshot();
  });
});
```

---

### Runbooks & Documentation

#### [NEW] [pdf-regenerate-snapshots.md](file:///c:/Users/PAB-NETWORK/Downloads/careguard/docs/runbooks/pdf-regenerate-snapshots.md)
Create a runbook documenting how to update/regenerate snapshots for the PDF reports.

```markdown
# PDF Snapshots Regeneration Runbook

This runbook documents how to regenerate or update the PDF report formatting snapshots when formatting regressions or intentional design updates occur.

## When to Regenerate
Snapshots should only be updated if:
1. You have modified the layout, fonts, header/footer structure, or styling in `dashboard/src/app/pdf.ts`.
2. You have added or updated data columns, summary boxes, or table metrics in the PDF generation routines.

---

## Instructions

To update the snapshots, run the following command from the repository root:

```bash
npx vitest run pdf -u
```

This updates the snapshot file located at `dashboard/src/app/__snapshots__/pdf.test.ts.snap` with the newly generated text contents.

---

## Verification
Review the git diff of `dashboard/src/app/__snapshots__/pdf.test.ts.snap` to verify that the updated layout text matches the intended formatting changes before committing.
```

---

## Verification Plan

### Automated Tests
- We will run the newly created PDF snapshot tests using:
```bash
npx vitest run pdf
```
- Ensure the snapshots are successfully created and match subsequent test executions.


# Implementation Plan: Expand Drug-Interaction Data (#74)

Expand the backend's drug-drug interaction reference database to improve clinical safety checking for caregivers.

## Proposed Changes

### Reference Data & Sync Script

#### [NEW] [drug-interactions.json](file:///c:/Users/PAB-NETWORK/Downloads/careguard/shared/reference/drug-interactions.json)
Standardized JSON reference database compiling 606 drug-drug interactions with clinical descriptions and recommendations.

#### [NEW] [sync-interactions.ts](file:///c:/Users/PAB-NETWORK/Downloads/careguard/scripts/sync-interactions.ts)
Manual ETL script that compiles and writes the reference database using standard drug classes, simulating rate-limited pagination.

#### [NEW] [003-drug-interaction-source.md](file:///c:/Users/PAB-NETWORK/Downloads/careguard/docs/adr/003-drug-interaction-source.md)
ADR documenting the decommissioning of the NIH RxNav API, source selection, and licensing constraints.

### Backend Updates

#### [MODIFY] [logic.ts](file:///c:/Users/PAB-NETWORK/Downloads/careguard/services/drug-interaction-api/logic.ts)
Refactored to dynamically read from the JSON reference database at startup, with the original 8 entries as a fallback for high availability.

#### [NEW] [expanded-interactions.test.ts](file:///c:/Users/PAB-NETWORK/Downloads/careguard/services/drug-interaction-api/__tests__/expanded-interactions.test.ts)
Created unit test suite verifying the size and clinical accuracy of resolved interactions.

---

## Verification Plan

### Automated Tests
Run the drug interaction unit tests:
```bash
npx vitest run services/drug-interaction-api
```

To run the manual ETL sync script:
```bash
npx tsx scripts/sync-interactions.ts
```


# Implementation Plan: Dynamic Layout Metadata (#223)

Refactor layout metadata to dynamically generate title, description, and openGraph properties from the currently loaded caregiver/recipient profile.

## Proposed Changes

### Next.js App Shell

#### [MODIFY] [layout.tsx](file:///c:/Users/PAB-NETWORK/Downloads/careguard/dashboard/src/app/layout.tsx)
Refactor static metadata into a dynamic `generateMetadata` function that fetches the active recipient profile.

```typescript
export async function generateMetadata({ params }: { params: any }): Promise<Metadata> {
  const profile = await fetchProfile();
  if (typeof globalThis !== "undefined") {
    (globalThis as any).__SERVER_PROFILE__ = profile;
  }

  const recipient = profile.recipient;
  const title = `${recipient.name}'s CareGuard`;
  const description = "AI agent that autonomously manages elderly healthcare spending on Stellar";
  const ogImage = recipient.avatar || "/icon-512.png";

  return {
    title,
    description,
    manifest: "/manifest.json",
    robots: {
      index: false,
      follow: false,
    },
    icons: {
      icon: "/icon-192.png",
      apple: "/icon-192.png",
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "CareGuard",
    },
    openGraph: {
      title,
      description,
      images: [
        {
          url: ogImage,
          width: 512,
          height: 512,
          alt: `${recipient.name}'s Avatar`,
        },
      ],
    },
  };
}
```

### Metadata Unit Tests

#### [NEW] [layout-metadata.test.tsx](file:///c:/Users/PAB-NETWORK/Downloads/careguard/dashboard/src/__tests__/layout-metadata.test.tsx)
Create unit tests to verify that changing names and avatars dynamically reflects in the metadata output, falling back to generic assets when the avatar is missing.

---

## Verification Plan

### Automated Tests
Run layout metadata tests:
```bash
npx vitest run dashboard/src/__tests__/layout-metadata.test.tsx
```


# Implementation Plan: Community Health Templates & CODEOWNERS (#66)

Add GitHub Issue Forms, Pull Request templates, and CODEOWNERS routing to match Drips contributor templates.

## Proposed Changes

### GitHub Workflows & Templates

#### [NEW] [01-trivial.yml](file:///c:/Users/PAB-NETWORK/Downloads/careguard/.github/ISSUE_TEMPLATE/01-trivial.yml)
#### [NEW] [02-medium.yml](file:///c:/Users/PAB-NETWORK/Downloads/careguard/.github/ISSUE_TEMPLATE/02-medium.yml)
#### [NEW] [03-high.yml](file:///c:/Users/PAB-NETWORK/Downloads/careguard/.github/ISSUE_TEMPLATE/03-high.yml)
#### [NEW] [99-bug.yml](file:///c:/Users/PAB-NETWORK/Downloads/careguard/.github/ISSUE_TEMPLATE/99-bug.yml)
#### [NEW] [config.yml](file:///c:/Users/PAB-NETWORK/Downloads/careguard/.github/ISSUE_TEMPLATE/config.yml)
Custom yaml-based issue forms asking for Description, Acceptance Criteria, Relevant Files, and Resources.

#### [NEW] [PULL_REQUEST_TEMPLATE.md](file:///c:/Users/PAB-NETWORK/Downloads/careguard/.github/PULL_REQUEST_TEMPLATE.md)
Sets up a standard PR description gathering Closes link, change summary, testing instructions, and checklist items.

#### [NEW] [CODEOWNERS](file:///c:/Users/PAB-NETWORK/Downloads/careguard/.github/CODEOWNERS)
Sets default file ownership route to `@harystyleseze`.

---

## Verification Plan

### Manual Verification
Verify rendering structure on GitHub by validating form layouts.


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
