import { useState } from "react";
import { Play } from "lucide-react";
import type { HealthResponse, VerificationSuiteReport } from "../types";
import { StatusText } from "./StatusText";

interface EngineAndTestsProps {
  health: HealthResponse | null;
  onRefreshHealth: () => Promise<void>;
}

export function EngineAndTests({ health, onRefreshHealth }: EngineAndTestsProps) {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<VerificationSuiteReport | null>(null);

  async function handleRunSuite() {
    setRunning(true);
    try {
      const res = await fetch("/api/tests/run", { method: "POST" });
      if (res.ok) {
        setReport((await res.json()) as VerificationSuiteReport);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">System Settings &amp; AI Status</h2>
              <p className="text-xs text-slate-500 mt-0.5">Active pricing rules and language parser status</p>
            </div>
            <button
              type="button"
              onClick={() => void onRefreshHealth()}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
            >
              Refresh Status
            </button>
          </div>

          {health ? (
            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Default AI Engine</dt>
                <dd className="font-medium text-slate-900">
                  {health.mode === "deterministic"
                    ? "Deterministic Rules (Offline Mode)"
                    : `Local Ollama (${health.ollama.model}) — Primary`}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Local Ollama Server</dt>
                <dd className="font-mono text-slate-800">{health.ollama.base_url}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Ollama Model ({health.ollama.model})</dt>
                <dd className="text-slate-800">
                  {health.ollama.reachable
                    ? health.ollama.model_installed
                      ? "Ready (Live NLU + Grounded NLG)"
                      : "Server reachable (model not downloaded yet)"
                    : "Offline here (auto-fallback to Deterministic Rules)"}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Production Cloud LLM</dt>
                <dd className="text-slate-800">
                  {health.online_llm_enabled ? "Enabled (Production Key Active)" : "Disabled (Local Ollama primary)"}
                </dd>
              </div>
              {health.database && (
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Database Storage Engine</dt>
                  <dd className="text-slate-800 text-right">
                    {health.database.active_engine === "postgres" ? (
                      <span className="font-medium text-emerald-700">
                        PostgreSQL ({health.database.postgres.host}:{health.database.postgres.port}/{health.database.postgres.database})
                      </span>
                    ) : (
                      <span>
                        SQLite Fallback (Docker Postgres offline at{" "}
                        <span className="font-mono">
                          {health.database.postgres.host}:{health.database.postgres.port}
                        </span>
                        )
                      </span>
                    )}
                  </dd>
                </div>
              )}
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Exchange Rate &amp; Approval Limits</dt>
                <dd className="font-mono text-slate-800 tabular-nums">
                  {health.policy.usd_to_kes_rate} KES/USD · {health.policy.max_auto_discount_pct}% max auto-discount ·{" "}
                  {health.policy.max_daily_drive_hours_safe}h drive limit
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-500">Checking system status...</p>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Local Docker PostgreSQL &amp; Ollama Setup</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Run PostgreSQL 16 in Docker Desktop (with automatic schema + seed scripts) and Ollama locally. When Postgres or Ollama is offline, the app falls back to SQLite and deterministic rules automatically.
          </p>
          <pre className="p-3 rounded-md bg-slate-900 text-slate-100 text-xs overflow-x-auto leading-relaxed">
{`# 1. Start PostgreSQL 16 via Docker Desktop (auto-creates & seeds DB)
docker compose up -d postgres

# 2. Or manually create / populate / reset tables via CLI scripts
npm run db:create
npm run db:seed
npm run db:reset

# 3. Pull Local Ollama model & run verification tests
ollama pull qwen3:4b
npm test`}
          </pre>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Automated Pricing &amp; Booking Checks</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Runs all automated verification checks (park fees, multi-vehicle guides, double-booking protection, manager approvals, and follow-up replies) safely in temporary memory.
            </p>
          </div>
          <button
            type="button"
            disabled={running}
            onClick={() => void handleRunSuite()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? "Running Checks..." : "Run All Checks"}
          </button>
        </div>

        {report ? (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
              <span className="font-semibold text-slate-900">Total: {report.total}</span>
              <span className="font-semibold text-emerald-700">Passed: {report.passed}</span>
              <span className={`font-semibold ${report.failed > 0 ? "text-red-700" : "text-slate-500"}`}>
                Failed: {report.failed}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-medium">Area</th>
                    <th className="py-2 pr-3 font-medium">Check</th>
                    <th className="py-2 pr-3 font-medium text-right">Time</th>
                    <th className="py-2 font-medium text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.results.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2 pr-3 font-mono text-slate-500 uppercase">{r.category}</td>
                      <td className="py-2 pr-3 text-slate-800">
                        <div>{r.name}</div>
                        {r.error && <div className="text-red-600 font-mono mt-0.5">{r.error}</div>}
                      </td>
                      <td className="py-2 pr-3 font-mono text-right tabular-nums text-slate-500">
                        {r.duration_ms.toFixed(1)} ms
                      </td>
                      <td className="py-2 text-right">
                        <StatusText status={r.passed ? "passed" : "failed"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="border-t border-slate-200 py-8 text-center text-xs text-slate-500">
            Click &ldquo;Run All Checks&rdquo; to verify pricing rules, booking conflict guards, and approval workflows.
          </div>
        )}
      </section>
    </div>
  );
}
