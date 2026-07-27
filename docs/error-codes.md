# CareGuard API Error Codes Registry

This registry lists the stable, machine-readable `code` strings returned in CareGuard JSON error responses.

| Error Code | HTTP Status | Description | Details Payload |
|------------|-------------|-------------|-----------------|
| `VALIDATION_ERROR` | 400 Bad Request | The request payload failed schema validation (e.g., Zod checks). | Mapping of invalid fields to arrays of validation messages under `fields`. |
| `PAYMENT_REQUIRED` | 402 Payment Required | The requested route is paid and requires payment verification via x402 or MPP protocols. | Contains scheme, network, recipient wallet (`payTo`), asset, and price. |
| `POLICY_BLOCKED` | 400 Bad Request / 403 Forbidden / 409 Conflict | The action violates a spending policy limit or rule (e.g., exceeding budget). | Contains standard limit, rule name, requested amount, current usage, and recipient info. |
| `UNAUTHORIZED` | 401 Unauthorized | Missing or invalid auth header (e.g. Bearer Token) or missing/expired caregiver credentials. | None. |
| `FORBIDDEN` | 403 Forbidden | CSRF token mismatch, invalid admin credentials, or insufficient permissions. | None. |
| `NOT_FOUND` | 404 Not Found | The requested resource (recipient, transaction, drug, price record, or route) was not found. | None. |
| `AGENT_PAUSED` | 409 Conflict | The transaction or run cannot proceed because the CareGuard agent is currently paused. | `paused: true` and optionally `pausedReason`. |
| `RATE_LIMIT_EXCEEDED` | 429 Too Many Requests | The client has exceeded rate limiting quotas. | None. |
| `INTERNAL_SERVER_ERROR` | 500 Internal Server Error | An unexpected server or database error occurred. | None. |
| `SERVICE_UNAVAILABLE` | 503 Service Unavailable | A critical dependency (e.g. SQLite, Redis, Horizon, OZ Facilitator) is degraded or unreachable. | List of failing checks (e.g. `{"checks": {"horizon": false}}`). |

---

## Detailed Error Code Specifications

### 1. `VALIDATION_ERROR`
Indicates input parameter or payload schema mismatch.
* **Details Structure**:
  ```json
  {
    "fields": {
      "fieldName.subField": ["Error message 1", "Error message 2"]
    }
  }
  ```

### 2. `PAYMENT_REQUIRED`
Returned when query fees or transaction execution costs must be paid using USDC on Stellar.
* **Details Structure**:
  ```json
  {
    "scheme": "exact",
    "network": "stellar:testnet",
    "payTo": "G...",
    "price": "0.0100000",
    "asset": "USDC"
  }
  ```

### 3. `POLICY_BLOCKED`
Returned when a request is blocked because it exceeds spending limits or budgets.
* **Details Structure**:
  ```json
  {
    "rule": "medicationMonthlyBudget",
    "limit": 300,
    "currentUsage": 295,
    "requestedAmount": 10,
    "recipient": "Rosa Garcia"
  }
  ```

### 4. `AGENT_PAUSED`
Returned when trying to post tasks or execute actions while the coordinator agent is paused.
* **Details Structure**:
  ```json
  {
    "paused": true,
    "pausedReason": "Caregiver manual pause"
  }
  ```
