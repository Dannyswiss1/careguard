# Hotfix and Patch Release Process

This document describes how to ship an urgent patch to production when a critical bug or security issue is discovered and cannot wait for the next planned release.

## When to Hotfix

Use the hotfix process when:

- **Production bug** — Users are experiencing a critical failure (e.g., transactions don't process, dashboard doesn't load)
- **Security issue** — A vulnerability is actively exploited or allows data exfiltration
- **Data loss** — Users are losing data due to a bug in agent logic or bill audit
- **Compliance issue** — Spending limits are not enforced correctly, creating legal liability

**Do not hotfix for:**
- Minor bugs or typos (wait for next planned release)
- Feature requests or enhancements
- Issues only affecting development/test environments

## Branch Strategy

Hotfixes branch from the latest **released tag** (not from main), ensuring only the fix ships without other in-progress work.

### Step 1: Identify the Issue

Reproduce the bug in production or test environment:

```bash
# Example: transactions fail because Stellar SDK changed its auth header format
# Issue: agent.ts line 42 sends Authorization: Bearer, but SDK v14.8.0 expects x-api-key
```

### Step 2: Create Hotfix Branch

Branch from the latest release tag:

```bash
# Find latest tag
git tag -l 'v*' --sort=-version:refname | head -1
# Output: v1.2.3

# Create hotfix branch from that tag
git checkout -b hotfix/fix-stellar-auth-header v1.2.3

# Verify you're on the right branch and at the right commit
git log --oneline | head -3
# Output shows v1.2.3's commit hash
```

**Branch naming:** Use `hotfix/` prefix with kebab-case description:
- `hotfix/fix-stellar-auth-header`
- `hotfix/security-redact-keys-from-logs`
- `hotfix/bill-audit-rounding-error`

### Step 3: Write the Fix

Fix only the immediate issue. Do not:
- Refactor surrounding code
- Update dependencies (unless the fix requires it)
- Add new features
- Change formatting in unrelated files

**Example minimal fix:**

```typescript
// agent.ts (v1.2.3 had)
const response = await fetch('https://api.stellar.org/tx', {
  headers: {
    'Authorization': `Bearer ${token}` // ← WRONG in SDK v14.8.0
  }
});

// Hotfix changes to:
const response = await fetch('https://api.stellar.org/tx', {
  headers: {
    'x-api-key': token // ← CORRECT for v14.8.0
  }
});
```

### Step 4: Test the Fix (Manually)

Do not run the full CI suite for hotfixes (it may take 30+ minutes). Instead:

1. Run only the affected service/test:
   ```bash
   npm test -- agent.test.ts
   ```

2. Verify locally in the environment where the bug appeared:
   ```bash
   npm run dev
   # Test the specific flow that was broken
   ```

3. If possible, test against production-like data (staging environment)

### Step 5: Commit the Fix

Use a clear commit message with the fix type:

```bash
git add -A
git commit -m "fix: correct Stellar SDK auth header format in agent

SDK v14.8.0 requires x-api-key header instead of Authorization bearer.
This fixes transactions failing on production with 401 Unauthorized.

Resolves #ISSUE_NUMBER (if applicable)
Hotfix: v1.2.3 → v1.2.4"
```

### Step 6: Push and Create Hotfix PR

Push the branch and open a pull request against **main** (not develop, not staging):

```bash
git push origin hotfix/fix-stellar-auth-header
```

**Pull request description:**

```markdown
## Hotfix: Fix Stellar SDK Auth Header

### Issue
Transactions fail with 401 Unauthorized after SDK v14.8.0 upgrade.
Bug: agent.ts sends `Authorization: Bearer` but SDK expects `x-api-key`.

### Impact
- Production transactions blocked
- User funds at risk (payments pending)
- Estimated 47 users affected

### Fix
Changed authorization header from Bearer token to x-api-key format.
Verified against staging with 10 test transactions.

### Rollback
If this hotfix introduces a regression, follow [Rollback Procedure](rollback.md).

### Expedited Review Checklist
- [x] Bug reproduced and understood
- [x] Fix tested against production-like environment
- [x] No refactoring or unrelated changes
- [x] Rollback procedure documented
- [x] Ready for production immediately

Closes #ISSUE_NUMBER (if applicable)
```

**CI requirements for hotfix PR:**
- Linting must pass
- Unit tests for the affected code must pass
- Type check must pass (TypeScript strict mode)
- **Security scan must pass** (no new vulnerabilities)
- **Do not skip any checks**, even for urgent hotfixes

If CI fails, fix the issue and re-push (do not force-push; let the history show the iterations).

### Step 7: Code Review (Expedited)

A maintainer reviews the PR with priority:

1. **Understand the issue** — Verify bug is real and critical
2. **Validate the fix** — Is it correct? Does it solve the problem?
3. **Check scope** — No unrelated changes?
4. **Verify rollback plan** — Is rollback documented?

**Review should take <30 minutes** for a simple fix.

Approval reply:

```markdown
✅ Approved. Fix is correct and scoped. Ready to merge and release.
```

### Step 8: Merge to Main

Once approved, squash-merge to main:

```bash
# (do this via GitHub UI or CLI)
git checkout main
git pull origin main
git merge --squash hotfix/fix-stellar-auth-header
git commit -m "fix: correct Stellar SDK auth header format in agent

Resolves #ISSUE_NUMBER"

git push origin main
```

### Step 9: Create and Tag the Patch Release

Tag the commit on main with the next patch version:

```bash
# Current version is v1.2.3
# Next patch is v1.2.4
git tag v1.2.4 -m "Hotfix: Stellar SDK auth header

Fix transactions failing with 401 after SDK v14.8.0 upgrade."

git push origin v1.2.4
```

**Tag naming:** Increment PATCH only:
- v1.2.3 → v1.2.4 (correct for hotfix)
- v1.2.3 → v1.3.0 (incorrect, this is a minor release)
- v1.2.3 → v2.0.0 (incorrect, this is a major release)

### Step 10: Release Workflow Runs Automatically

When the tag is pushed, GitHub Actions runs [release.yml](../../.github/workflows/release.yml):

```
Tag push: git push origin v1.2.4
            ↓
GitHub Actions: release.yml triggered
            ↓
release-drafter:
  - Reads commits between v1.2.3...v1.2.4
  - Finds the one hotfix commit
  - Generates release notes: "Fix: Correct Stellar SDK auth header format"
  - Creates GitHub Release for v1.2.4
            ↓
changelog-updater:
  - Prepends release notes to CHANGELOG.md
  - Commits to main
            ↓
✓ Hotfix released
```

### Step 11: Verify Production Deployment

After the tag triggers CI:

1. Confirm the release shows on [GitHub Releases](https://github.com/harystyleseze/careguard/releases)
2. Confirm CHANGELOG.md was updated with the hotfix
3. Verify deployment to production (Render or your hosting platform)
4. **Test the fix in production** — Verify transactions now succeed
5. Monitor error logs for 1 hour — Check for new issues

**If production deployment fails**, follow [Rollback Procedure](rollback.md).

## Expedited Review and CI

For hotfixes, **all checks must still pass**, but human review is expedited:

| Check | Required? | Typical Time | Hotfix Time |
|-------|-----------|--------------|-------------|
| ESLint | Yes | 2 min | Must pass |
| TypeScript | Yes | 5 min | Must pass |
| Unit tests | Yes | 10 min | Must pass (only for affected code) |
| Security scan | Yes | 5 min | Must pass |
| Code review | Yes | 30 min | Expedited: 15 min typical |

**Never skip checks.** A security hotfix that introduces a new vulnerability is worse than the original issue.

## Communication During Hotfix

Notify stakeholders:

1. **On issue creation:** "We're investigating. ETA for fix: 2 hours."
2. **On PR merge:** "Fix merged and tagged as v1.2.4. Deploying now."
3. **After production deployment:** "Fix is live. Transactions now processing normally."
4. **Post-mortem:** "Incident report: [link]" (within 24 hours)

Use GitHub issue, Slack, or email depending on severity and audience.

## Hotfix Checklist

```markdown
- [ ] Issue reproduced and severity confirmed (critical/security/data-loss)
- [ ] Hotfix branch created from latest released tag (e.g., v1.2.3)
- [ ] Fix is minimal (only the bug, no refactoring)
- [ ] Fix is tested locally against production-like environment
- [ ] Commit message is clear and explains the issue
- [ ] PR description includes impact, fix, and rollback plan
- [ ] Code review approved (expedited, <30 min)
- [ ] All CI checks pass (linting, tests, security, type check)
- [ ] Merged to main (squash-merge to keep history clean)
- [ ] Tag created with next PATCH version (v1.2.3 → v1.2.4)
- [ ] Tag pushed (triggers release workflow)
- [ ] Release workflow completed (GitHub Release created, CHANGELOG updated)
- [ ] Deployed to production
- [ ] Production fix verified (test the specific bug is gone)
- [ ] Stakeholders notified
```

## Common Mistakes

**❌ Don't:**
- Branch from main instead of the released tag (introduces other in-flight changes)
- Include refactoring or cleanup in the hotfix (scope creep)
- Skip CI checks to go faster (introduces new bugs)
- Force-push after code review (makes it hard to see final changes)
- Tag v1.3.0 or v2.0.0 (only bump PATCH for hotfixes)
- Deploy without verifying the fix works

**✅ Do:**
- Branch from v1.2.3 tag (clean hotfix base)
- Fix only the bug (one-line fix for one-line bug)
- Wait for all CI to pass (safety first)
- Let history show iterations
- Tag v1.2.4 (correct patch version)
- Test in production before calling it done

## See Also

- [Rollback Procedure](rollback.md) — If the hotfix makes things worse
- [Versioning Guidelines](versioning.md) — PATCH vs MINOR vs MAJOR
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Normal (non-hotfix) workflow
