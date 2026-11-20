import { useMemo, useState } from "react";
import { Check, Copy, Download, FileCode2, Layers, ListOrdered } from "lucide-react";
import {
  buildChatMlJsonlLine,
  buildStarterDatasetJsonl,
  STARTER_DATASET_PAIRS,
  TRAINING_DATA_OPTIONS,
  TRAINING_STEPS,
  type DataOptionId,
  type TrainingStep,
} from "../data/loraPlaybookData";

const CIRCUIT_CHOICES = [
  "Maasai Mara Classic",
  "Amboseli Kilimanjaro Loop",
  "Tsavo East & West Expedition",
  "Lake Nakuru Flamingo & Rift",
  "Samburu Ewaso Nyiro Safari",
  "Grand Rift & Mara Marathon",
  "Serengeti",
];

const RESIDENCY_CHOICES = [
  { value: "ea_citizen", label: "East African Citizen (ea_citizen)" },
  { value: "ke_resident", label: "Kenya Resident (ke_resident)" },
  { value: "af_citizen", label: "African Citizen (af_citizen)" },
  { value: "non_resident", label: "Non-Resident (non_resident)" },
];

function triggerDownload(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

interface StepCardProps {
  step: TrainingStep;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
}

function StepDetailSection({ step, copiedKey, onCopy }: StepCardProps) {
  const isCopied = copiedKey === step.id;

  return (
    <article className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-semibold text-emerald-800">{step.number}</span>
            <span aria-hidden="true">·</span>
            <span>{step.environment}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Est. {step.estimatedTime}</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
          <p className="text-xs text-slate-600 leading-relaxed">{step.summary}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => triggerDownload(step.filename, step.script)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download {step.filename}
          </button>
          <button
            type="button"
            onClick={() => onCopy(step.id, step.script)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {isCopied ? "Copied" : "Copy Script"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-900">What This Step Does</h4>
            <ul className="space-y-1.5 text-xs text-slate-600 leading-relaxed list-disc pl-4">
              {step.details.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <dl className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
            <div className="py-2 flex flex-col gap-0.5">
              <dt className="text-slate-500">Required Inputs</dt>
              <dd className="font-mono text-slate-800">{step.inputs}</dd>
            </div>
            <div className="py-2 flex flex-col gap-0.5">
              <dt className="text-slate-500">Generated Outputs</dt>
              <dd className="font-mono text-slate-800">{step.outputs}</dd>
            </div>
          </dl>

          <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 leading-relaxed">
            <strong className="text-slate-900">Engineering Guardrail: </strong>
            {step.pitfallNote}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono">{step.filename}</span>
            <span>{step.language}</span>
          </div>
          <pre className="p-3.5 rounded-md bg-slate-900 text-slate-100 text-xs overflow-x-auto max-h-96 leading-relaxed">
            <code>{step.script}</code>
          </pre>
        </div>
      </div>
    </article>
  );
}

export function LoraTrainingPlaybook() {
  const [selectedOption, setSelectedOption] = useState<DataOptionId>("audit_log");
  const [viewMode, setViewMode] = useState<"stepped" | "all">("stepped");
  const [activeStepId, setActiveStepId] = useState<string>(TRAINING_STEPS[0].id);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Interactive Custom Data Pair Builder state
  const [customMsg, setCustomMsg] = useState(
    "Oya dispatch, wasee 4 wa Kenya wanadai Mara kuanzia 2026-12-12 na mtoto 1 chini ya miaka 5."
  );
  const [customCircuit, setCustomCircuit] = useState("Maasai Mara Classic");
  const [customStartDate, setCustomStartDate] = useState("2026-12-12");
  const [customAdults, setCustomAdults] = useState(4);
  const [customChildren, setCustomChildren] = useState(0);
  const [customInfants, setCustomInfants] = useState(1);
  const [customResidency, setCustomResidency] = useState("ea_citizen");
  const [customDiscount, setCustomDiscount] = useState(0);
  const [customLanguage, setCustomLanguage] = useState<"en" | "sw" | "mixed">("mixed");

  function handleCopy(key: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1800);
  }

  const activeDataOption =
    TRAINING_DATA_OPTIONS.find((opt) => opt.id === selectedOption) ?? TRAINING_DATA_OPTIONS[0];
  const activeStep =
    TRAINING_STEPS.find((step) => step.id === activeStepId) ?? TRAINING_STEPS[0];

  const customBuiltJsonl = useMemo(() => {
    const slotObject = {
      intent: "quote_request",
      language: customLanguage,
      customer_name: null,
      circuit_name: customCircuit === "(null — Follow-up Turn)" ? null : customCircuit,
      start_date: customStartDate || null,
      adults: customAdults,
      children: customChildren,
      infants_under_5: customInfants,
      residency_tier: customResidency || null,
      prefer_senior_guide: false,
      discount_pct: customDiscount,
      missing_fields: [],
    };
    return buildChatMlJsonlLine({
      task: "nlu",
      userMessage: customMsg,
      assistantOutput: JSON.stringify(slotObject),
    });
  }, [
    customAdults,
    customChildren,
    customCircuit,
    customDiscount,
    customInfants,
    customLanguage,
    customMsg,
    customResidency,
    customStartDate,
  ]);

  const starterJsonl = useMemo(() => buildStarterDatasetJsonl(), []);

  return (
    <div className="space-y-6">
      {/* Intro & GPU Readiness Spec Strip */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">
              Optional QLoRA Fine-Tuning Playbook (When GPU Resources Are Available)
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Safari Dispatch OS already runs end-to-end with stock Ollama (<span className="font-mono">qwen3:4b</span>) and JSON Schema enforcement. Use this standalone guide only later when you move onto an NVIDIA GPU machine (8 GB+ VRAM or Colab/RunPod) to specialize the model on Nairobi Sheng, coastal Swahili dialects, and your exported agency transcripts—then ship a single quantized GGUF back to your regular laptop.
            </p>
          </div>
          <button
            type="button"
            onClick={() => triggerDownload("safari_dispatch_sheng_seed.jsonl", starterJsonl, "application/jsonl")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download Starter Seed (.jsonl)
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-t border-slate-100 pt-4 text-xs">
          <div>
            <div className="text-slate-500">Minimum GPU Requirement</div>
            <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
              8–12 GB VRAM (T4 / RTX 3060+)
            </div>
          </div>
          <div>
            <div className="text-slate-500">Base Weights</div>
            <div className="font-mono font-semibold text-slate-900 mt-0.5">Qwen/Qwen3-4B (4-bit NF4)</div>
          </div>
          <div>
            <div className="text-slate-500">Laptop Runtime Artifact</div>
            <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
              Q4_K_M GGUF (~2.5 GB)
            </div>
          </div>
          <div>
            <div className="text-slate-500">Target Ollama Model Tag</div>
            <div className="font-mono font-semibold text-emerald-800 mt-0.5">safari-dispatch-qwen3:4b</div>
          </div>
        </div>
      </section>

      {/* Section 1: Data Options to Input for Training */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              1. Training Data Options &amp; ChatML Input Format
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a data source below to inspect the exact records, JSON structure, and formatting rules required by QLoRA.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Format: ChatML JSONL (messages[])
          </div>
        </div>

        {/* Interactive Data Option Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-md">
          {TRAINING_DATA_OPTIONS.map((option) => {
            const active = selectedOption === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedOption(option.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelectedOption("custom_builder")}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              selectedOption === "custom_builder"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Option D · Build Custom Row
          </button>
        </div>

        {selectedOption !== "custom_builder" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 border-t border-slate-100 pt-4">
            <div className="lg:col-span-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{activeDataOption.label}</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{activeDataOption.purpose}</p>
              </div>

              <dl className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
                <div className="py-2 flex justify-between gap-3">
                  <dt className="text-slate-500">Recommended Volume</dt>
                  <dd className="font-mono font-medium text-slate-900 tabular-nums">
                    {activeDataOption.recommendedCount}
                  </dd>
                </div>
                <div className="py-2 flex flex-col gap-0.5">
                  <dt className="text-slate-500">Where Data Comes From</dt>
                  <dd className="font-mono text-slate-800">{activeDataOption.sourceLocation}</dd>
                </div>
                <div className="py-2 flex flex-col gap-0.5">
                  <dt className="text-slate-500">Expected Schema</dt>
                  <dd className="text-slate-700">{activeDataOption.inputFormatSummary}</dd>
                </div>
              </dl>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-800">Patterns Taught</div>
                <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">
                  {activeDataOption.fieldsCovered.map((f, idx) => (
                    <li key={idx}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-700">Sample Input (user role)</div>
                <pre className="p-3 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-xs whitespace-pre-wrap leading-relaxed">
                  {activeDataOption.sampleUserPrompt}
                </pre>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-700">Expected Target Output (assistant role)</div>
                <pre className="p-3 rounded-md bg-slate-900 text-slate-100 text-xs overflow-x-auto leading-relaxed">
                  {activeDataOption.sampleAssistantOutput}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 border-t border-slate-100 pt-4">
            <div className="lg:col-span-6 space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700" htmlFor="custom-sheng-msg">
                  Customer Inquiry Text (English / Swahili / Sheng)
                </label>
                <textarea
                  id="custom-sheng-msg"
                  rows={3}
                  value={customMsg}
                  onChange={(e) => setCustomMsg(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1" htmlFor="custom-circuit">
                    Target circuit_name
                  </label>
                  <select
                    id="custom-circuit"
                    value={customCircuit}
                    onChange={(e) => setCustomCircuit(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white text-slate-900"
                  >
                    {CIRCUIT_CHOICES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="(null — Follow-up Turn)">null (Follow-up Turn)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1" htmlFor="custom-residency">
                    Target residency_tier
                  </label>
                  <select
                    id="custom-residency"
                    value={customResidency}
                    onChange={(e) => setCustomResidency(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white text-slate-900"
                  >
                    {RESIDENCY_CHOICES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1" htmlFor="custom-date">
                    start_date (ISO YYYY-MM-DD)
                  </label>
                  <input
                    id="custom-date"
                    type="text"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1" htmlFor="custom-lang">
                    language
                  </label>
                  <select
                    id="custom-lang"
                    value={customLanguage}
                    onChange={(e) => setCustomLanguage(e.target.value as "en" | "sw" | "mixed")}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white text-slate-900"
                  >
                    <option value="mixed">mixed (EN + SW/Sheng)</option>
                    <option value="sw">sw (Swahili)</option>
                    <option value="en">en (English)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1" htmlFor="custom-adults">
                    adults · children · infants
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      id="custom-adults"
                      type="number"
                      min={0}
                      max={30}
                      value={customAdults}
                      onChange={(e) => setCustomAdults(Number(e.target.value) || 0)}
                      aria-label="Adults"
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono tabular-nums"
                    />
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={customChildren}
                      onChange={(e) => setCustomChildren(Number(e.target.value) || 0)}
                      aria-label="Children"
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono tabular-nums"
                    />
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={customInfants}
                      onChange={(e) => setCustomInfants(Number(e.target.value) || 0)}
                      aria-label="Infants under 5"
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1" htmlFor="custom-discount">
                    discount_pct (%)
                  </label>
                  <input
                    id="custom-discount"
                    type="number"
                    min={0}
                    max={50}
                    value={customDiscount}
                    onChange={(e) => setCustomDiscount(Number(e.target.value) || 0)}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Generated ChatML Training Line (append to train.jsonl)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy("custom-jsonl", customBuiltJsonl)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap shrink-0"
                >
                  {copiedKey === "custom-jsonl" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === "custom-jsonl" ? "Copied" : "Copy JSONL Line"}
                </button>
              </div>
              <pre className="p-3 rounded-md bg-slate-900 text-slate-100 text-xs overflow-x-auto max-h-64 leading-relaxed whitespace-pre-wrap break-all">
                {customBuiltJsonl}
              </pre>
            </div>
          </div>
        )}

        {/* Starter Curated Examples Table */}
        <div className="border-t border-slate-200 pt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-900">
              Included Starter Examples ({STARTER_DATASET_PAIRS.length} seed rows ready for download)
            </h3>
            <span className="text-xs text-slate-500">
              Combine these with 200+ production rows before training
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-medium">Task</th>
                  <th className="py-2 pr-3 font-medium">Dialect / Case</th>
                  <th className="py-2 pr-3 font-medium">Sample Inquiry</th>
                  <th className="py-2 font-medium">Why It Matters</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {STARTER_DATASET_PAIRS.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3 font-mono uppercase text-slate-700 whitespace-nowrap">
                      {row.task}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900 whitespace-nowrap">
                      {row.dialect}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700 max-w-md">{row.userMessage}</td>
                    <td className="py-2.5 text-slate-600">{row.whyIncluded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Section 2: End-to-End 6-Step Execution Guide with Scripts */}
      <section className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              2. Step-by-Step Training &amp; Deployment Scripts
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Steps 01–04 run on your temporary GPU machine; Steps 05–06 run back on your regular laptop with Ollama.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setViewMode("stepped")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                viewMode === "stepped" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              Step-by-Step View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("all")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                viewMode === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              All 6 Scripts
            </button>
          </div>
        </div>

        {viewMode === "stepped" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {TRAINING_STEPS.map((step) => {
                const active = step.id === activeStep.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStepId(step.id)}
                    className={`text-left rounded-md border p-3 transition-colors space-y-1 ${
                      active
                        ? "border-emerald-700 bg-emerald-50/60"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                      <span className={active ? "text-emerald-800 font-semibold" : ""}>{step.number}</span>
                      <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                    </div>
                    <div className="text-xs font-semibold text-slate-900 leading-snug">{step.title}</div>
                    <div className="text-xs text-slate-500 truncate">{step.filename}</div>
                  </button>
                );
              })}
            </div>

            <StepDetailSection step={activeStep} copiedKey={copiedKey} onCopy={handleCopy} />
          </div>
        ) : (
          <div className="space-y-4">
            {TRAINING_STEPS.map((step) => (
              <StepDetailSection
                key={step.id}
                step={step}
                copiedKey={copiedKey}
                onCopy={handleCopy}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
