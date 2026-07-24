/**
 * Dynamic Stellar fee selection.
 *
 * Reads Horizon /fee_stats and targets the p90 fee charged in the
 * recent ledger history. Falls back to "100" stroops on any error.
 */

import { Horizon } from "@stellar/stellar-sdk";

const MIN_FEE_STROOPS = 100;
// Matches the fee-bump ceiling in agent/tools.ts — a congestion spike in
// fee_charged.p90 should never push the *initial* target fee past what the
// retry logic treats as its own maximum.
const MAX_FEE_STROOPS = 100_000;

/**
 * Fetch the target fee from Horizon's /fee_stats endpoint.
 *
 * @param horizon - A connected Horizon.Server instance.
 * @returns The p90 fee as a string, clamped to [100, 100000] stroops, or "100"
 *          on any error or missing/malformed fee_stats data.
 */
export async function getTargetFee(horizon: Horizon.Server): Promise<string> {
  try {
    const feeStats = await horizon.feeStats();
    const p90Fee = parseInt(feeStats.fee_charged.p90, 10);
    if (Number.isFinite(p90Fee) && p90Fee > 0) {
      return String(Math.min(MAX_FEE_STROOPS, Math.max(MIN_FEE_STROOPS, p90Fee)));
    }
    return String(MIN_FEE_STROOPS);
  } catch {
    return String(MIN_FEE_STROOPS);
  }
}
