# Implementation Plan: Shared next/navigation Mock (#1094) & Vitest Workspace Mode (#1090)

Implement a centralized mock for Next.js navigation in `tests/setup.ts` to prevent `TypeError: Cannot read properties of null (reading 'get')` during page-level dashboard rendering, wire `vitest.workspace.ts` to root scripts and GitHub Actions CI, and document the design.

## User Review Required

> [!IMPORTANT]
> - Adds global `vi.mock("next/navigation")` to `tests/setup.ts` returning mock `useSearchParams`, `usePathname`, and `useRouter`.
> - Updates page-level test files (`aria-tabs.test.tsx`, `agent-log.test.tsx`, `copy-button.test.tsx`, `virtualization.test.tsx`) to utilize the central mock.
> - Adds `"test:all": "vitest run --workspace=vitest.workspace.ts"` script to root `package.json`.
> - Updates `.github/workflows/ci.yml` step to invoke `npm run test:all`.
> - Document rationale in `vitest.workspace.ts`.

---

## Proposed Changes

### Test Infrastructure & Setup

#### [MODIFY] [setup.ts](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/tests/setup.ts)
Add a reusable global `next/navigation` mock so all tests running under `tests/setup.ts` have valid navigation hooks:

```typescript
vi.mock("next/navigation", () => {
  const searchParams = new URLSearchParams();
  return {
    useSearchParams: () => searchParams,
    usePathname: () => "/",
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});
```

### Dashboard Tests

#### [MODIFY] [aria-tabs.test.tsx](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/dashboard/src/__tests__/aria-tabs.test.tsx)
Rely on the global `next/navigation` mock provided by `tests/setup.ts`.

#### [MODIFY] [agent-log.test.tsx](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/dashboard/src/__tests__/agent-log.test.tsx)
Rely on the global `next/navigation` mock provided by `tests/setup.ts`.

#### [MODIFY] [copy-button.test.tsx](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/dashboard/src/__tests__/copy-button.test.tsx)
Rely on the global `next/navigation` mock provided by `tests/setup.ts`.

#### [MODIFY] [virtualization.test.tsx](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/dashboard/src/__tests__/virtualization.test.tsx)
Rely on the global `next/navigation` mock provided by `tests/setup.ts`.

---

### Workspace Mode Configuration

#### [MODIFY] [package.json](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/package.json)
Add `test:all` script targeting `vitest.workspace.ts`.

```json
"scripts": {
  "test:all": "vitest run --workspace=vitest.workspace.ts"
}
```

#### [MODIFY] [ci.yml](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/.github/workflows/ci.yml)
Update the test execution step in CI:

```yaml
- name: Run tests
  run: npm run test:all
```

#### [MODIFY] [vitest.workspace.ts](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/vitest.workspace.ts)
Add inline documentation explaining workspace mode execution across `.` and `./dashboard`.

---

## Verification Plan

### Automated Tests
1. Run page-level tests to ensure no `TypeError: Cannot read properties of null (reading 'get')` occurs:
   ```bash
   npx vitest run dashboard/src/__tests__/aria-tabs.test.tsx
   ```
2. Execute full workspace test suite:
   ```bash
   npm run test:all
   ```
