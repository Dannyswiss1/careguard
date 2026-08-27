/**
 * Secret and PII redaction helpers.
 *
 * Used by Sentry beforeSend (and any other transport that ships logs/errors
 * off-box) to strip values that must never leave the process: Stellar secret
 * seeds (S...), agent task strings (may contain PII), API keys, and a known
 * set of env-var-shaped fields.
 *
 * Conservative by design — when in doubt, redact.
 */

import { createHash } from "crypto";

const REDACTED = "[REDACTED]";

const SECRET_FIELD_NAMES = new Set([
  "task",
  "AGENT_SECRET_KEY",
  "agent_secret_key",
  "agentSecretKey",
  "MPP_SECRET_KEY",
  "mpp_secret_key",
  "mppSecretKey",
  "LLM_API_KEY",
  "llm_api_key",
  "llmApiKey",
  "OZ_FACILITATOR_API_KEY",
  "oz_facilitator_api_key",
  "ozFacilitatorApiKey",
  "CAREGIVER_SECRET_KEY",
  "PHARMACY_1_SECRET_KEY",
  "PHARMACY_2_SECRET_KEY",
  "PHARMACY_3_SECRET_KEY",
  "BILL_PROVIDER_SECRET_KEY",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "set-cookie",
  "Set-Cookie",
  "x-api-key",
  "X-Api-Key",
]);

// Stellar secret seeds: S followed by 55 base32 chars
const STELLAR_SECRET_RE = /\bS[A-Z2-7]{55}\b/g;
// Bearer tokens / JWT-ish
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-+/=]{20,}\b/gi;

// Default known names to protect against cold-start or unconfigured states in tests/server.
const DEFAULT_NAMES = ["Rosa Garcia", "Maria Garcia", "Rosa Martinez", "Maria Martinez"];
const knownNames = new Set<string>(DEFAULT_NAMES);
let patientNameRegexCache: RegExp | null = null;

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPatientNameRegex(): RegExp {
  if (!patientNameRegexCache) {
    const escapedNames = Array.from(knownNames)
      .filter((name) => name.length > 0)
      .map(escapeRegExp);
    if (escapedNames.length === 0) {
      // Impossible regex match if no names registered
      patientNameRegexCache = /$^/;
    } else {
      // Match full words only
      patientNameRegexCache = new RegExp(`\\b(?:${escapedNames.join("|")})\\b`, "g");
    }
  }
  return patientNameRegexCache;
}

export function registerKnownNames(names: string[]): void {
  let changed = false;
  for (const name of names) {
    if (name && typeof name === "string") {
      const trimmed = name.trim();
      if (trimmed.length > 0 && !knownNames.has(trimmed)) {
        knownNames.add(trimmed);
        changed = true;
      }
    }
  }
  if (changed) {
    patientNameRegexCache = null;
  }
}

// Drug specifics: capitalized drug name followed by optional dosage (e.g. "Lisinopril 10mg", "Metformin 500mg")
const DRUG_SPECIFIC_RE = /\b[A-Z][a-z]+ \d+\s*mg\b/gi;

export function redactString(value: string): string {
  return value.replace(STELLAR_SECRET_RE, REDACTED).replace(BEARER_RE, `Bearer ${REDACTED}`);
}

export function redactPII(value: string): string {
  return value
    .replace(getPatientNameRegex(), "[PATIENT NAME]")
    .replace(DRUG_SPECIFIC_RE, "[MEDICATION]");
}

export function hashTask(task: string): string {
  return createHash("sha256").update(task, "utf-8").digest("hex");
}

export function redact<T>(value: T, depth = 0): T {
  if (depth > 8) return value;
  if (value == null) return value;
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD_NAMES.has(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out as unknown as T;
  }
  return value;
}
