# RFC: Decision on `shared/verify-webhook.ts` Architecture & Placement (Issue #1454)

## Executive Summary

This document evaluates the architectural placement and structural design of `shared/verify-webhook.ts` (and its test suite `shared/__tests__/verify-webhook.test.ts`) within the `careguard` repository.

We perform a consumer analysis, evaluate the trade-offs of **Generalize-in-Place** versus **Relocate-to-Consumer**, detail the architectural design decisions, and specify the migration plan.

---

## 1. Consumer Analysis

A comprehensive search of the codebase for references to `verify-webhook.ts` and `verifyWebhook` identified the following usage footprint:

| Reference Location | File Path | Usage Details / Type |
|---|---|---|
| Sole Operational Consumer | [`agent/server.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/agent/server.ts#L51) | Express middleware mounting for `POST /webhooks/stellar/deposit`. |
| Unit Test Suite | [`shared/__tests__/verify-webhook.test.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/shared/__tests__/verify-webhook.test.ts) | Complete unit test coverage for headers, timing, signature verification, and replay cache. |
| Operational Documentation | [`docs/runbooks/webhook-secret-rotation.md`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/docs/runbooks/webhook-secret-rotation.md) | Emergency and routine runbook for secret rotation. |
| Operational Documentation | [`docs/runbooks/redis-down.md`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/docs/runbooks/redis-down.md) | Incident response runbook for Redis cache degradation. |

**Key Finding:** `shared/verify-webhook.ts` currently has **exactly one operational consumer**: the `agent/server.ts` microservice (specifically guarding `POST /webhooks/stellar/deposit`).

---

## 2. Decision: Generalize-in-Place vs. Relocate-to-Consumer

### Option A: Relocate-to-Consumer (`agent/middleware/verify-webhook.ts`)
- **Pros:** Keeps `shared/` lean and limited to multi-consumer primitives (`logger`, `redis`, `cors`, `rate-limit`).
- **Cons:**
  1. **Future Inbound Integration Churn:** CareGuard's roadmap includes additional inbound webhook consumers (e.g. payment provider callbacks, healthcare provider notifications, pharmacy status updates). Relocating to `agent/` forces future microservices (`pharmacy-payment`, `bill-audit-api`) to either duplicate code or cross-import from `agent/`.
  2. **Documentation & Runbook Churn:** High impact on operational runbooks ([`webhook-secret-rotation.md`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/docs/runbooks/webhook-secret-rotation.md) and [`redis-down.md`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/docs/runbooks/redis-down.md)) which reference `shared/verify-webhook.ts` as the standard security barrier for webhook ingress.

### Option B: Generalize-in-Place (Chosen Decision)
- **Decision:** **Generalize-in-Place within `shared/verify-webhook.ts`**.
- **Rationale:**
  - HMAC SHA-256 signature verification with timestamp tolerance and replay protection is inherently a **cross-cutting security primitive**.
  - Generalizing the module in `shared/` decouples generic cryptographic HMAC validation and replay protection algorithms from hardcoded header names or specific HTTP payload schemas.
  - Allows `agent/server.ts` (and any future microservice endpoint) to instantiate endpoint-specific verification middleware using clean configuration interfaces.

---

## 3. Architecture & Technical Design

### Clean Code & Clean Architecture Principles
The generalized module separates concerns into three distinct layers:

1. **Pure Cryptographic Primitives & Pure Functions (Core Layer)**
   - Single Responsibility: Perform constant-time HMAC-SHA256 signature evaluation (`verifyHmacSignature`, `computeWebhookSignature`).
   - Time Complexity: $\mathcal{O}(N)$ where $N$ is byte length of raw payload body.
   - Space Complexity: $\mathcal{O}(1)$ auxiliary space (allocating fixed 32-byte buffers for timing-safe equality check).

2. **Replay Cache & Window Validator (Infrastructure Layer)**
   - Single Responsibility: Enforce timestamp drift tolerance and Redis/in-process idempotency check (`isReplayedEvent`, `recordSeenEvent`).
   - Time Complexity: $\mathcal{O}(1)$ lookup/write in Redis or Map.
   - Space Complexity: $\mathcal{O}(M)$ where $M$ is active unique webhook IDs within replay window $T_{\text{replay}}$ ($10 \text{ min}$).

3. **Express Middleware Factory (Delivery/Interface Layer)**
   - Single Responsibility: Extract request headers/body, evaluate timing/signature/replay rules, return HTTP 400/200/409 responses, or pass control to `next()`.

---

## 4. Reusable Primitives & Type Interfaces

```typescript
export interface HmacVerificationOptions {
  /** Secret key for HMAC signature computation. */
  secret: string;
  /** Raw string or Buffer payload to verify. */
  payload: string | Buffer;
  /** Expected signature string (e.g. hex digest or prefixed hex digest). */
  signature: string;
  /** Header signature prefix (default: "sha256="). */
  prefix?: string;
  /** Timestamp of request in unix seconds or milliseconds. */
  timestamp?: string | number;
}

export interface WebhookVerificationConfig {
  /** HMAC secret. Defaults to WEBHOOK_SECRET env var. */
  secret?: string;
  /** Custom header names for customization per provider. */
  headerNames?: {
    signature?: string; // default: "x-webhook-signature"
    timestamp?: string; // default: "x-webhook-timestamp"
    id?: string;        // default: "x-webhook-id"
  };
  /** Override tolerance window in ms (default: 5 min). */
  toleranceMs?: number;
  /** Override replay window TTL in ms (default: 10 min). */
  replayWindowMs?: number;
  /** Replay cache key prefix (default: "webhook:seen:"). */
  replayKeyPrefix?: string;
}
```

---

## 5. Migration & Compatibility Plan

1. **Backwards Compatibility:**
   - Retain standard export `verifyWebhook(opts?: WebhookVerificationConfig)` so existing callers like [`agent/server.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/agent/server.ts) require zero breaking interface changes.
2. **Test File Preservation:**
   - `shared/__tests__/verify-webhook.test.ts` remains in `shared/__tests__/` and will be augmented to cover both generic primitives (`verifyHmacSignature`) and standard middleware behavior.
3. **Documentation:**
   - Runbooks [`webhook-secret-rotation.md`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/docs/runbooks/webhook-secret-rotation.md) and [`redis-down.md`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/docs/runbooks/redis-down.md) maintain exact file path alignment.

---

# RFC: Pluggable Notification Delivery-Channel Abstraction (Issue #1453)

## Executive Summary

This RFC addresses issue #1453 by proposing a clean architecture refactoring for [`shared/notifications.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/shared/notifications.ts). 

Currently, `shared/notifications.ts` mixes notification dispatching logic with inline channel implementations (Slack HTTP webhooks, Resend/Postmark email APIs, and Twilio SMS). As new channels or async delivery mechanisms are added, modifying `notifications.ts` creates high churn for all importing modules (such as [`agent/tools.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/agent/tools.ts), [`agent/server.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/agent/server.ts), and [`shared/wallet-balance.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/shared/wallet-balance.ts)).

This design extracts a pluggable `NotificationChannel` interface and a `ChannelRegistry`, transforming `notify()` into a thin, decoupled dispatcher.

---

## 1. Call Site & Delivery Mechanism Audit

### Call Sites
A search across the codebase identified the following operational call sites for `notify()`:

| Call Site File | Trigger Context | Notification Level | Target Channel |
|---|---|---|---|
| [`agent/tools.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/agent/tools.ts#L80) | Spending policy limit warning/exceeded | `warning` / `critical` | Default (`all`) |
| [`agent/tools.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/agent/tools.ts) | Medication adherence missed/flagged alerts | `warning` | Default (`all`) |
| [`shared/wallet-balance.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/shared/wallet-balance.ts) | Low Stellar wallet balance alert | `warning` / `critical` | Default (`all`) |
| [`agent/server.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/agent/server.ts#L325) | Caregiver agent pause/resume status events | `info` / `warning` | Default (`all`) |
| [`docs/runbooks/wallet-low.md`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/docs/runbooks/wallet-low.md) | Documented operational alert trigger | `warning` | Default (`all`) |

### Current Delivery Mechanisms
Currently, [`shared/notifications.ts`](file:///c:/Users/PAB-NETWORK/Documents/Grantfox/careguard/shared/notifications.ts) contains monolithically coupled functions:
- `sendSlack(n)`: Directly calls `fetch(SLACK_WEBHOOK_URL, ...)`
- `sendEmail(n)`: Calls `fetch("https://api.resend.com/emails", ...)` or `fetch("https://api.postmarkapp.com/email", ...)`
- `sendSms(n)`: Formats Basic Auth and calls `fetch("https://api.twilio.com/...", ...)`

---

## 2. Pluggable `NotificationChannel` Interface & Registry

### Clean Architecture Abstraction

```typescript
export interface NotificationResult {
  success: boolean;
  channelName: string;
  error?: string;
  deliveredAt?: number;
}

export interface NotificationChannel {
  /** Unique channel identifier (e.g., 'email', 'sms', 'slack'). */
  name: string;

  /** Evaluates whether environmental credentials for this channel are configured. */
  isConfigured(): boolean;

  /** Executes delivery of a notification payload. */
  send(notification: Notification): Promise<NotificationResult>;
}

export class NotificationChannelRegistry {
  private channels = new Map<string, NotificationChannel>();

  register(channel: NotificationChannel): void {
    this.channels.set(channel.name, channel);
  }

  get(name: string): NotificationChannel | undefined {
    return this.channels.get(name);
  }

  getEnabledChannels(): NotificationChannel[] {
    return Array.from(this.channels.values()).filter((c) => c.isConfigured());
  }

  clear(): void {
    this.channels.clear();
  }
}
```

---

## 3. Failure & Retry Handling

To prevent transient HTTP failures (e.g. Resend rate limits or Slack 502s) from breaking business logic execution or blocking the AI Agent loop, failure handling is decoupled:

1. **Non-Blocking Execution & Channel Isolation**:
   - `notify()` executes delivery across selected channels concurrently via `Promise.allSettled()`.
   - A failure in the Slack channel will never crash or abort email/SMS delivery.

2. **Retry Policy**:
   - Transient network/HTTP 5xx errors utilize exponential backoff with jitter up to a maximum attempt limit (e.g. 3 attempts, max 2000ms delay).
   - Permanent 4xx errors (e.g., invalid phone number format or invalid API key) fail fast without retrying.

3. **Time and Space Complexity**:
   - **Time Complexity**: $\mathcal{O}(K)$ dispatch time for $K$ registered channels, executing in parallel $\mathcal{O}(\max_{k} T_k)$ total network latency.
   - **Space Complexity**: $\mathcal{O}(K)$ auxiliary memory for in-flight channel promises and registry map storage.

---

## 4. Backwards-Compatible Migration Plan

To avoid refactoring any existing call sites across `agent/tools.ts`, `agent/server.ts`, or `shared/wallet-balance.ts`:

1. **Preserve `notify(n: Notification)` Signature**:
   - The primary export `export async function notify(n: Notification): Promise<void>` remains intact.
   - Callers continue passing `{ level, title, description, context, channel, ... }`.

2. **Default Built-in Registrations**:
   - The module instantiates a default global `NotificationChannelRegistry` pre-populated with `SlackChannel`, `EmailChannel`, and `SmsChannel`.
   - Custom channels (e.g., Push notifications, PagerDuty, WhatsApp) can be registered at application boot without mutating core dispatching logic.

---

## 5. Testing Strategy

- **Channel Unit Tests (`shared/__tests__/channels/*.test.ts`)**:
  - Test individual channel formatting, environment variable validation (`isConfigured()`), payload construction, and provider-specific error handling.
- **Dispatcher Unit Tests (`shared/__tests__/notifications.test.ts`)**:
  - Test the `NotificationChannelRegistry` and `notify()` dispatcher using mock channels.
  - Verify `Promise.allSettled()` isolation (e.g. verifying that `notify()` succeeds even if 1 channel throws an exception).

