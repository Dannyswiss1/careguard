# Runbook: Tuning Rate-Limit Thresholds Safely

This runbook provides operator guidance for monitoring rate-limit metrics, tuning threshold environment variables safely, recognizing rate-limit-driven incidents, understanding per-endpoint policy interactions, and performing safe rollouts without locking out the CareGuard dashboard or starving background agents.

---

## Symptom

- The dashboard shows repeated connection errors, failed API calls, or HTTP `429 Too Many Requests` responses.
- Caregivers report that agent executions, bill audits, or pharmacy order attempts are unexpectedly failing or hanging.
- Alerting fires on `ratelimit_hits_total` rates spiking in Prometheus or Grafana.

---

## Impact

- **Customer Impact**: High to Critical. Legitimate users or background dashboard polling intervals may be locked out of key workflows (agent execution, bill audit reports, pharmacy orders over Stellar x402).
- **System Impact**: Overly strict limits cause artificial service disruption. Overly permissive limits expose LLM APIs and Stellar payment endpoints to noisy-neighbor resource exhaustion or upstream rate exhaustion (such as Stellar Horizon's GCRA 3,600 req/hr limit).

---

## Environment Variables & Per-Endpoint Policies

Rate limits are configured in [`shared/rate-limit.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/shared/rate-limit.ts). Each endpoint category uses an independent token bucket window of **60 seconds** (`DEFAULT_WINDOW_MS = 60000`) so heavy utilization on one route (e.g., bill audits) cannot starve another (e.g., agent runs).

The function `parseLimitEnv(raw, fallback)` safely parses values: if an environment variable is unset, empty, non-integer, or `<= 0`, it safely falls back to the documented default to ensure rate limiting is never silently disabled.

### Per-Route Environment Variables (`perRouteLimiters`)

| Environment Variable | Policy Label | Default Value | Route / Target Workflow | Reason for Default Limit |
|---|---|---|---|---|
| `RATE_LIMIT_AGENT_RUN` | `agent_run` | `5` req / 60s | `/api/agent/run` | CPU + LLM-bound agent run execution. Strict limit prevents queue starvation and LLM provider rate exhaustion. |
| `RATE_LIMIT_BILL_AUDIT` | `bill_audit` | `20` req / 60s | `/api/bill-audit` | I/O-light but payload-heavy medical bill auditing. Separate bucket for document parsing. |
| `RATE_LIMIT_PHARMACY_COMPARE` | `pharmacy_compare` | `30` req / 60s | `/api/pharmacy/compare` | Lightweight price search and comparison across pharmacies. Higher headroom allowed. |
| `RATE_LIMIT_DRUG_INTERACTIONS` | `drug_interactions` | `30` req / 60s | `/api/drug-interactions` | Lightweight drug-drug and contraindication analysis queries. |
| `RATE_LIMIT_PHARMACY_ORDER` | `pharmacy_order` | `10` req / 60s | `/api/pharmacy/order` | On-chain Stellar x402 payment and order submission. Tight bound protects upstream Stellar Horizon RPC limits (3,600 req/hr GCRA). |

### Module-Level Rate Limiters (`rateLimiters`)

| Limiter | Policy Label | Default Value | Usage |
|---|---|---|---|
| `rateLimiters.agent` | `agent` | `5` req / 60s | Generic agent interaction endpoints |
| `rateLimiters.x402` | `x402` | `30` req / 60s | Micro-payment verification endpoints |
| `rateLimiters.default` | `default` | `60` req / 60s | Fallback limiter for unclassified endpoints |
| `rateLimiters.health` | `health` | Unlimited (pass-through) | Health checks (`/health`, `/ready`) — strictly unlimited to prevent false negative liveness probes |

---

## Diagnosis

Use Prometheus / Grafana or curl commands to analyze rate-limiting behavior.

### 1. Prometheus Metrics

CareGuard exports two primary metrics in `shared/rate-limit.ts`:

1. **`ratelimit_hits_total{policy="<policy_name>"}`** (*Counter*):
   - Total count of HTTP 429 responses generated per policy.
   - **PromQL (Hit Rate per Policy)**:
     ```promql
     sum(rate(ratelimit_hits_total[5m])) by (policy)
     ```
2. **`route_concurrent_requests{route="<route_name>"}`** (*Gauge*):
   - In-flight requests currently being processed per route.
   - **PromQL (Concurrent In-Flight Requests)**:
     ```promql
     sum(route_concurrent_requests) by (route)
     ```

### 2. Distinguishing Throttling vs. Abuse

- **Legitimate Throttling (Under-provisioned Limit)**:
  - `ratelimit_hits_total` increases during known peak hours or synchronized dashboard polling cycles (e.g. every 10–15s across multiple active dashboard users).
  - Low `route_concurrent_requests` but periodic bursts exceeding the per-minute window.
  - HTTP `429` responses contain standard headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`).
- **Abuse / Noisy-Neighbor Attack**:
  - Sustained high rate of `ratelimit_hits_total` from a single policy label or IP.
  - `route_concurrent_requests` remains elevated near maximum concurrency limits.
  - Non-dashboard user agents or anomalous payload sizes.

---

## Mitigation

If legitimate dashboard traffic or care operations are being locked out, apply an immediate temporary increase to the affected environment variable(s).

### Emergency Relief Steps

1. **Identify the Throttled Policy**:
   Check Grafana or query logs for HTTP 429 responses to see which policy (e.g. `agent_run` or `bill_audit`) is triggering.
2. **Raise the Environment Variable**:
   Set the env var in your hosting environment (e.g. Render dashboard or `.env` / container environment):
   ```bash
   RATE_LIMIT_AGENT_RUN=15
   RATE_LIMIT_BILL_AUDIT=40
   ```
3. **Restart the Service**:
   Apply the environment configuration change and restart the container service.

---

## Safe Rollout Procedure

When adjusting thresholds permanently, follow this step-by-step procedure to avoid locking out the dashboard or exceeding upstream quotas.

### Step 1: Measure Baseline Cadence
- Calculate the Next.js dashboard polling cadence. For example, if the dashboard polls `/api/pharmacy/compare` every 10 seconds per active tab, 1 active user generates 6 requests/minute.
- Determine safety headroom factor ($1.5\times$ to $2.0\times$ peak traffic):
  $$\text{Target Threshold} = \max(\text{Peak Requests per 60s} \times 1.5, \text{DEFAULT})$$

### Step 2: Incremental Increase (+25% to +50% steps)
Do not set arbitrary large numbers (e.g., jump from 5 to 500). Increase in controlled increments:
- Example for `RATE_LIMIT_AGENT_RUN`: `5` $\rightarrow$ `10` $\rightarrow$ `15`.
- Example for `RATE_LIMIT_BILL_AUDIT`: `20` $\rightarrow$ `30` $\rightarrow$ `40`.

### Step 3: Deploy & Observe Dashboard Cadence
1. Deploy the environment update.
2. Open the CareGuard dashboard and verify:
   - Dashboard connection status chip shows **"Connected"**.
   - No HTTP 429 errors appear in browser developer console network tab.
3. Monitor `ratelimit_hits_total` for 15–30 minutes in Grafana to ensure hit rates return to zero for legitimate users.

---

## Rollback Procedure

If raising thresholds causes downstream resource exhaustion (e.g., LLM API rate limits or Stellar Horizon node RPC rate limits):

1. **Revert Environment Variables**:
   Reset the environment variable to its previous known-good value, or unset it to automatically revert to default:
   ```bash
   unset RATE_LIMIT_AGENT_RUN
   # Or explicitly set back to default
   RATE_LIMIT_AGENT_RUN=5
   ```
2. **Redeploy / Restart Service**:
   Restart the container process so `parseLimitEnv` re-evaluates the environment.
3. **Verify Recovery**:
   Check that upstream errors (e.g. 503s or LLM/Stellar 429s) drop and system stability is restored.

---

## Post-Mortem Template

If a rate-limit lockout or threshold incident occurs, complete the following incident summary:

- **Date / Duration**: 
- **Affected Policy**: (e.g., `agent_run`, `bill_audit`, `pharmacy_order`)
- **Root Cause**: (e.g., dashboard poll frequency increased, bursty user traffic, under-tuned threshold)
- **Detection Lag**: Time from first HTTP 429 burst to operator response
- **Mitigation Taken**: (e.g., `RATE_LIMIT_AGENT_RUN` raised from 5 to 15)
- **Remediation**: Permanent threshold tune, client polling back-off adjustment, or rate limit bucket tuning
- **Action Items**:
  - [ ] Adjust default environment configuration if required
  - [ ] Update Grafana alerting threshold for `ratelimit_hits_total`
