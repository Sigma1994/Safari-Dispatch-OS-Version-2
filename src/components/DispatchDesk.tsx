import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Cpu, RefreshCw, Send, SlidersHorizontal, X } from "lucide-react";
import type {
  AuditEntry,
  HealthResponse,
  NluMode,
  PendingApprovalItem,
  QuoteResult,
  QuoteSuccess,
  WorkflowResponse,
} from "../types";
import { formatMissingField, formatParty, formatResidency, formatStepName } from "../utils/format";
import { AiPipelinePanel } from "./AiPipelinePanel";
import { StatusText } from "./StatusText";

interface DispatchDeskProps {
  approvals: PendingApprovalItem[];
  health: HealthResponse | null;
  onWorkflowComplete: () => Promise<void>;
}

const PRESETS = [
  {
    id: "mara10",
    label: "10-Guest Group (Needs Approval)",
    customer: "Savanna Horizons Travel",
    message: "Tunataka quote ya Maasai Mara Classic kwa 10 people kuanzia 2026-12-15 with 15% discount.",
  },
  {
    id: "clarify",
    label: "Incomplete Request",
    customer: "David Mwangi",
    message: "Quote for Amboseli please",
  },
  {
    id: "nakuru",
    label: "2-Guest Nakuru Booking",
    customer: "Amina & Family",
    message: "Book Lake Nakuru for 2 ea citizen adults and 1 child starting 2026-12-20",
  },
  {
    id: "overflow",
    label: "Over-Capacity Check (30 Guests)",
    customer: "Summit Tour Group",
    message: "Maasai Mara Classic for 30 adults starting 2026-12-11",
  },
] as const;

function isQuoteSuccess(q: QuoteResult | null | undefined): q is QuoteSuccess {
  return Boolean(q && !("error" in q) && "circuit" in q);
}

export function DispatchDesk({ approvals, health, onWorkflowComplete }: DispatchDeskProps) {
  const [message, setMessage] = useState<string>(PRESETS[0].message);
  const [customerName, setCustomerName] = useState<string>(PRESETS[0].customer);
  const [followUpText, setFollowUpText] = useState<string>("");
  const [threadId, setThreadId] = useState<string>("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [nluMode, setNluMode] = useState<NluMode>("ollama");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPipeline, setShowPipeline] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState("Operations Manager");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<WorkflowResponse | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  async function fetchAudit(tid: string) {
    const res = await fetch(`/api/audit/${encodeURIComponent(tid)}`);
    if (res.ok) {
      setAuditEntries((await res.json()) as AuditEntry[]);
    }
  }

  async function dispatchInquiry(msgToSend: string, activeThreadId?: string) {
    if (!msgToSend.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (idempotencyKey.trim()) {
        headers["Idempotency-Key"] = idempotencyKey.trim();
      }
      const body: Record<string, unknown> = { message: msgToSend.trim(), mode: nluMode };
      const targetThread = activeThreadId ?? threadId.trim();
      if (targetThread) {
        body.thread_id = targetThread;
      }
      if (customerName.trim()) {
        body.customer_name = customerName.trim();
      }

      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || "Could not process this request. Please check your details and try again.");
        return;
      }

      const wf = data as WorkflowResponse;
      setLatestResult(wf);
      if (wf.status === "clarification_needed") {
        setThreadId(wf.thread_id);
        setFollowUpText("4 adults starting 2026-12-20");
      } else {
        setThreadId("");
        setFollowUpText("");
      }
      await fetchAudit(wf.thread_id);
      await onWorkflowComplete();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error submitting request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await dispatchInquiry(message);
  }

  async function handleFollowUpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!latestResult || !followUpText.trim()) return;
    await dispatchInquiry(followUpText, latestResult.thread_id);
  }

  async function handleResolve(tid: string, approved: boolean) {
    setResolvingId(tid);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(tid)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, reviewer: reviewer.trim() || "Operations Manager" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(
          res.status === 409
            ? `Vehicle or guide no longer available: ${data.detail}`
            : `Could not complete approval (${res.status}): ${data.detail || "Please try again."}`
        );
        await onWorkflowComplete();
        return;
      }
      setLatestResult((prev) =>
        prev && prev.thread_id === tid
          ? {
              ...prev,
              paused_for_approval: false,
              status: data.status,
              final_response: data.final_response,
              quote: data.quote,
              ai_trace: data.ai_trace ?? prev.ai_trace,
            }
          : prev
      );
      await fetchAudit(tid);
      await onWorkflowComplete();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error resolving approval.");
    } finally {
      setResolvingId(null);
    }
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setThreadId("");
    setIdempotencyKey("");
    setFollowUpText("");
    setCustomerName(preset.customer);
    setMessage(preset.message);
    setErrorMsg(null);
  }

  const quote = latestResult?.quote;
  const quoteOk = isQuoteSuccess(quote);

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
          <div className="flex-1">{errorMsg}</div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-900 font-medium text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Trip Quote Request + Quote Summary */}
        <div className="xl:col-span-7 space-y-6">
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">New Safari Quote</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Paste or type a guest request in English or Swahili to check availability and calculate pricing.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPipeline((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    showPipeline
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200"
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  {showPipeline ? "AI Pipeline: Shown" : "AI Pipeline: Hidden"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {showAdvanced ? "Hide Options" : "Options"}
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="customer-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Customer or Agency Name
                </label>
                <input
                  id="customer-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Amani Safaris Ltd or Jane Wanjiku"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="inquiry-msg" className="block text-xs font-medium text-slate-700 mb-1">
                  Trip Request
                </label>
                <textarea
                  id="inquiry-msg"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Example: 4 adults and 2 children for Maasai Mara Classic starting 2026-12-15"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {showAdvanced && (
                <div className="rounded-md bg-slate-50 border border-slate-200 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">AI Inference Engine</span>
                    <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
                      {(health?.online_llm_enabled
                        ? (["ollama", "deterministic", "gemini"] as NluMode[])
                        : (["ollama", "deterministic"] as NluMode[])
                      ).map((mode) => {
                        const label =
                          mode === "ollama"
                            ? "Local Ollama (Default)"
                            : mode === "deterministic"
                            ? "Deterministic Rules"
                            : "Cloud LLM (Production)";
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setNluMode(mode)}
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                              nluMode === mode
                                ? "bg-white text-slate-900 shadow-xs"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="thread-id" className="block text-xs font-medium text-slate-600 mb-1">
                        Conversation Reference (optional)
                      </label>
                      <input
                        id="thread-id"
                        type="text"
                        value={threadId}
                        onChange={(e) => setThreadId(e.target.value)}
                        placeholder="Leave blank to start a new quote"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="idem-key" className="block text-xs font-medium text-slate-600 mb-1">
                        Duplicate-Check Key (optional)
                      </label>
                      <input
                        id="idem-key"
                        type="text"
                        value={idempotencyKey}
                        onChange={(e) => setIdempotencyKey(e.target.value)}
                        placeholder="Prevents double submission on retry"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500 mr-1">Examples:</span>
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? "Calculating..." : threadId.trim() ? "Update Quote" : "Generate Quote"}
                </button>
              </div>
            </form>
          </section>

          {/* Quote Summary */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            {!latestResult ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-slate-700">Ready to calculate a safari quote</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Enter a trip request above or pick one of the sample requests to see vehicle assignments, guide availability, and itemized USD and KES pricing.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {latestResult.slots?.customer_name && (
                        <>
                          <span className="font-medium text-slate-700">{latestResult.slots.customer_name}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span className="font-mono">Ref {latestResult.thread_id}</span>
                      {latestResult.idempotent_replay && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-slate-700">Returned saved quote</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 leading-snug">
                      {latestResult.final_response}
                    </h3>
                  </div>
                  <StatusText status={latestResult.status} />
                </div>

                {latestResult.slots?.fallback_error && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Local Ollama is unreachable on this host, so deterministic rules &amp; verified templates took over automatically (inspect the fallback trace below).
                  </div>
                )}

                {!latestResult.slots?.fallback_error &&
                  latestResult.ai_trace?.effective_nlg_engine.startsWith("ollama:") && (
                    <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                      Parsed &amp; drafted by <strong>{latestResult.ai_trace.effective_nlg_engine}</strong> · Verified against deterministic SQLite rates.
                    </div>
                  )}

                {latestResult.status === "clarification_needed" && (
                  <form
                    onSubmit={handleFollowUpSubmit}
                    className="border-t border-slate-200 pt-4 space-y-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-800">Please add the missing details:</div>
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                        {(latestResult.slots?.missing_fields ?? []).map((f) => (
                          <li key={f}>• {formatMissingField(f)}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        aria-label="Add missing trip details"
                        value={followUpText}
                        onChange={(e) => setFollowUpText(e.target.value)}
                        placeholder="e.g. 4 adults starting 2026-12-20"
                        className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                      <button
                        type="submit"
                        disabled={submitting || !followUpText.trim()}
                        className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
                      >
                        {submitting ? "Updating..." : "Complete Quote"}
                      </button>
                    </div>
                  </form>
                )}

                {quoteOk && (
                  <div className="border-t border-slate-200 pt-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <div className="text-xs text-slate-500">Safari Circuit</div>
                        <div className="text-sm font-semibold text-slate-900 mt-0.5">{quote.circuit.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {quote.days} Days, {quote.nights} Nights · {quote.season === "high" ? "Peak" : "Low"} Season
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Dates &amp; Travelers</div>
                        <div className="text-sm font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                          {quote.start_date}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatParty(quote.adults, quote.children, quote.infants_under_5)} ·{" "}
                          {formatResidency(quote.residency_tier)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Vehicles &amp; Guides</div>
                        <div className="text-sm font-mono font-medium text-slate-900 mt-0.5">
                          {quote.vehicle_codes.join(", ") || "None available"}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {quote.assigned_guides.map((g) => g.name).join(", ") || "No guide available"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">
                          Total Quote{quote.discount_pct > 0 ? ` (${quote.discount_pct}% discount)` : ""}
                        </div>
                        <div className="text-sm font-mono font-semibold text-emerald-700 tabular-nums mt-0.5">
                          USD {quote.quoted_total_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs font-mono text-slate-600 tabular-nums mt-0.5">
                          KES {quote.quoted_total_kes.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto border-t border-slate-200 pt-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-500 border-b border-slate-200">
                            <th className="py-1.5 font-medium">Price Breakdown</th>
                            <th className="py-1.5 font-medium text-right">USD</th>
                            <th className="py-1.5 font-medium text-right">KES (Rate {quote.fx_usd_to_kes})</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 tabular-nums font-mono">
                          <tr>
                            <td className="py-2 font-sans text-slate-700">
                              Safari Vehicles ({quote.assigned_vehicles.length} × {quote.days} days)
                            </td>
                            <td className="py-2 text-right text-slate-900">{quote.breakdown_usd.vehicles.toFixed(2)}</td>
                            <td className="py-2 text-right text-slate-600">
                              {quote.breakdown_kes.vehicles.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 font-sans text-slate-700">
                              Driver-Guides ({quote.assigned_guides.length} × {quote.days} days)
                            </td>
                            <td className="py-2 text-right text-slate-900">{quote.breakdown_usd.guide.toFixed(2)}</td>
                            <td className="py-2 text-right text-slate-600">
                              {quote.breakdown_kes.guide.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 font-sans text-slate-700">
                              Lodge Accommodation ({quote.nights} nights · children 50%)
                            </td>
                            <td className="py-2 text-right text-slate-900">
                              {quote.breakdown_usd.accommodation.toFixed(2)}
                            </td>
                            <td className="py-2 text-right text-slate-600">
                              {quote.breakdown_kes.accommodation.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 font-sans text-slate-700">
                              Park &amp; Conservation Fees ({quote.days} days · infants free)
                            </td>
                            <td className="py-2 text-right text-slate-900">
                              {quote.breakdown_usd.conservation_fees.toFixed(2)}
                            </td>
                            <td className="py-2 text-right text-slate-600">
                              {quote.breakdown_kes.conservation_fees.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {latestResult.critique && latestResult.critique.reasons.length > 0 && (
                  <div className="border-t border-slate-200 pt-3">
                    <div className="text-xs font-semibold text-slate-700 mb-1.5">Review Notes</div>
                    <ul className="space-y-1 text-xs text-slate-600">
                      {latestResult.critique.reasons.map((r, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-amber-600 mt-0.5">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {auditEntries.length > 0 && (
                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setShowActivity((v) => !v)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900"
                      >
                        {showActivity ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        Step-by-Step Activity ({auditEntries.length})
                      </button>
                      {showActivity && (
                        <button
                          type="button"
                          onClick={() => setShowRawJson((v) => !v)}
                          className="text-xs text-slate-500 hover:text-slate-900"
                        >
                          {showRawJson ? "Hide Technical JSON" : "View Technical JSON"}
                        </button>
                      )}
                    </div>

                    {showActivity && (
                      <div className="mt-2.5 space-y-1.5">
                        {auditEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between gap-4 py-1.5 px-2.5 rounded bg-slate-50 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-slate-800">{formatStepName(entry.node_name)}</span>
                              <span aria-hidden="true" className="text-slate-400">·</span>
                              <span className="text-slate-600 truncate">{entry.decision.replaceAll("_", " ")}</span>
                            </div>
                            <span className="font-mono text-slate-400 tabular-nums shrink-0">
                              {entry.created_at.slice(11, 19)}
                            </span>
                          </div>
                        ))}
                        {showRawJson && (
                          <pre className="mt-2 p-3 rounded-md bg-slate-900 text-slate-100 text-xs overflow-x-auto max-h-64">
                            {JSON.stringify({ result: latestResult, audit: auditEntries }, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 cols: Manager Approval Queue */}
        <div className="xl:col-span-5">
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Waiting for Manager Approval</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Trips with discounts over 10%, multiple vehicles, or long driving days need your sign-off before booking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onWorkflowComplete()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            <div className="mb-4">
              <label htmlFor="reviewer-name" className="block text-xs font-medium text-slate-700 mb-1">
                Approving Manager Name
              </label>
              <input
                id="reviewer-name"
                type="text"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            {approvals.length === 0 ? (
              <div className="border-t border-slate-200 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">No quotes waiting for approval</p>
                <p className="text-xs text-slate-500 mt-1">
                  Try the &ldquo;10-Guest Group (Needs Approval)&rdquo; example to see how manager sign-off works.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border-t border-slate-200">
                {approvals.map((item) => {
                  const q = isQuoteSuccess(item.quote) ? item.quote : null;
                  const busy = resolvingId === item.thread_id;
                  return (
                    <div key={item.thread_id} className="py-4 first:pt-4 last:pb-0 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-600">
                          {item.slots?.customer_name || item.thread_id}
                        </span>
                        <StatusText status="awaiting_approval" />
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {q ? q.circuit.name : "Pending Inquiry"}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{item.user_message}</p>

                      {q && (
                        <div className="text-xs text-slate-700 tabular-nums">
                          <span className="font-mono font-semibold">USD {q.quoted_total_usd.toFixed(2)}</span> (KES{" "}
                          <span className="font-mono">
                            {q.quoted_total_kes.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                          ) · {q.total_pax} Guests · Vehicles: <span className="font-mono">{q.vehicle_codes.join(", ")}</span>
                        </div>
                      )}

                      <ul className="space-y-1 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        {item.critique.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleResolve(item.thread_id, true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve &amp; Book
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleResolve(item.thread_id, false)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                          Decline &amp; Hold
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {showPipeline && (
        <AiPipelinePanel trace={latestResult?.ai_trace} health={health} />
      )}
    </div>
  );
}
