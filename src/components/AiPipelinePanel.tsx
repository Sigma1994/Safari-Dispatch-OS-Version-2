import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Cpu, Database, MessageSquareText, ShieldCheck, XCircle } from "lucide-react";
import type { AiTrace, AiTraceStep, HealthResponse } from "../types";

interface AiPipelinePanelProps {
  trace: AiTrace | null | undefined;
  health: HealthResponse | null;
}

const BLUEPRINT_STEPS = [
  {
    id: "nlu_intake",
    title: "1. Unstructured NLU Extraction",
    engine: "Local Ollama (qwen3:4b)",
    description:
      "Parses English, Swahili, or mixed trip requests into a strict JSON Schema (temperature 0). Automatically degrades to regex/lexicon rules if local Ollama is offline.",
  },
  {
    id: "tool_pricing",
    title: "2. Grounded Pricing & Fleet Tools",
    engine: "SQLite + Deterministic Pricing",
    description:
      "Queries real park tariffs (high/low season, residency), 50% child lodge rates, TSV fleet seats, and 1-guide-per-vehicle schedules. Zero LLM arithmetic.",
  },
  {
    id: "policy_critic",
    title: "3. Deterministic Policy Critic",
    engine: "Policy Guardrail Engine",
    description:
      "Separates hard operational blockers (30 guests > fleet capacity, unknown park) from soft exceptions (>10% discount, multi-vehicle, >7.5h drive).",
  },
  {
    id: "state_checkpoint",
    title: "4. HITL Checkpoint / Atomic DB",
    engine: "SQLite Checkpoints + BEGIN IMMEDIATE",
    description:
      "Pauses soft exceptions for manager sign-off without locking vehicles, or commits bookings inside an atomic BEGIN IMMEDIATE TOCTOU lock.",
  },
  {
    id: "nlg_response",
    title: "5. Grounded LLM Response Synthesis",
    engine: "Local Ollama + Grounding Verifier",
    description:
      "Drafts a natural customer reply in English or Swahili strictly grounded in verified SQLite facts, then verifies exact booking IDs and USD totals.",
  },
] as const;

function stepIcon(id: AiTraceStep["id"]) {
  switch (id) {
    case "nlu_intake":
      return Cpu;
    case "tool_pricing":
      return Database;
    case "policy_critic":
      return ShieldCheck;
    case "state_checkpoint":
      return Clock;
    case "nlg_response":
      return MessageSquareText;
  }
}

function stepStatusMeta(status: AiTraceStep["status"]) {
  switch (status) {
    case "completed":
      return { label: "Completed", color: "text-emerald-700", icon: CheckCircle2 };
    case "fallback":
      return { label: "Auto-Fallback", color: "text-amber-700", icon: AlertCircle };
    case "paused":
      return { label: "Paused", color: "text-amber-700", icon: Clock };
    case "retried":
      return { label: "Retried", color: "text-sky-700", icon: CheckCircle2 };
    case "blocked":
      return { label: "Blocked", color: "text-red-700", icon: XCircle };
  }
}

function formatEngineLabel(engine: string): string {
  if (engine.startsWith("ollama:")) return `Local Ollama (${engine.slice(7)})`;
  if (engine.startsWith("gemini:")) return `Online Cloud LLM (${engine.slice(7)})`;
  if (engine === "heuristic") return "Deterministic Rules";
  if (engine === "heuristic_fallback") return "Fallback Rules (Ollama offline)";
  if (engine === "template_fallback") return "Verified Template (Ollama offline)";
  if (engine === "template_grounding_guardrail") return "Grounding Guardrail -> Template";
  if (engine === "deterministic_template") return "Deterministic Template";
  if (engine === "postgresql + deterministic_pricing_ts") return "PostgreSQL + Pricing Engine";
  if (engine === "sqlite + deterministic_pricing_ts") return "SQLite + Pricing Engine";
  if (engine === "policy_guardrail_engine") return "Policy Guardrail Engine";
  if (engine === "sqlite_hitl_interrupt") return "HITL Checkpoint Queue";
  if (engine === "postgres_serializable_gist") return "PostgreSQL SERIALIZABLE + GiST";
  if (engine === "sqlite_begin_immediate") return "SQLite BEGIN IMMEDIATE";
  if (engine === "postgres_checkpoint_store") return "PostgreSQL Checkpoints";
  if (engine === "sqlite_checkpoint_store") return "Conversation Checkpoints";
  if (engine === "skipped_pending_slots") return "Waiting for Missing Info";
  return engine;
}

export function AiPipelinePanel({ trace, health }: AiPipelinePanelProps) {
  const [selectedStepId, setSelectedStepId] = useState<AiTraceStep["id"]>("nlu_intake");

  useEffect(() => {
    if (trace?.steps.length) {
      setSelectedStepId(trace.steps[0].id);
    }
  }, [trace]);

  const activeStep = trace?.steps.find((s) => s.id === selectedStepId) ?? trace?.steps[0] ?? null;

  const ollamaStatusText = health?.ollama.reachable
    ? health.ollama.model_installed
      ? `Local Ollama (${health.ollama.model}) ready`
      : `Ollama reachable · pull ${health.ollama.model}`
    : `Local Ollama (${health?.ollama.model ?? "qwen3:4b"}) not running here — auto-fallback active`;

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            AI Engineering Pipeline Walkthrough
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Neuro-symbolic architecture: LLM handles language &amp; synthesis · Deterministic SQLite tools enforce exact pricing &amp; zero double-bookings
          </p>
        </div>
        <div className="text-xs font-medium text-slate-600">
          {ollamaStatusText}
        </div>
      </div>

      {!trace ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-1">
          {BLUEPRINT_STEPS.map((step) => {
            const Icon = stepIcon(step.id);
            return (
              <div
                key={step.id}
                className="rounded-md border border-slate-200 bg-slate-50/70 p-3 space-y-1.5"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Icon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{step.title}</span>
                </div>
                <div className="text-xs font-medium text-emerald-800">{step.engine}</div>
                <p className="text-xs text-slate-600 leading-relaxed">{step.description}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 border-y border-slate-200 py-2.5">
            <span>
              NLU: <strong className="text-slate-900">{formatEngineLabel(trace.effective_nlu_engine)}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              NLG Reply: <strong className="text-slate-900">{formatEngineLabel(trace.effective_nlg_engine)}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Total Time: <strong className="text-slate-900">{trace.total_duration_ms.toFixed(1)} ms</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {trace.steps.map((step) => {
              const Icon = stepIcon(step.id);
              const meta = stepStatusMeta(step.status);
              const StatusIcon = meta.icon;
              const isSelected = activeStep?.id === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setSelectedStepId(step.id)}
                  className={`text-left rounded-md border p-3 transition-colors space-y-1.5 ${
                    isSelected
                      ? "border-emerald-700 bg-emerald-50/50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Icon className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${meta.color}`}>
                      <StatusIcon className="w-3 h-3 shrink-0" />
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-900 leading-snug">{step.title}</div>
                  <div className="text-xs text-slate-600 truncate">{formatEngineLabel(step.engine)}</div>
                  <div className="text-xs font-mono text-slate-500 tabular-nums">
                    {step.duration_ms.toFixed(1)} ms
                  </div>
                </button>
              );
            })}
          </div>

          {activeStep && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{activeStep.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{activeStep.summary}</div>
                </div>
                <div className="text-xs font-mono text-slate-600 tabular-nums">
                  {formatEngineLabel(activeStep.engine)} · {activeStep.duration_ms.toFixed(1)} ms
                </div>
              </div>

              {activeStep.note && (
                <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <strong className="text-slate-900">Engineering Note:</strong> {activeStep.note}
                </div>
              )}

              {activeStep.prompt_preview && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-700">
                    System Prompt &amp; Schema Constraint
                  </div>
                  <pre className="p-3 rounded bg-slate-900 text-slate-100 text-xs overflow-x-auto max-h-48 leading-relaxed">
                    {activeStep.prompt_preview}
                  </pre>
                </div>
              )}

              {(activeStep.input_payload || activeStep.output_payload) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {activeStep.input_payload && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-slate-700">Stage Input</div>
                      <pre className="p-3 rounded bg-white border border-slate-200 text-slate-800 text-xs overflow-x-auto max-h-56">
                        {JSON.stringify(activeStep.input_payload, null, 2)}
                      </pre>
                    </div>
                  )}
                  {activeStep.output_payload && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-slate-700">Verified Output</div>
                      <pre className="p-3 rounded bg-white border border-slate-200 text-slate-800 text-xs overflow-x-auto max-h-56">
                        {JSON.stringify(activeStep.output_payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
