import { DEFAULT_CHECKPOINT_DB_PATH, DEFAULT_DB_PATH, getDbStatus, logAudit, readConn, writeTx } from "./db.ts";
import {
  extractInquirySlots,
  mergeSlots,
  NLG_SYSTEM_PROMPT,
  SLOT_JSON_SCHEMA,
  synthesizeGroundedReply,
  useDeterministicLlm,
} from "./nlu.ts";
import { buildSafariQuote, isQuoteSuccess, persistBookingTransaction, validateIsoDate } from "./pricing.ts";
import type {
  AiTrace,
  AiTraceStep,
  CritiqueResult,
  DispatchState,
  InquirySlots,
  NluMode,
  QuoteResult,
  WorkflowResponse,
} from "./types.ts";

const MAX_RETRIES = 2;

function getMaxAutoDiscount(): number {
  const raw = Number(process.env.MAX_AUTO_DISCOUNT_PCT ?? "10.0");
  return Number.isFinite(raw) ? raw : 10.0;
}

function getMaxDriveHours(): number {
  const raw = Number(process.env.MAX_DAILY_DRIVE_HOURS_SAFE ?? "7.5");
  return Number.isFinite(raw) ? raw : 7.5;
}

async function loadCheckpoint(
  threadId: string,
  checkpointDbPath: string
): Promise<{ state: DispatchState; paused: boolean } | null> {
  return readConn(async (conn) => {
    const row = await conn.get<{ state_json: string; paused: number }>(
      "SELECT state_json, paused FROM workflow_checkpoints WHERE thread_id = ?",
      threadId
    );
    if (!row) return null;
    return {
      state: JSON.parse(row.state_json) as DispatchState,
      paused: Boolean(row.paused),
    };
  }, checkpointDbPath);
}

async function saveCheckpoint(
  threadId: string,
  state: DispatchState,
  paused: boolean,
  interruptPayload: Record<string, unknown> | null,
  checkpointDbPath: string
): Promise<void> {
  await writeTx(async (conn) => {
    await conn.run(
      `
      INSERT INTO workflow_checkpoints (thread_id, state_json, paused, interrupt_json, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (thread_id) DO UPDATE SET
        state_json = excluded.state_json,
        paused = excluded.paused,
        interrupt_json = excluded.interrupt_json,
        updated_at = CURRENT_TIMESTAMP
      `,
      threadId,
      JSON.stringify(state),
      paused ? 1 : 0,
      interruptPayload ? JSON.stringify(interruptPayload) : null
    );
  }, checkpointDbPath);
}

export async function intakeNode(
  state: DispatchState,
  options?: { dbPath?: string; nluMode?: NluMode; customerName?: string | null }
): Promise<Partial<DispatchState>> {
  const dbPath = options?.dbPath ?? DEFAULT_DB_PATH;
  const { slots: parsed, extractionSource, fallbackError, durationMs, promptPreview } =
    await extractInquirySlots(state.user_message, options?.nluMode);

  const slots = mergeSlots(state.prior_slots, parsed);
  if (options?.customerName && options.customerName.trim()) {
    slots.customer_name = options.customerName.trim();
  }

  const missing: string[] = [];
  if (!slots.circuit_name) {
    missing.push("circuit_name");
  }
  if (slots.adults === null || Number(slots.adults) <= 0) {
    missing.push("adults");
  }
  try {
    validateIsoDate(String(slots.start_date ?? ""));
  } catch {
    missing.push("valid_start_date_YYYY_MM_DD");
  }

  slots.missing_fields = missing;
  slots.intent = missing.length > 0 ? "clarification_needed" : "quote_request";
  slots.extraction_source = extractionSource;
  if (fallbackError) {
    slots.fallback_error = fallbackError;
  }

  const nluTrace: AiTraceStep = {
    id: "nlu_intake",
    title: "1. Unstructured NLU Extraction",
    engine: extractionSource,
    status: fallbackError ? "fallback" : "completed",
    duration_ms: durationMs,
    summary:
      missing.length > 0
        ? `Extracted partial slots (${slots.language.toUpperCase()}); flagged missing: ${missing.join(", ")}.`
        : `Parsed ${slots.language.toUpperCase()} request into structured JSON schema (${slots.circuit_name}, ${slots.adults} adults, ${slots.start_date}).`,
    prompt_preview: `${promptPreview}\n\nEnforced JSON Schema:\n${JSON.stringify(SLOT_JSON_SCHEMA, null, 2)}`,
    input_payload: {
      user_message: state.user_message,
      had_prior_turn_slots: Boolean(state.prior_slots),
    },
    output_payload: {
      raw_extracted_slots: parsed,
      merged_slots: slots,
    },
    note: fallbackError
      ? `Local LLM unreachable (${fallbackError}) — automatically degraded to deterministic regex/lexicon extractor.`
      : extractionSource.startsWith("ollama:")
      ? "Executed via Local Ollama /api/chat with strict JSON Schema output (temperature: 0)."
      : "Executed via deterministic English/Swahili slot extractor.",
  };

  await logAudit(state.thread_id, "intake", slots.intent, slots, dbPath);
  return { slots, retry_count: 0, nlu_trace: nluTrace };
}

export async function clarificationNode(
  state: DispatchState,
  options?: { dbPath?: string; nluMode?: NluMode }
): Promise<Partial<DispatchState>> {
  const dbPath = options?.dbPath ?? DEFAULT_DB_PATH;
  const slots = state.slots;
  const missing = slots?.missing_fields ?? ["circuit_name", "adults"];
  const lang = slots?.language ?? "en";
  const friendlyMap: Record<string, string> = {
    circuit_name: "safari park or circuit",
    adults: "number of adult guests",
    valid_start_date_YYYY_MM_DD: "travel start date (YYYY-MM-DD)",
  };
  const labels = missing.map((m) => friendlyMap[m] ?? m.replaceAll("_", " "));
  const fallbackTemplate =
    lang === "sw"
      ? `Tafadhali taja maelezo haya ili tuandae nukuu kamili ya safari: ${labels.join(", ")}.`
      : `Please add a few missing details to complete your quote: ${labels.join(", ")}.`;

  const nlg = await synthesizeGroundedReply(
    {
      status: "clarification_needed",
      customer_name: slots?.customer_name ?? null,
      language: lang,
      original_message: state.user_message,
      fallback_template: fallbackTemplate,
      circuit_name: slots?.circuit_name ?? null,
      missing_fields: labels,
    },
    options?.nluMode
  );

  const nlgTrace: AiTraceStep = {
    id: "nlg_response",
    title: "5. Grounded LLM Response Synthesis",
    engine: nlg.responseSource,
    status: nlg.fallbackError ? "fallback" : "completed",
    duration_ms: nlg.durationMs,
    summary: `Generated ${lang.toUpperCase()} follow-up prompt requesting: ${labels.join(", ")}.`,
    prompt_preview: nlg.promptPreview || NLG_SYSTEM_PROMPT,
    input_payload: { missing_fields: labels, language: lang },
    output_payload: { final_response: nlg.text, grounding_check: nlg.groundingCheck },
    note: nlg.fallbackError
      ? `LLM synthesis fallback (${nlg.fallbackError}); used verified template.`
      : nlg.groundingCheck,
  };

  await logAudit(state.thread_id, "clarification", "clarification_needed", { text: nlg.text, missing, source: nlg.responseSource }, dbPath);
  return { outcome_status: "clarification_needed", final_response: nlg.text, nlg_trace: nlgTrace };
}

export async function specialistNode(
  state: DispatchState,
  dbPath: string = DEFAULT_DB_PATH
): Promise<Partial<DispatchState>> {
  const slots: InquirySlots = { ...(state.slots as InquirySlots) };
  const critique = state.critique;
  let retryCount = Number(state.retry_count ?? 0);

  if (critique && critique.hard_failures.length > 0) {
    retryCount += 1;
    const failuresText = critique.hard_failures.join(" ").toLowerCase();
    if (failuresText.includes("safari guides") && slots.prefer_senior_guide) {
      // Safe fallback: relax senior-only guide preference to include standard guides
      slots.prefer_senior_guide = false;
    }
  }

  const quote: QuoteResult = await buildSafariQuote({
    circuitQuery: slots.circuit_name ?? "",
    adults: Number(slots.adults ?? 0),
    children: Number(slots.children ?? 0),
    infantsUnder5: Number(slots.infants_under_5 ?? 0),
    residencyTier: slots.residency_tier ?? "non_resident",
    startDate: slots.start_date ?? "2026-12-15",
    preferSeniorGuide: Boolean(slots.prefer_senior_guide),
    discountPct: Number(slots.discount_pct ?? 0),
    dbPath,
  });

  await logAudit(state.thread_id, "specialist", `attempt_${retryCount}`, { slots, quote }, dbPath);
  return { slots, quote, retry_count: retryCount };
}

export async function criticNode(
  state: DispatchState,
  dbPath: string = DEFAULT_DB_PATH
): Promise<Partial<DispatchState>> {
  const quote = state.quote;
  const hardFailures: string[] = [];
  const softReasons: string[] = [];

  if (!quote || "error" in quote) {
    hardFailures.push(quote && "error" in quote ? quote.error : "Quote calculation failed.");
  } else {
    if (quote.uncovered_pax > 0) {
      hardFailures.push(
        `Insufficient available fleet capacity: ${quote.uncovered_pax} guest(s) could not be seated.`
      );
    }
    if (quote.guides_shortfall > 0) {
      hardFailures.push(
        `Insufficient available safari guides: need ${quote.guides_required}, found ${quote.assigned_guides.length}.`
      );
    }
  }

  let multiVehicle = false;
  if (isQuoteSuccess(quote)) {
    multiVehicle = quote.assigned_vehicles.length > 1;
    if (multiVehicle) {
      softReasons.push(
        `Multi-vehicle dispatch (${quote.assigned_vehicles.length} vehicles: ${quote.vehicle_codes.join(", ")}) requires supervisor sign-off.`
      );
    }
    const driveHrs = Number(quote.circuit.max_daily_drive_hours ?? 0);
    if (driveHrs > getMaxDriveHours()) {
      softReasons.push(
        `Daily drive hours (${driveHrs}h) exceed ${getMaxDriveHours()}h standard comfort limit.`
      );
    }
    const discount = Number(quote.discount_pct ?? 0);
    if (discount > getMaxAutoDiscount()) {
      softReasons.push(
        `Discount (${discount}%) exceeds ${getMaxAutoDiscount()}% auto-approval ceiling.`
      );
    }
  }

  const requiresHuman = hardFailures.length === 0 && softReasons.length > 0;
  const approved = hardFailures.length === 0 && softReasons.length === 0;
  const reasons = [...hardFailures, ...softReasons];

  const critique: CritiqueResult = {
    approved,
    requires_human_approval: requiresHuman,
    hard_failures: hardFailures,
    reasons,
    multi_vehicle_used: multiVehicle,
  };

  await logAudit(state.thread_id, "critic", `approved=${approved}`, critique, dbPath);
  return { critique };
}

export async function finalizerNode(
  state: DispatchState,
  options?: { dbPath?: string; nluMode?: NluMode }
): Promise<Partial<DispatchState>> {
  const dbPath = options?.dbPath ?? DEFAULT_DB_PATH;
  const quote = state.quote;
  const critique = state.critique;
  const humanApproved = state.human_approved;
  const threadId = state.thread_id;
  const hardFailures = critique?.hard_failures ?? [];

  let status: "confirmed" | "held" | "rejected" = "rejected";
  let fallbackTemplate = "";
  let bookingId: number | null = null;

  if (!quote || "error" in quote) {
    status = "rejected";
    fallbackTemplate = `Quote rejected: ${quote && "error" in quote ? quote.error : "Invalid quote."}`;
  } else if (hardFailures.length > 0) {
    status = "rejected";
    fallbackTemplate = `Quote rejected: ${hardFailures.join("; ")}`;
  } else if (critique?.requires_human_approval && humanApproved === false) {
    status = "held";
    fallbackTemplate = "Quote placed on hold — manager declined the policy or discount exception.";
    await persistBookingTransaction({
      threadId,
      quote,
      status: "held",
      customerName: state.slots?.customer_name ?? null,
      idempotencyKey: state.idempotency_key,
      dbPath,
    });
  } else if (
    !critique?.approved &&
    !(critique?.requires_human_approval && humanApproved === true)
  ) {
    status = "rejected";
    fallbackTemplate = `Quote could not be confirmed: ${(critique?.reasons ?? ["policy check failed"]).join("; ")}`;
  } else {
    status = "confirmed";
    bookingId = await persistBookingTransaction({
      threadId,
      quote,
      status: "confirmed",
      customerName: state.slots?.customer_name ?? null,
      idempotencyKey: state.idempotency_key,
      dbPath,
    });
    const c = quote.circuit;
    const guidesStr = quote.assigned_guides.map((g) => g.name).join(", ") || "Unassigned";
    const vehiclesStr = quote.vehicle_codes.join(", ") || "None";
    fallbackTemplate =
      `Confirmed Booking #${bookingId} — ${c.name} (${c.days} days, ${quote.start_date} to ${quote.end_date}, ` +
      `${quote.total_pax} ${quote.total_pax === 1 ? "guest" : "guests"}) · ` +
      `Vehicles: ${vehiclesStr} · Guides: ${guidesStr} · ` +
      `Total: $${quote.quoted_total_usd.toFixed(2)} (KES ${quote.quoted_total_kes.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}).`;
  }

  const qOk = isQuoteSuccess(quote);
  const nlg = await synthesizeGroundedReply(
    {
      status,
      customer_name: state.slots?.customer_name ?? null,
      language: state.slots?.language ?? "en",
      original_message: state.user_message,
      fallback_template: fallbackTemplate,
      booking_id: bookingId,
      circuit_name: qOk ? quote.circuit.name : state.slots?.circuit_name ?? null,
      start_date: qOk ? quote.start_date : null,
      end_date: qOk ? quote.end_date : null,
      days: qOk ? quote.days : null,
      total_pax: qOk ? quote.total_pax : null,
      vehicle_codes: qOk ? quote.vehicle_codes : [],
      guide_names: qOk ? quote.assigned_guides.map((g) => g.name) : [],
      quoted_total_usd: qOk ? quote.quoted_total_usd : null,
      quoted_total_kes: qOk ? quote.quoted_total_kes : null,
      reasons: critique?.reasons ?? [],
    },
    options?.nluMode
  );

  const nlgTrace: AiTraceStep = {
    id: "nlg_response",
    title: "5. Grounded LLM Response Synthesis",
    engine: nlg.responseSource,
    status: nlg.fallbackError ? "fallback" : status === "rejected" ? "blocked" : "completed",
    duration_ms: nlg.durationMs,
    summary:
      status === "confirmed"
        ? `Drafted grounded confirmation for Booking #${bookingId} ($${qOk ? quote.quoted_total_usd.toFixed(2) : "0.00"}).`
        : status === "held"
        ? "Generated hold notification after manager declined exception."
        : "Generated grounded explanation of booking constraint.",
    prompt_preview: nlg.promptPreview || NLG_SYSTEM_PROMPT,
    input_payload: {
      status,
      booking_id: bookingId,
      circuit_name: qOk ? quote.circuit.name : null,
      quoted_total_usd: qOk ? quote.quoted_total_usd : null,
      quoted_total_kes: qOk ? quote.quoted_total_kes : null,
      reasons: critique?.reasons ?? [],
    },
    output_payload: {
      final_response: nlg.text,
      deterministic_fallback: fallbackTemplate,
      grounding_check: nlg.groundingCheck,
    },
    note: nlg.fallbackError
      ? `LLM synthesis fallback (${nlg.fallbackError}); verified template used.`
      : nlg.groundingCheck,
  };

  await logAudit(threadId, "finalizer", status, { final_response: nlg.text, response_source: nlg.responseSource }, dbPath);
  return { outcome_status: status, final_response: nlg.text, nlg_trace: nlgTrace };
}

function buildToolTrace(
  quote: QuoteResult | null,
  durationMs: number,
  retryCount: number,
  dbEngine: "postgres" | "sqlite"
): AiTraceStep {
  const toolEngine = dbEngine === "postgres" ? "postgresql + deterministic_pricing_ts" : "sqlite + deterministic_pricing_ts";
  const dbName = dbEngine === "postgres" ? "PostgreSQL" : "SQLite";
  if (!quote || "error" in quote) {
    return {
      id: "tool_pricing",
      title: "2. Grounded Pricing & Fleet Tools",
      engine: toolEngine,
      status: "blocked",
      duration_ms: durationMs,
      summary: quote && "error" in quote ? quote.error : "Circuit lookup failed.",
      output_payload: quote ? { error: quote.error, available_circuits: quote.available_circuits } : undefined,
      note: "Tool execution halted before quoting; LLM cannot invent unsupported parks or rates.",
    };
  }
  return {
    id: "tool_pricing",
    title: "2. Grounded Pricing & Fleet Tools",
    engine: toolEngine,
    status: retryCount > 0 ? "retried" : "completed",
    duration_ms: durationMs,
    summary: `Computed ${quote.season} season rates for ${quote.total_pax} guests: ${quote.vehicle_codes.join(", ") || "0 vehicles"} · $${quote.quoted_total_usd.toFixed(2)} (KES ${quote.quoted_total_kes.toLocaleString("en-US", { minimumFractionDigits: 2 })}).`,
    input_payload: {
      circuit: quote.circuit.name,
      start_date: quote.start_date,
      adults: quote.adults,
      children: quote.children,
      infants_under_5: quote.infants_under_5,
      residency_tier: quote.residency_tier,
      discount_pct: quote.discount_pct,
    },
    output_payload: {
      season: quote.season,
      assigned_vehicles: quote.vehicle_codes,
      assigned_guides: quote.assigned_guides.map((g) => g.name),
      breakdown_usd: quote.breakdown_usd,
      quoted_total_usd: quote.quoted_total_usd,
      quoted_total_kes: quote.quoted_total_kes,
      uncovered_pax: quote.uncovered_pax,
      guides_shortfall: quote.guides_shortfall,
    },
    note: `All park tariffs, lodge nights, vehicle seats, and guide schedules queried deterministically from ${dbName}.`,
  };
}

function buildCriticTrace(critique: CritiqueResult, durationMs: number): AiTraceStep {
  const verdict = critique.hard_failures.length > 0
    ? "hard_reject"
    : critique.requires_human_approval
    ? "hitl_interrupt"
    : "auto_approve";
  return {
    id: "policy_critic",
    title: "3. Deterministic Policy Critic",
    engine: "policy_guardrail_engine",
    status: critique.hard_failures.length > 0 ? "blocked" : critique.requires_human_approval ? "paused" : "completed",
    duration_ms: durationMs,
    summary:
      verdict === "auto_approve"
        ? "All capacity, guide, drive-hour, and discount rules passed."
        : verdict === "hitl_interrupt"
        ? `Flagged ${critique.reasons.length} policy exception(s) for human manager sign-off.`
        : `Blocked by ${critique.hard_failures.length} hard operational constraint(s).`,
    output_payload: {
      verdict,
      approved: critique.approved,
      requires_human_approval: critique.requires_human_approval,
      hard_failures: critique.hard_failures,
      reasons: critique.reasons,
    },
    note: "Separates hard operational blockers (cannot book) from soft policy exceptions (routed to HITL queue).",
  };
}

export async function runInquiryWorkflow(params: {
  threadId: string;
  message: string;
  customerName?: string | null;
  idempotencyKey?: string | null;
  nluMode?: NluMode;
  dbPath?: string;
  checkpointDbPath?: string;
}): Promise<WorkflowResponse> {
  const {
    threadId,
    message,
    customerName = null,
    idempotencyKey = null,
    nluMode,
    dbPath = DEFAULT_DB_PATH,
    checkpointDbPath = DEFAULT_CHECKPOINT_DB_PATH,
  } = params;

  const effectiveMode: NluMode = nluMode ?? (useDeterministicLlm() ? "deterministic" : "ollama");
  const dbEngine: "postgres" | "sqlite" =
    dbPath === DEFAULT_DB_PATH ? (await getDbStatus()).active_engine : "sqlite";
  const workflowStart = performance.now();

  const priorCheckpoint = await loadCheckpoint(threadId, checkpointDbPath);
  let state: DispatchState = {
    thread_id: threadId,
    idempotency_key: idempotencyKey,
    user_message: message,
    prior_slots: priorCheckpoint?.state.slots ?? null,
    slots: null,
    quote: null,
    critique: null,
    retry_count: 0,
    human_approved: null,
    reviewer: null,
    outcome_status: "processing",
    final_response: "",
  };

  Object.assign(state, await intakeNode(state, { dbPath, nluMode: effectiveMode, customerName }));
  const steps: AiTraceStep[] = [];
  if (state.nlu_trace) steps.push(state.nlu_trace);

  if (state.slots?.intent === "clarification_needed" || (state.slots?.missing_fields?.length ?? 0) > 0) {
    steps.push({
      id: "tool_pricing",
      title: "2. Grounded Pricing & Fleet Tools",
      engine: "skipped_pending_slots",
      status: "paused",
      duration_ms: 0,
      summary: "Skipped tool pricing until missing required fields are provided.",
    });
    steps.push({
      id: "policy_critic",
      title: "3. Deterministic Policy Critic",
      engine: "skipped_pending_slots",
      status: "paused",
      duration_ms: 0,
      summary: "Waiting for complete trip parameters before policy review.",
    });
    steps.push({
      id: "state_checkpoint",
      title: "4. Conversation State Checkpoint",
      engine: dbEngine === "postgres" ? "postgres_checkpoint_store" : "sqlite_checkpoint_store",
      status: "paused",
      duration_ms: 0.4,
      summary: `Saved partial slots under Ref ${threadId} for multi-turn follow-up.`,
      output_payload: { saved_slots: state.slots },
    });

    Object.assign(state, await clarificationNode(state, { dbPath, nluMode: effectiveMode }));
    if (state.nlg_trace) steps.push(state.nlg_trace);

    const aiTrace: AiTrace = {
      architecture_pattern:
        "Neuro-Symbolic Tool-Grounded Agent (LLM NLU -> Deterministic SQL Tools -> Policy Critic -> HITL Checkpoint -> Grounded LLM NLG)",
      requested_engine: effectiveMode,
      effective_nlu_engine: state.nlu_trace?.engine ?? effectiveMode,
      effective_nlg_engine: state.nlg_trace?.engine ?? "deterministic_template",
      total_duration_ms: Math.round((performance.now() - workflowStart) * 100) / 100,
      steps,
    };
    state.ai_trace = aiTrace;
    await saveCheckpoint(threadId, state, false, null, checkpointDbPath);

    return {
      thread_id: threadId,
      paused_for_approval: false,
      status: state.outcome_status,
      final_response: state.final_response,
      slots: state.slots,
      quote: state.quote,
      critique: state.critique,
      interrupt: null,
      idempotent_replay: false,
      ai_trace: aiTrace,
    };
  }

  // Specialist -> Critic loop (only retries safe senior-guide relaxation)
  let toolMs = 0;
  let criticMs = 0;
  while (true) {
    const t0 = performance.now();
    Object.assign(state, await specialistNode(state, dbPath));
    toolMs += performance.now() - t0;

    const c0 = performance.now();
    Object.assign(state, await criticNode(state, dbPath));
    criticMs += performance.now() - c0;

    const critique = state.critique!;
    const failuresText = critique.hard_failures.join(" ").toLowerCase();
    const canRelaxSenior =
      critique.hard_failures.length > 0 &&
      failuresText.includes("safari guides") &&
      Boolean(state.slots?.prefer_senior_guide) &&
      state.retry_count < MAX_RETRIES;

    if (!canRelaxSenior) break;
  }

  steps.push(buildToolTrace(state.quote, Math.round(toolMs * 100) / 100, state.retry_count, dbEngine));
  steps.push(buildCriticTrace(state.critique!, Math.round(criticMs * 100) / 100));

  const critique = state.critique!;
  if (critique.hard_failures.length === 0 && critique.requires_human_approval) {
    const quote = state.quote;
    const interruptPayload: Record<string, unknown> = isQuoteSuccess(quote)
      ? {
          thread_id: threadId,
          circuit: quote.circuit.name,
          dates: `${quote.start_date} to ${quote.end_date}`,
          total_pax: quote.total_pax,
          residency_tier: quote.residency_tier,
          vehicle_codes: quote.vehicle_codes,
          guide_names: quote.assigned_guides.map((g) => g.name),
          quoted_total_usd: quote.quoted_total_usd,
          quoted_total_kes: quote.quoted_total_kes,
          reasons: critique.reasons,
        }
      : { thread_id: threadId, reasons: critique.reasons };

    const qOk = isQuoteSuccess(quote);
    const fallbackPending = "Waiting for manager approval before confirming this booking.";
    const nlg = await synthesizeGroundedReply(
      {
        status: "awaiting_approval",
        customer_name: state.slots?.customer_name ?? null,
        language: state.slots?.language ?? "en",
        original_message: message,
        fallback_template: fallbackPending,
        circuit_name: qOk ? quote.circuit.name : null,
        start_date: qOk ? quote.start_date : null,
        end_date: qOk ? quote.end_date : null,
        days: qOk ? quote.days : null,
        total_pax: qOk ? quote.total_pax : null,
        vehicle_codes: qOk ? quote.vehicle_codes : [],
        guide_names: qOk ? quote.assigned_guides.map((g) => g.name) : [],
        quoted_total_usd: qOk ? quote.quoted_total_usd : null,
        quoted_total_kes: qOk ? quote.quoted_total_kes : null,
        reasons: critique.reasons,
      },
      effectiveMode
    );

    steps.push({
      id: "state_checkpoint",
      title: "4. HITL Checkpoint / Atomic DB",
      engine: "sqlite_hitl_interrupt",
      status: "paused",
      duration_ms: 0.8,
      summary: "Paused execution in workflow_checkpoints & queued manager approval (no vehicles locked yet).",
      output_payload: interruptPayload,
      note: "Vehicles/guides are intentionally NOT locked until human approval to prevent ghost holds.",
    });
    steps.push({
      id: "nlg_response",
      title: "5. Grounded LLM Response Synthesis",
      engine: nlg.responseSource,
      status: nlg.fallbackError ? "fallback" : "paused",
      duration_ms: nlg.durationMs,
      summary: "Drafted customer-ready status noting pending manager review.",
      prompt_preview: nlg.promptPreview || NLG_SYSTEM_PROMPT,
      input_payload: interruptPayload,
      output_payload: { final_response: nlg.text, grounding_check: nlg.groundingCheck },
      note: nlg.fallbackError ? `LLM synthesis fallback (${nlg.fallbackError})` : nlg.groundingCheck,
    });

    const aiTrace: AiTrace = {
      architecture_pattern:
        "Neuro-Symbolic Tool-Grounded Agent (LLM NLU -> Deterministic SQLite Tools -> Policy Critic -> HITL Checkpoint -> Grounded LLM NLG)",
      requested_engine: effectiveMode,
      effective_nlu_engine: state.nlu_trace?.engine ?? effectiveMode,
      effective_nlg_engine: nlg.responseSource,
      total_duration_ms: Math.round((performance.now() - workflowStart) * 100) / 100,
      steps,
    };

    state.outcome_status = "awaiting_approval";
    state.final_response = nlg.text;
    state.ai_trace = aiTrace;
    await saveCheckpoint(threadId, state, true, interruptPayload, checkpointDbPath);

    await writeTx(async (conn) => {
      await conn.run(
        `
        INSERT INTO pending_approvals (
            thread_id, idempotency_key, user_message, slots_json, quote_json, critique_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
        ON CONFLICT (thread_id) DO UPDATE SET
            idempotency_key = excluded.idempotency_key,
            user_message = excluded.user_message,
            slots_json = excluded.slots_json,
            quote_json = excluded.quote_json,
            critique_json = excluded.critique_json,
            status = 'pending'
        `,
        threadId,
        idempotencyKey,
        message,
        JSON.stringify(state.slots ?? {}),
        JSON.stringify(state.quote ?? {}),
        JSON.stringify(state.critique ?? {})
      );
    }, dbPath);

    return {
      thread_id: threadId,
      paused_for_approval: true,
      status: "awaiting_approval",
      final_response: state.final_response,
      slots: state.slots,
      quote: state.quote,
      critique: state.critique,
      interrupt: interruptPayload,
      idempotent_replay: false,
      ai_trace: aiTrace,
    };
  }

  const dbStart = performance.now();
  Object.assign(state, await finalizerNode(state, { dbPath, nluMode: effectiveMode }));
  const dbDuration = Math.round((performance.now() - dbStart) * 100) / 100;

  steps.push({
    id: "state_checkpoint",
    title: "4. HITL Checkpoint / Atomic DB",
    engine: dbEngine === "postgres" ? "postgres_serializable_gist" : "sqlite_begin_immediate",
    status: state.outcome_status === "confirmed" ? "completed" : "blocked",
    duration_ms: Math.max(0.2, Math.round((dbDuration - (state.nlg_trace?.duration_ms ?? 0)) * 100) / 100),
    summary:
      state.outcome_status === "confirmed"
        ? dbEngine === "postgres"
          ? "Committed booking, vehicle allocations, and guide assignments inside PostgreSQL SERIALIZABLE + GiST exclusion lock."
          : "Committed booking, vehicle allocations, and guide assignments inside BEGIN IMMEDIATE transaction."
        : "Rejected before persistence — zero database lock contention created.",
    note:
      dbEngine === "postgres"
        ? "PostgreSQL btree_gist EXCLUDE constraint + SERIALIZABLE isolation reject any overlapping dates at storage level."
        : "TOCTOU conflict guard re-verifies vehicle_allocations & booking_guides inside the write lock.",
  });
  if (state.nlg_trace) steps.push(state.nlg_trace);

  const aiTrace: AiTrace = {
    architecture_pattern:
      "Neuro-Symbolic Tool-Grounded Agent (LLM NLU -> Deterministic SQL Tools -> Policy Critic -> HITL Checkpoint -> Grounded LLM NLG)",
    requested_engine: effectiveMode,
    effective_nlu_engine: state.nlu_trace?.engine ?? effectiveMode,
    effective_nlg_engine: state.nlg_trace?.engine ?? "deterministic_template",
    total_duration_ms: Math.round((performance.now() - workflowStart) * 100) / 100,
    steps,
  };
  state.ai_trace = aiTrace;
  await saveCheckpoint(threadId, state, false, null, checkpointDbPath);

  return {
    thread_id: threadId,
    paused_for_approval: false,
    status: state.outcome_status,
    final_response: state.final_response,
    slots: state.slots,
    quote: state.quote,
    critique: state.critique,
    interrupt: null,
    idempotent_replay: false,
    ai_trace: aiTrace,
  };
}

export async function resumeApprovalWorkflow(params: {
  threadId: string;
  approved: boolean;
  reviewer: string;
  note?: string | null;
  dbPath?: string;
  checkpointDbPath?: string;
}): Promise<{
  thread_id: string;
  approved: boolean;
  reviewer: string;
  status: string;
  final_response: string;
  quote: QuoteResult | null;
  ai_trace?: AiTrace | null;
}> {
  const {
    threadId,
    approved,
    reviewer,
    dbPath = DEFAULT_DB_PATH,
    checkpointDbPath = DEFAULT_CHECKPOINT_DB_PATH,
  } = params;

  const ckpt = await loadCheckpoint(threadId, checkpointDbPath);
  if (!ckpt || !ckpt.paused) {
    throw new Error(`No paused checkpoint found for thread '${threadId}'.`);
  }

  const effectiveMode: NluMode = ckpt.state.ai_trace?.requested_engine ?? (useDeterministicLlm() ? "deterministic" : "ollama");
  const dbEngine: "postgres" | "sqlite" =
    dbPath === DEFAULT_DB_PATH ? (await getDbStatus()).active_engine : "sqlite";

  const state: DispatchState = {
    ...ckpt.state,
    human_approved: approved,
    reviewer,
  };

  await logAudit(threadId, "human_approval", `approved=${approved}`, { approved, reviewer }, dbPath);
  const resumeStart = performance.now();
  Object.assign(state, await finalizerNode(state, { dbPath, nluMode: effectiveMode }));

  const priorSteps = (ckpt.state.ai_trace?.steps ?? []).filter(
    (s) => s.id !== "state_checkpoint" && s.id !== "nlg_response"
  );
  priorSteps.push({
    id: "state_checkpoint",
    title: "4. HITL Checkpoint / Atomic DB",
    engine: dbEngine === "postgres" ? "postgres_serializable_gist" : "sqlite_begin_immediate",
    status: approved ? "completed" : "blocked",
    duration_ms: Math.max(0.3, Math.round((performance.now() - resumeStart) * 100) / 100),
    summary: approved
      ? `Manager '${reviewer}' approved exception -> committed booking inside atomic TOCTOU lock.`
      : `Manager '${reviewer}' declined exception -> recorded 'held' quote without locking vehicles/guides.`,
    output_payload: { approved, reviewer, outcome_status: state.outcome_status },
  });
  if (state.nlg_trace) priorSteps.push(state.nlg_trace);

  const aiTrace: AiTrace = {
    architecture_pattern:
      "Neuro-Symbolic Tool-Grounded Agent (LLM NLU -> Deterministic SQL Tools -> Policy Critic -> HITL Checkpoint -> Grounded LLM NLG)",
    requested_engine: effectiveMode,
    effective_nlu_engine: ckpt.state.ai_trace?.effective_nlu_engine ?? effectiveMode,
    effective_nlg_engine: state.nlg_trace?.engine ?? "deterministic_template",
    total_duration_ms: Math.round(
      ((ckpt.state.ai_trace?.total_duration_ms ?? 0) + (performance.now() - resumeStart)) * 100
    ) / 100,
    steps: priorSteps,
  };
  state.ai_trace = aiTrace;
  await saveCheckpoint(threadId, state, false, null, checkpointDbPath);

  return {
    thread_id: threadId,
    approved,
    reviewer,
    status: state.outcome_status,
    final_response: state.final_response,
    quote: state.quote,
    ai_trace: aiTrace,
  };
}
