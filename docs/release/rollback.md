# Rollback Procedure

This document describes how to safely revert a release if a critical bug is discovered after deploying to production.

## When to Rollback

Roll back a release when:

- **Critical regression** — A bug introduced in the release breaks core functionality (e.g., all transactions fail)
- **Data corruption** — User data is corrupted or lost due to a bug in the release
- **Security vulnerability** — The release introduces a security flaw (e.g., spending limits are bypassed)
- **Compliance violation** — The release breaks regulatory requirements

**Do not rollback for:**
- Minor bugs (hotfix instead)
- Performance issues (optimize instead)
- Aesthetic problems (ship a fix)

## Pre-Rollback Assessment

Before rolling back, answer:

1. **What is the impact?** How many users are affected? What data is at risk?
2. **Is rollback safe?** Did the release change the database schema? (Rollback may lose data.)
3. **What's the root cause?** What bug was introduced?
4. **Is a hotfix faster?** Might writing a quick fix be better than reverting?

**Example:** Release v1.3.0 introduces a bug that prevents bill payments. Rollback is safe because no schema changed. Hotfix would also work but takes 1 hour. Decision: Rollback immediately (5 minutes), then hotfix later.

## Pre-Rollback Checklist

- [ ] Severity confirmed (production impact verified)
- [ ] Root cause identified
- [ ] Rollback is safe (no data loss from schema changes)
- [ ] Prior version (N-1) is known and tagged
- [ ] Backup of current data exists (or is not at risk)
- [ ] Maintenance window communicated to users

## Step 1: Identify the Prior Version

Find the release before the broken one:

```bash
# List recent tags
git tag -l 'v*' --sort=-version:refname | head -5
# Output:
# v1.3.0  (← current broken release)
# v1.2.4  (← prior version to rollback to)
# v1.2.3
# v1.2.2
# v1.2.1

# Verify the prior version is what you want to roll back to
git log v1.2.4 -1 --oneline
# Output: abc1234 fix: correct Stellar SDK auth header
```

## Step 2: Stop Current Deployment

If the application is running, gracefully stop it:

```bash
# For Render.com deployment
# (via dashboard or CLI)
# render deploy stop careguard-server

# For Docker Compose
docker compose down

# For systemd
systemctl stop careguard

# For manual deployments
kill $(cat careguard.pid)
```

**Why?** Prevents data corruption from in-flight transactions during rollback.

## Step 3: Revert Database (If Needed)

If the release included database migrations, revert the schema:

```bash
# Check if v1.3.0 had schema changes
git log v1.2.4..v1.3.0 | grep -i migration

# If migrations exist, revert the database
npm run db:revert
# or
./scripts/rollback-migrations.sh v1.3.0

# Verify the schema is back to v1.2.4 state
npm run db:status
```

**⚠️ Warning:** If the new schema is incompatible with old code, rolling back code before schema can corrupt data. Always revert schema first, then code.

## Step 4: Reset Codebase to Prior Version

Reset the repository to the prior version tag:

```bash
# Fetch latest tags
git fetch --tags

# Reset to prior version (do not use --hard yet)
git reset --soft v1.2.4

# If you need to discard uncommitted changes:
git reset --hard v1.2.4

# Verify you're at the right commit
git log --oneline | head -3
# Should show v1.2.4's commit hash

# Verify no local changes remain
git status
# Should show: "nothing to commit, working tree clean"
```

**Do not force-push.** The main branch should reflect what's running in production. A rollback is a real event that should be in the commit history:

```bash
git log --oneline | head -10
# v1.3.0 ← breaking release
# v1.2.4 ← rollback target
#
# (We're now at v1.2.4; code is ready to deploy)
```

## Step 5: Redeploy Prior Version

Deploy the prior version to production:

```bash
# For Render.com:
# (Push to main, which now points to v1.2.4)
git push origin main

# For Docker:
docker build -t careguard:1.2.4 .
docker run -d --name careguard-prod careguard:1.2.4

# For manual/systemd:
npm install  # uses v1.2.4's package.json
npm run build
npm start
```

**Verify deployment:**
```bash
# Check server is responding
curl http://localhost:3004/health

# Check agent accepts requests
curl http://localhost:3004/api/status

# Verify critical endpoints work
curl http://localhost:3000  # dashboard
```

## Step 6: Verify the Rollback

Test that the core functionality that was broken is now working:

```bash
# Example: if v1.3.0 broke bill payments
# Test that payments work in v1.2.4

# 1. Log into dashboard
# 2. Attempt to audit a bill
# 3. Attempt to approve a payment
# 4. Verify Stellar transaction confirmed
```

**Check logs for errors:**

```bash
# Live logs (if available)
docker logs careguard-prod | tail -100

# Look for error patterns that were present in v1.3.0
grep -i "stellar\|transaction\|payment" logs/error.log
```

## Step 7: Communicate Rollback to Users

Notify users immediately:

```markdown
⚠️ Incident: Production Rollback

We detected a critical bug in v1.3.0 and have rolled back to v1.2.4 (prior version).

What happened:
- Release v1.3.0 (deployed 2025-07-26 15:00 UTC) introduced a bug in bill payments
- Users experienced: Bill audit failed, payments stuck in pending status
- Impact: ~12 users, no data loss

What we did:
- Reverted to v1.2.4 (15:15 UTC)
- Bill payments now processing normally
- Spending logs preserved (all data intact)

What happens next:
- We're investigating the root cause
- A hotfix (v1.2.5) will be released within 2 hours
- v1.3.0 will remain removed until the issue is fixed

Sorry for the disruption. Questions? Reply in this thread.
```

**Notify via:**
- GitHub Discussions
- Email to affected users
- Slack/Discord if applicable
- Status page (if you have one)

## Step 8: Post-Incident Investigation

After stability is restored, investigate root cause:

```bash
# Compare v1.2.4 vs v1.3.0
git log v1.2.4..v1.3.0 --oneline

# Focus on changes to critical paths
git diff v1.2.4..v1.3.0 -- agent/ services/bill-audit-api/ shared/

# Identify the problematic commit
git show <commit-hash>

# File a bug for this specific issue
# Issue title: "Bug found in v1.3.0: [description]"
# Reference: "Introduced in commit [hash]"
```

## Step 9: Create a Hotfix

Once you've identified the bug, create a hotfix:

1. Branch from v1.2.4 (not main):
   ```bash
   git checkout -b hotfix/fix-bill-payment-bug v1.2.4
   ```

2. Fix the bug (one commit)
   ```bash
   # edit file...
   git commit -m "fix: [description of bug]"
   ```

3. Tag as v1.2.5:
   ```bash
   git tag v1.2.5
   git push origin v1.2.5
   ```

4. Follow [Hotfix Process](hotfix-process.md) for review and deployment

## Step 10: Resolve the Root Issue in Main

Update main to include the hotfix:

```bash
# Merge the hotfix back to main
git checkout main
git pull origin main
git merge hotfix/fix-bill-payment-bug
git push origin main
```

Now main includes the fix, and the next release (v1.3.1 or v2.0.0) will not have the bug.

## Rollback Decision Tree

```
A release is broken in production

  |
  v
Is rollback safe?
  |
  ├─ No (data loss risk, schema incompatibility)
  │  └→ Attempt hotfix instead
  │     (Reverting would corrupt data)
  |
  └─ Yes (no schema changes, no data migration)
     └→ Proceed with rollback
        1. Identify prior version (v1.2.4)
        2. Stop deployment
        3. Revert database if needed
        4. Reset codebase to v1.2.4
        5. Redeploy
        6. Verify
        7. Communicate
        8. Investigate
        9. Hotfix (v1.2.5)
        10. Merge back to main
```

## Rollback Checklist

```markdown
- [ ] Severity confirmed (production impact, users affected)
- [ ] Root cause identified or understood
- [ ] Prior version identified (v1.2.4)
- [ ] Rollback is safe (no data loss from migrations)
- [ ] Backup exists (or not at risk)
- [ ] Maintenance window communicated
- [ ] Current deployment stopped gracefully
- [ ] Database reverted (if schema changed in v1.3.0)
- [ ] Codebase reset to v1.2.4
- [ ] Prior version redeployed
- [ ] Critical functionality verified (broken feature now works)
- [ ] Logs checked (no new errors)
- [ ] Users notified
- [ ] Post-incident investigation started
- [ ] Hotfix created (v1.2.5 or v1.3.1)
- [ ] Hotfix tested and deployed
- [ ] Root cause documented
- [ ] Preventative measure identified (tests, review, etc.)
```

## Common Rollback Scenarios

### Scenario 1: Schema Migration Error

Release v1.3.0 added a required column to a table without a default value.

```
v1.3.0 migration: ALTER TABLE medications ADD COLUMN priority INT NOT NULL
v1.2.4 code: Doesn't know about `priority` field (INSERT fails)

Rollback steps:
1. Stop v1.3.0
2. Revert migration: ALTER TABLE medications DROP COLUMN priority
3. Reset codebase to v1.2.4
4. Redeploy v1.2.4
5. Verify INSERT into medications works
```

### Scenario 2: API Contract Change

Release v1.3.0 changed the response format of `/api/medications` but kept the old endpoint.

```
v1.3.0 response: { medications: [...] }  (new)
v1.2.4 response: [...] (old array)
v1.2.4 client code: Expects array, receives object → crashes

Rollback steps:
1. Stop v1.3.0
2. No database changes needed
3. Reset codebase to v1.2.4
4. Redeploy v1.2.4
5. Verify client receives array response
```

### Scenario 3: Environment Variable Change

Release v1.3.0 renames an environment variable without backward compatibility.

```
v1.3.0 uses: PHARMACY_ENDPOINT (new)
v1.2.4 uses: PHARMACY_PAYMENT_URL (old)
Environment has: PHARMACY_PAYMENT_URL=... (not updated yet)

Rollback steps:
1. Stop v1.3.0 (fails to start because PHARMACY_ENDPOINT not set)
2. No database changes
3. Reset codebase to v1.2.4
4. Redeploy v1.2.4 (uses old var name, starts fine)
5. Verify pharmacy payments work
```

## See Also

- [Hotfix Process](hotfix-process.md) — How to ship a fix instead of rollback
- [Versioning Guidelines](versioning.md) — How to avoid breaking changes
- [Deprecation Policy](deprecation-policy.md) — Safer approach to API changes
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Development workflow
