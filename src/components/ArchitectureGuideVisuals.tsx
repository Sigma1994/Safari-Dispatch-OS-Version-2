import { useState } from "react";

const PIPELINE_STAGES = [
  {
    id: "intake",
    step: "Node 1",
    title: "Intake NLU",
    kind: "Neural (Qwen3-4B) + Heuristic Fallback",
    role: "Reads free-form English/Swahili text, masks invalid JSON tokens via SLOT_JSON_SCHEMA at T=0, merges prior_slots from thread_id, and detects missing required fields.",
    table: "Reads: workflow_checkpoints · Writes: audit_log",
  },
  {
    id: "specialist",
    step: "Node 2",
    title: "Deterministic Specialist",
    kind: "Symbolic (SQL + Bin-Packing)",
    role: "Resolves canonical Kenyan circuit, computes seasonal/residency conservation fees (KES & USD), applies 50% child lodge rates, and packs largest licensed vehicles first.",
    table: "Reads: circuits, fleet, guides, vehicle_allocations, booking_guides",
  },
  {
    id: "critic",
    step: "Node 3",
    title: "Policy Critic",
    kind: "Symbolic Guardrail",
    role: "Separates hard blockers (unknown park, >0 uncovered pax, guide shortfall) from soft policy triggers (>1 vehicle, >7.5h drive, >10% discount). Retries guide preference once if needed.",
    table: "Writes: audit_log",
  },
  {
    id: "hitl",
    step: "Node 4",
    title: "Checkpoint / Atomic Commit",
    kind: "ACID + Deferred Lock",
    role: "If soft rules trigger, pauses execution cleanly in workflow_checkpoints & pending_approvals WITHOUT locking vehicles (zero ghost holds). On confirmation, locks under SERIALIZABLE / BEGIN IMMEDIATE.",
    table: "Writes: bookings, vehicle_allocations, booking_guides, workflow_checkpoints",
  },
  {
    id: "nlg",
    step: "Node 5",
    title: "Grounded NLG + Verifier",
    kind: "Neural (T=0.2) + Anchor Guardrail",
    role: "Drafts warm EN/SW reply from verified GroundingContext JSON. verifyGroundedReply verifies exact Booking ID & USD total; swaps in verified deterministic template on any drift.",
    table: "Writes: audit_log, idempotency_records",
  },
] as const;

export function EndToEndPipelineVisual() {
  const [selectedStage, setSelectedStage] = useState<string>(PIPELINE_STAGES[0].id);
  const active = PIPELINE_STAGES.find((s) => s.id === selectedStage) ?? PIPELINE_STAGES[0];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Interactive Diagram: 5-Stage Neuro-Symbolic Dispatch Graph
          </h4>
          <p className="text-xs text-slate-500">
            Click any node below to inspect its AI/Backend boundary, inputs, and database tables.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-700 inline-block" />
            Neural (LLM Boundary)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 inline-block" />
            Symbolic (SQL / Rules)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-600 inline-block" />
            Human Interrupt
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 920 270"
          className="w-full min-w-[700px] h-auto select-none"
          role="img"
          aria-label="End-to-end 5-stage Neuro-Symbolic architecture diagram"
        >
          <defs>
            <marker id="arrow-slate" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
            </marker>
            <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
            </marker>
          </defs>

          {/* Main Spine Connectors */}
          <line x1="168" y1="88" x2="202" y2="88" stroke="#64748b" strokeWidth="1.75" markerEnd="url(#arrow-slate)" />
          <line x1="354" y1="88" x2="388" y2="88" stroke="#64748b" strokeWidth="1.75" markerEnd="url(#arrow-slate)" />
          <line x1="540" y1="88" x2="574" y2="88" stroke="#64748b" strokeWidth="1.75" markerEnd="url(#arrow-slate)" />
          <line x1="726" y1="88" x2="760" y2="88" stroke="#64748b" strokeWidth="1.75" markerEnd="url(#arrow-slate)" />

          {/* Bounded Retry Arc: Critic -> Specialist */}
          <path
            d="M 464 44 C 464 14, 278 14, 278 42"
            fill="none"
            stroke="#d97706"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            markerEnd="url(#arrow-amber)"
          />
          <text x="371" y="18" textAnchor="middle" className="fill-amber-700 text-[10px] font-medium">
            Retry ≤ 2 (Relax senior guide)
          </text>

          {/* Clarification Branch: Intake -> NLG */}
          <path
            d="M 92 134 L 92 224 L 836 224 L 836 136"
            fill="none"
            stroke="#64748b"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            markerEnd="url(#arrow-slate)"
          />
          <text x="464" y="216" textAnchor="middle" className="fill-slate-600 text-[10px] font-medium">
            Missing fields? Save checkpoint &amp; ask follow-up question
          </text>

          {/* HITL Sub-node below Node 4 */}
          <line x1="650" y1="134" x2="650" y2="162" stroke="#d97706" strokeWidth="1.5" markerEnd="url(#arrow-amber)" />
          <rect x="572" y="164" width="156" height="40" rx="6" fill="#fffbeb" stroke="#f59e0b" strokeWidth="1.25" />
          <text x="650" y="181" textAnchor="middle" className="fill-amber-900 text-[11px] font-semibold">
            HITL Queue (Paused)
          </text>
          <text x="650" y="195" textAnchor="middle" className="fill-amber-800 text-[9.5px]">
            Zero vehicles locked yet
          </text>

          {/* Stage Boxes */}
          {[
            { id: "intake", x: 16, label: "1. Intake NLU", sub: "Qwen3-4B / Regex", accent: "#047857", bg: "#ecfdf5" },
            { id: "specialist", x: 204, label: "2. Specialist SQL", sub: "Tariffs & Fleet", accent: "#1e293b", bg: "#f8fafc" },
            { id: "critic", x: 390, label: "3. Policy Critic", sub: "Hard vs. Soft", accent: "#1e293b", bg: "#f8fafc" },
            { id: "hitl", x: 576, label: "4. Atomic Lock", sub: "GiST / WAL Tx", accent: "#b45309", bg: "#fffbeb" },
            { id: "nlg", x: 762, label: "5. Grounded NLG", sub: "Draft + Verify", accent: "#047857", bg: "#ecfdf5" },
          ].map((box) => {
            const isActive = selectedStage === box.id;
            return (
              <g
                key={box.id}
                onClick={() => setSelectedStage(box.id)}
                className="cursor-pointer"
              >
                <rect
                  x={box.x}
                  y="44"
                  width="150"
                  height="88"
                  rx="8"
                  fill={box.bg}
                  stroke={isActive ? "#047857" : box.accent}
                  strokeWidth={isActive ? "2.5" : "1.25"}
                />
                <rect x={box.x} y="44" width="150" height="22" rx="8" fill={box.accent} />
                <rect x={box.x} y="58" width="150" height="8" fill={box.accent} />
                <text x={box.x + 75} y="59" textAnchor="middle" className="fill-white text-[10px] font-mono font-semibold">
                  {box.id === "intake" || box.id === "nlg" ? "AI BOUNDARY" : box.id === "hitl" ? "TRANSACTION" : "DETERMINISTIC"}
                </text>
                <text x={box.x + 75} y="90" textAnchor="middle" className="fill-slate-900 text-[12px] font-semibold">
                  {box.label}
                </text>
                <text x={box.x + 75} y="109" textAnchor="middle" className="fill-slate-600 text-[10.5px]">
                  {box.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Node Inspector */}
      <div className="rounded-md bg-slate-50 border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-semibold text-emerald-800">{active.step}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-slate-900">{active.title}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-500">{active.kind}</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">{active.role}</p>
        </div>
        <div className="text-xs font-mono text-slate-600 bg-white border border-slate-200 rounded px-3 py-2 shrink-0">
          {active.table}
        </div>
      </div>
    </div>
  );
}

export function ConstrainedDecodingVisual() {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">
          How Grammar-Constrained JSON Decoding Stops AI Formatting Errors
        </h4>
        <p className="text-xs text-slate-500">
          Instead of hoping the model writes clean JSON, Ollama masks invalid vocabulary logits to −∞ at every token step.
        </p>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox="0 0 880 185" className="w-full min-w-[680px] h-auto" role="img" aria-label="Constrained JSON decoding diagram">
          <defs>
            <marker id="arrow-dec" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
            </marker>
          </defs>

          {/* Step 1: Messy Input */}
          <rect x="10" y="24" width="200" height="132" rx="8" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="22" y="45" className="fill-slate-500 text-[10px] font-mono font-semibold">1. RAW CUSTOMER TEXT</text>
          <text x="22" y="68" className="fill-slate-800 text-[11px]">"Tunataka quote ya</text>
          <text x="22" y="84" className="fill-slate-800 text-[11px]">Maasai Mara Classic kwa</text>
          <text x="22" y="100" className="fill-slate-800 text-[11px]">10 people kuanzia</text>
          <text x="22" y="116" className="fill-slate-800 text-[11px]">2026-12-15 with 15%..."</text>
          <text x="22" y="142" className="fill-emerald-700 text-[10px] font-mono">BPE Tokens → Qwen3-4B</text>

          <line x1="212" y1="90" x2="244" y2="90" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow-dec)" />

          {/* Step 2: Logit Masking */}
          <rect x="248" y="24" width="290" height="132" rx="8" fill="#ecfdf5" stroke="#059669" />
          <text x="262" y="45" className="fill-emerald-800 text-[10px] font-mono font-semibold">2. SCHEMA LOGIT MASK (T = 0)</text>
          <text x="262" y="68" className="fill-slate-700 text-[11px] font-mono">Next field: "residency_tier":</text>
          <rect x="262" y="78" width="260" height="20" rx="4" fill="#ffffff" stroke="#a7f3d0" />
          <text x="270" y="92" className="fill-emerald-800 text-[10.5px] font-mono">ALLOWED: "ea_citizen" | "non_resident" | null</text>
          <rect x="262" y="104" width="260" height="20" rx="4" fill="#fef2f2" stroke="#fecaca" />
          <text x="270" y="118" className="fill-red-700 text-[10.5px] font-mono">MASKED (-∞): "tourist", "```json", prose</text>
          <text x="262" y="142" className="fill-slate-600 text-[10px]">Ollama GBNF grammar blocks invalid tokens</text>

          <line x1="540" y1="90" x2="572" y2="90" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow-dec)" />

          {/* Step 3: Clean Contract */}
          <rect x="576" y="24" width="294" height="132" rx="8" fill="#0f172a" stroke="#1e293b" />
          <text x="590" y="45" className="fill-emerald-400 text-[10px] font-mono font-semibold">3. TYPED InquirySlots JSON</text>
          <text x="590" y="66" className="fill-slate-200 text-[10.5px] font-mono">{"{"} "intent": "quote_request",</text>
          <text x="590" y="82" className="fill-slate-200 text-[10.5px] font-mono">  "language": "mixed",</text>
          <text x="590" y="98" className="fill-slate-200 text-[10.5px] font-mono">  "circuit_name": "Maasai Mara...",</text>
          <text x="590" y="114" className="fill-slate-200 text-[10.5px] font-mono">  "adults": 10, "discount_pct": 15 {"}"}</text>
          <text x="590" y="142" className="fill-amber-300 text-[10px] font-mono">Fallback if offline → heuristicExtract()</text>
        </svg>
      </div>
    </div>
  );
}

export function ConcurrencyToctouVisual() {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">
          Race Condition Defense: Why Deferred Locking + Database Exclusion Locks Never Double-Book
        </h4>
        <p className="text-xs text-slate-500">
          Comparing a naive booking app vs. Safari Dispatch OS when two coordinators try to book Land Cruiser LC-01 for the same dates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Naive App */}
        <div className="rounded-md border border-red-200 bg-red-50/50 p-4 space-y-2.5">
          <div className="text-xs font-semibold text-red-900">
            Naive App (TOCTOU Vulnerability)
          </div>
          <ol className="space-y-1.5 text-xs text-slate-700 font-mono">
            <li>10:00:00.100 Agent A: SELECT free → LC-01 OK</li>
            <li>10:00:00.120 Agent B: SELECT free → LC-01 OK</li>
            <li>10:00:00.250 Agent A: INSERT LC-01 (Booked!)</li>
            <li className="text-red-700 font-semibold">10:00:00.270 Agent B: INSERT LC-01 (Double-booked!)</li>
          </ol>
          <p className="text-xs text-red-800">
            And if Agent A waited 3 hours for discount approval, locking LC-01 up front would also block paying guests (ghost hold).
          </p>
        </div>

        {/* Safari Dispatch OS */}
        <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-4 space-y-2.5">
          <div className="text-xs font-semibold text-emerald-900">
            Safari Dispatch OS (SERIALIZABLE + btree_gist / WAL Lock)
          </div>
          <ol className="space-y-1.5 text-xs text-slate-700 font-mono">
            <li>10:00:00.100 Agent A (15% disc): Checkpoint paused (0 locks)</li>
            <li>10:00:00.120 Agent B (0% disc): Write Tx acquires lock</li>
            <li>10:00:00.140 Agent B: Re-checks &amp; commits LC-01</li>
            <li className="text-emerald-800 font-semibold">10:05:00.000 Mgr approves A → 23P01 / HTTP 409 Conflict!</li>
          </ol>
          <p className="text-xs text-emerald-900">
            Pending approvals never freeze fleet inventory, and concurrent commits hit database exclusion locks inside the write transaction.
          </p>
        </div>
      </div>
    </div>
  );
}

export function QloraMatrixVisual() {
  const [mode, setMode] = useState<"inference" | "qlora" | "full">("qlora");

  const specs = {
    inference: {
      title: "Default Local Inference (Qwen3-4B Q4_K_M GGUF)",
      vram: "~3.0 GB RAM / VRAM",
      trainable: "0% (Frozen Inference)",
      hardware: "Standard office laptop CPU or 4 GB GPU",
      note: "What runs today via Ollama (`ollama pull qwen3:4b && ollama serve`). Zero training GPU needed.",
    },
    qlora: {
      title: "Optional QLoRA Fine-Tuning (Rank r = 16, α = 32)",
      vram: "~10–14 GB VRAM",
      trainable: "~1.4% of weights (Adapters A & B only)",
      hardware: "Single RTX 3060/4060 Ti 16GB or T4/L4 cloud GPU",
      note: "Base matrix W₀ stays frozen in 4-bit NF4 while tiny low-rank adapters learn Nairobi Sheng idioms.",
    },
    full: {
      title: "Traditional Full Fine-Tuning (FP16 AdamW)",
      vram: "~64+ GB VRAM",
      trainable: "100% of all 4B parameters",
      hardware: "Multi-GPU A100/H100 server cluster",
      note: "Overkill and risks catastrophic forgetting of English/Swahili structure; avoided via QLoRA.",
    },
  }[mode];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            How QLoRA Adapts a 4-Billion-Parameter Model on a Single GPU
          </h4>
          <p className="text-xs text-slate-500">
            Toggle modes below to compare runtime memory and trainable weight percentages.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md text-xs">
          {(
            [
              { id: "inference", label: "Local Ollama (Default)" },
              { id: "qlora", label: "QLoRA r=16 (Optional)" },
              { id: "full", label: "Full FP16 Fine-Tune" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                mode === tab.id ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div className="lg:col-span-7 overflow-x-auto">
          <svg viewBox="0 0 540 165" className="w-full min-w-[440px] h-auto" role="img" aria-label="LoRA low-rank matrix decomposition diagram">
            <defs>
              <marker id="arrow-lora" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
              </marker>
            </defs>

            {/* Input x */}
            <rect x="10" y="64" width="54" height="36" rx="6" fill="#f8fafc" stroke="#94a3b8" />
            <text x="37" y="86" textAnchor="middle" className="fill-slate-900 text-[12px] font-mono font-semibold">x</text>

            {/* Branch lines */}
            <path d="M 64 76 L 108 42" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow-lora)" />
            <path d="M 64 88 L 108 122" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-lora)" />

            {/* Frozen Base W0 */}
            <rect x="112" y="14" width="160" height="54" rx="6" fill="#f1f5f9" stroke="#64748b" />
            <text x="192" y="37" textAnchor="middle" className="fill-slate-900 text-[11.5px] font-semibold">
              Frozen Base W₀ (4-bit NF4)
            </text>
            <text x="192" y="54" textAnchor="middle" className="fill-slate-600 text-[10px] font-mono">
              4B params · No gradients
            </text>

            {/* Trainable Adapters A and B */}
            <rect x="112" y="96" width="72" height="52" rx="6" fill="#ecfdf5" stroke="#059669" strokeWidth="1.5" />
            <text x="148" y="119" textAnchor="middle" className="fill-emerald-900 text-[11px] font-mono font-semibold">A (d×16)</text>
            <text x="148" y="135" textAnchor="middle" className="fill-emerald-700 text-[9.5px]">Trainable</text>

            <line x1="184" y1="122" x2="202" y2="122" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-lora)" />

            <rect x="206" y="96" width="72" height="52" rx="6" fill="#ecfdf5" stroke="#059669" strokeWidth="1.5" />
            <text x="242" y="119" textAnchor="middle" className="fill-emerald-900 text-[11px] font-mono font-semibold">B (16×k)</text>
            <text x="242" y="135" textAnchor="middle" className="fill-emerald-700 text-[9.5px]">× (α / r)</text>

            {/* Sum (+) */}
            <path d="M 272 41 L 340 76" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow-lora)" />
            <path d="M 278 122 L 340 88" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-lora)" />

            <circle cx="358" cy="82" r="16" fill="#ffffff" stroke="#0f172a" strokeWidth="1.5" />
            <text x="358" y="86" textAnchor="middle" className="fill-slate-900 text-[14px] font-mono font-bold">+</text>

            <line x1="374" y1="82" x2="404" y2="82" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow-lora)" />

            {/* Output GGUF */}
            <rect x="408" y="50" width="122" height="64" rx="6" fill="#0f172a" />
            <text x="469" y="76" textAnchor="middle" className="fill-white text-[11px] font-semibold">Merged GGUF</text>
            <text x="469" y="94" textAnchor="middle" className="fill-emerald-400 text-[10px] font-mono">Q4_K_M → Ollama</text>
          </svg>
        </div>

        <dl className="lg:col-span-5 divide-y divide-slate-100 border border-slate-200 rounded-md p-3.5 bg-slate-50 text-xs">
          <div className="pb-2">
            <dt className="text-slate-500">Configuration</dt>
            <dd className="font-semibold text-slate-900 mt-0.5">{specs.title}</dd>
          </div>
          <div className="py-2 flex justify-between gap-2">
            <dt className="text-slate-500">Memory Needed</dt>
            <dd className="font-mono font-semibold text-emerald-800 tabular-nums">{specs.vram}</dd>
          </div>
          <div className="py-2 flex justify-between gap-2">
            <dt className="text-slate-500">Updated Weights</dt>
            <dd className="font-mono text-slate-800 tabular-nums">{specs.trainable}</dd>
          </div>
          <div className="py-2">
            <dt className="text-slate-500">Hardware Target</dt>
            <dd className="text-slate-800 mt-0.5">{specs.hardware}</dd>
          </div>
          <div className="pt-2 text-slate-600 leading-relaxed">{specs.note}</div>
        </dl>
      </div>
    </div>
  );
}
