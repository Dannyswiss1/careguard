"use client";

import { useEffect, useState } from "react";
import type { Transaction } from "../types";
import { formatDateTime, type Locale } from "../../i18n";


export interface ApprovalsTabProps {
  agentConnected: boolean;
  approvals: Transaction[];
  loading: boolean;
  onApprove: (txId: string) => Promise<void>;
  onCancel: (txId: string) => Promise<void>;
  // #1139 — defaults to "en" so existing callers that don't pass a locale
  // render identically to before this change.
  locale?: Locale;
}

export function ApprovalsTab({
  agentConnected,
  approvals,
  loading,
  onApprove,
  onCancel,
  locale = "en",
}: ApprovalsTabProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      role="tabpanel"
      id="tabpanel-approvals"
      aria-labelledby="tab-approvals"
      tabIndex={0}
      className="space-y-6"
    >
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          Pending Approvals
        </h2>
        {!agentConnected && (
          <p className="text-xs text-slate-500">Agent not connected.</p>
        )}
        {agentConnected && approvals.length === 0 && (
          <p className="text-xs text-slate-500">No pending approvals.</p>
        )}
        {approvals.length > 0 && (
          <div className="space-y-3">
            {approvals.map((tx) => (
              <div
                key={tx.id}
                className="border border-amber-200 bg-amber-50 rounded-lg p-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      {tx.description}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Amount: ${tx.amount.toFixed(2)} | Category: {tx.category}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {formatDateTime(new Date(tx.timestamp), locale)}
                    </div>
                    {tx.pendingUntil && (
                      <div className="text-xs text-amber-600 mt-1">
                        {(() => {
                          try {
                            const ms = new Date(tx.pendingUntil).getTime() - Date.now();
                            const sec = Math.max(0, Math.ceil(ms / 1000));
                            const announcedSec = sec <= 5 ? sec : Math.ceil(sec / 10) * 10;
                            return (
                              <>
                                <span aria-hidden="true">Auto-approve in {sec}s</span>
                                <span className="sr-only" aria-live="polite">
                                  Auto-approve in {announcedSec} seconds
                                </span>
                              </>
                            );
                          } catch {
                            return null;
                          }
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onApprove(tx.id)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => onCancel(tx.id)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          How Approvals Work
        </h2>
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            When the AI agent encounters a payment above the approval threshold
            (${" "}
            <code className="bg-slate-100 px-1 rounded">approvalThreshold</code>),
            it creates a pending transaction instead of paying immediately.
          </p>
          <p>
            You can review and approve or cancel each pending transaction here.
            Approving will execute the payment; canceling will stop it.
          </p>
        </div>
      </div>
    </div>
  );
}
