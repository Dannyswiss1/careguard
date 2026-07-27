# Error Code Registry

Every API error response follows the schema defined in `docs/openapi.yml`:

```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "details": {}
}
```

The `code` field is a stable machine-readable string. Clients **must** branch
on `code`, not on the `error` message (messages may change).

---

## Naming Convention

Codes use `SCREAMING_SNAKE_CASE` with a category prefix:

```
{CAUSE}_{SPECIFIER}
```

| Category | Prefix | Example |
|----------|--------|---------|
| Validation | `VALIDATION_` | `VALIDATION_MISSING_FIELD` |
| Authentication | `AUTH_` | `AUTH_TOKEN_EXPIRED` |
| Policy / Spending | `POLICY_` | `POLICY_DAILY_LIMIT` |
| Payment | `PAYMENT_` | `PAYMENT_INSUFFICIENT_FUNDS` |
| Upstream / External | `UPSTREAM_` | `UPSTREAM_HORIZON_DOWN` |
| Rate limit | `RATE_LIMIT_` | `RATE_LIMIT_EXCEEDED` |
| Body size | `BODY_` | `BODY_TOO_LARGE` |
| Not found | `NOT_FOUND_` | `NOT_FOUND_DRUG` |
| Server / Internal | `SERVER_` | `SERVER_DEGRADED` |

---

## Registry

| Code | HTTP Status | Meaning | Operator Remediation | Client Remediation |
|------|-------------|---------|---------------------|-------------------|
| `VALIDATION_MISSING_FIELD` | 400 | Required field missing or empty | — | Check request payload |
| `VALIDATION_INVALID_INPUT` | 400 | Input failed schema validation | — | Fix input format |
| `VALIDATION_INSUFFICIENT_SCORE` | 400 | Drug interaction score too low | — | Try different drug combination |
| `AUTH_TOKEN_MISSING` | 401 | No authentication token provided | Verify reverse proxy / middleware config | Include `Authorization` header |
| `AUTH_TOKEN_EXPIRED` | 401 | Token has expired | — | Re-authenticate via login flow |
| `AUTH_TOKEN_INVALID` | 403 | Token is malformed or revoked | Check for credential leaks | Re-authenticate |
| `AUTH_ADMIN_REQUIRED` | 403 | Admin token required for this endpoint | — | Use admin credentials |
| `NOT_FOUND_DRUG` | 404 | Drug name not in formulary | Check pharmacy data sync | Verify drug name spelling |
| `NOT_FOUND_PHARMACY` | 404 | Pharmacy not found | Check pharmacy data sync | Verify pharmacy ID |
| `NOT_FOUND_AGENT` | 404 | Agent config not found | Check agent setup | Reconfigure agent |
| `BODY_TOO_LARGE` | 413 | Request body exceeds size limit | Increase `MAX_BODY_SIZE` if legitimate | Reduce payload size |
| `POLICY_DAILY_LIMIT` | 402 | Daily spending cap reached | Increase cap or wait for reset | Schedule payment for next day |
| `POLICY_MONTHLY_LIMIT` | 402 | Monthly spending cap reached | Increase cap or wait for reset | Schedule payment for next month |
| `POLICY_APPROVAL_REQUIRED` | 402 | Amount exceeds approval threshold | Approve via caregiver dashboard | Request caregiver approval |
| `POLICY_CATEGORY_BLOCKED` | 402 | Category not in budget | Adjust budget categories | Reassign category or adjust budget |
| `PAYMENT_INSUFFICIENT_FUNDS` | 402 | Agent wallet has insufficient USDC/XLM | Fund agent wallet | Fund agent wallet via dashboard |
| `PAYMENT_TX_FAILED` | 500 | Stellar transaction failed | Check Stellar network status and wallet balance | Retry |
| `PAYMENT_TX_TIMEOUT` | 502 | Stellar transaction timed out | Check Horizon RPC availability | Retry with idempotency key |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Increase rate limit if legitimate | Back off and retry after `Retry-After` |
| `UPSTREAM_HORIZON_DOWN` | 502 | Stellar Horizon / Soroban RPC unreachable | Check `STELLAR_RPC_URL` and network status | Retry with backoff |
| `UPSTREAM_LLM_DOWN` | 502 | LLM provider (Groq) unreachable or error | Check `LLM_BASE_URL` and API key | Retry; switch to degraded mode |
| `UPSTREAM_FACILITATOR_DOWN` | 502 | OZ x402 facilitator unreachable | Check `X402_FACILITATOR_URL` and API key | Retry; fall back to direct payment |
| `UPSTREAM_FACILITATOR_ERROR` | 502 | OZ facilitator returned error | Review facilitator logs | Retry with backoff |
| `UPSTREAM_TIMEOUT` | 504 | External upstream request timed out | Check upstream health | Retry with backoff |
| `SERVER_DEGRADED` | 503 | Service running in degraded mode (Horizon down at boot) | Check Stellar RPC configuration | Retry later |
| `SERVER_INTERNAL_ERROR` | 500 | Unhandled server error | Check server logs and Sentry | Retry; contact support |

---

## Adding a New Error Code

1. Choose a category prefix from the table above and a `SCREAMING_SNAKE_CASE` specifier.
2. Add the code to this registry with its HTTP status, meaning, and remediations.
3. Add the code to the `Error.code` enum in `docs/openapi.yml`.
4. Use the new code in the server's error response.
5. If the error is user-facing, add a friendly message to the dashboard's error handler.

---

## Cross-References

- `docs/openapi.yml` — `Error.code` field enum (keep in sync with this registry)
- `docs/troubleshooting.md` — operator-facing troubleshooting guide (TODO)
