import { GoogleGenAI, Type } from "@google/genai";
import type { InquirySlots, LanguageCode, NluMode, ResidencyTier } from "./types.ts";

const VALID_CIRCUITS = [
  "Maasai Mara Classic",
  "Amboseli Kilimanjaro Loop",
  "Tsavo East & West Expedition",
  "Lake Nakuru Flamingo & Rift",
  "Samburu Ewaso Nyiro Safari",
  "Grand Rift & Mara Marathon",
] as const;

export function useDeterministicLlm(): boolean {
  const raw = (process.env.USE_DETERMINISTIC_LLM ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isOnlineLlmEnabled(): boolean {
  const flag = (process.env.ENABLE_ONLINE_LLM ?? "0").trim().toLowerCase();
  const enabled = flag === "1" || flag === "true" || flag === "yes";
  const key = process.env.GEMINI_API_KEY;
  return enabled && Boolean(key && key !== "MY_GEMINI_API_KEY");
}

export const NLU_SYSTEM_PROMPT =
  "Extract Kenyan safari inquiry slots from English, Swahili, or mixed text.\n" +
  `Known circuits: ${VALID_CIRCUITS.join(", ")}.\n` +
  "Rules:\n" +
  "- If the user asks for an unrecognized park (e.g. Serengeti, Ngorongoro), keep that exact park name in circuit_name; NEVER substitute a different park.\n" +
  "- If no park or circuit is mentioned (e.g. a follow-up like '4 adults starting 2026-12-20'), set circuit_name to null.\n" +
  "- If only total people/pax are given (e.g. '10 people' or 'watu 10'), set adults to that number and children=0.\n" +
  "- Residency tiers: ea_citizen, ke_resident, af_citizen, non_resident (or null if unmentioned).\n" +
  "- Only set start_date if explicitly mentioned in ISO YYYY-MM-DD format.\n" +
  "Examples:\n" +
  "Input: 'Tunataka quote ya Maasai Mara Classic kwa 10 people kuanzia 2026-12-15 with 15% discount.'\n" +
  "Output: {\"intent\":\"quote_request\",\"language\":\"mixed\",\"customer_name\":null,\"circuit_name\":\"Maasai Mara Classic\",\"start_date\":\"2026-12-15\",\"adults\":10,\"children\":0,\"infants_under_5\":0,\"residency_tier\":null,\"prefer_senior_guide\":false,\"discount_pct\":15,\"missing_fields\":[]}\n" +
  "Input: '4 adults starting 2026-12-20'\n" +
  "Output: {\"intent\":\"quote_request\",\"language\":\"en\",\"customer_name\":null,\"circuit_name\":null,\"start_date\":\"2026-12-20\",\"adults\":4,\"children\":0,\"infants_under_5\":0,\"residency_tier\":null,\"prefer_senior_guide\":false,\"discount_pct\":0,\"missing_fields\":[]}";

export function heuristicExtract(message: string): InquirySlots {
  const text = message.toLowerCase();
  const swWords = [
    "tunataka",
    "watu",
    "bei",
    "gari",
    "safari",
    "kuanzia",
    "naomba",
    "tafadhali",
    "punguzo",
    "watoto",
    "wakenya",
    "habari",
  ];
  const enWords = [
    "quote",
    "book",
    "people",
    "guests",
    "pax",
    "discount",
    "vehicle",
    "guide",
    "days",
    "children",
    "kids",
    "adults",
    "starting",
  ];
  const hasSw = swWords.some((w) => text.includes(w));
  const hasEn = enWords.some((w) => text.includes(w));
  const language: LanguageCode = hasSw && hasEn ? "mixed" : hasSw ? "sw" : "en";

  const circuitMap: Array<[string, string]> = [
    ["grand rift", "Grand Rift & Mara Marathon"],
    ["mara", "Maasai Mara Classic"],
    ["amboseli", "Amboseli Kilimanjaro Loop"],
    ["tsavo", "Tsavo East & West Expedition"],
    ["nakuru", "Lake Nakuru Flamingo & Rift"],
    ["samburu", "Samburu Ewaso Nyiro Safari"],
  ];

  let circuitName: string | null = null;
  for (const [needle, canonical] of circuitMap) {
    if (text.includes(needle)) {
      circuitName = canonical;
      break;
    }
  }
  // If user explicitly names an unrecognized park like "Serengeti" or "Ngorongoro", capture it
  // so specialist/pricing reports unknown circuit instead of silently pretending nothing was asked.
  if (!circuitName) {
    const explicitPark = message.match(/\b(?:for|to|ya|safari ya)\s+([A-Z][a-zA-Z]{3,}(?:\s+[A-Z][a-zA-Z]+)?)/);
    if (explicitPark) {
      const candidate = explicitPark[1].trim();
      const skip = new Set(["Quote", "Book", "Adults", "People", "Guests", "Starting", "Please"]);
      if (!skip.has(candidate)) {
        circuitName = candidate;
      }
    }
  }

  let residencyTier: ResidencyTier | null = null;
  if (
    ["ea citizen", "east african citizen", "mwananchi", "kenyan citizen", "raia wa kenya", "wakenya"].some((k) =>
      text.includes(k)
    )
  ) {
    residencyTier = "ea_citizen";
  } else if (["kenya resident", "resident permit", "ke resident", "mkazi"].some((k) => text.includes(k))) {
    residencyTier = "ke_resident";
  } else if (["african citizen", "af citizen", "raia wa afrika"].some((k) => text.includes(k))) {
    residencyTier = "af_citizen";
  } else if (["non resident", "non-resident", "foreign", "mgeni"].some((k) => text.includes(k))) {
    residencyTier = "non_resident";
  }

  const adultsMatch = text.match(/\b(\d{1,2})\s*(?:adults?|watu wazima)\b/);
  const childrenMatch = text.match(/\b(\d{1,2})\s*(?:children|kids|watoto)\b/);
  const infantsMatch = text.match(/\b(\d{1,2})\s*(?:infants?|under[- ]?5|toddlers?)\b/);
  const generalPaxMatch = text.match(/\b(\d{1,2})\s*(?:pax|people|guests|watu|persons)\b/);

  const children = childrenMatch ? Number(childrenMatch[1]) : 0;
  const infants = infantsMatch ? Number(infantsMatch[1]) : 0;
  let adults: number | null = adultsMatch ? Number(adultsMatch[1]) : null;
  if (adults === null && generalPaxMatch) {
    adults = Math.max(Number(generalPaxMatch[1]) - children - infants, 0);
  }

  const discMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const discountPct = discMatch ? Math.min(Math.max(Number(discMatch[1]), 0), 50) : 0;

  const dateMatch = message.match(/\b(202\d-\d{2}-\d{2})\b/);
  const startDate = dateMatch ? dateMatch[1] : null;

  const seniorGuide = ["senior guide", "experienced guide", "mwongozo mzuri"].some((k) => text.includes(k));

  const customerMatch = message.match(
    /(?:customer|client|guest\s+name|agency|under\s+name|my\s+name\s+is)\s*[:=-]?\s*([A-Z][a-zA-Z'&-]+(?:\s+[A-Z&][a-zA-Z'&-]+){0,3})/
  );
  const customerName = customerMatch ? customerMatch[1].trim() : null;

  return {
    intent: "quote_request",
    language,
    customer_name: customerName,
    circuit_name: circuitName,
    start_date: startDate,
    adults,
    children,
    infants_under_5: infants,
    residency_tier: residencyTier,
    prefer_senior_guide: seniorGuide,
    discount_pct: discountPct,
    missing_fields: [],
  };
}

function normalizeParsedSlots(raw: Partial<InquirySlots>): InquirySlots {
  const validLang: LanguageCode =
    raw.language === "sw" || raw.language === "mixed" || raw.language === "en" ? raw.language : "en";
  const validRes: ResidencyTier | null =
    raw.residency_tier === "ea_citizen" ||
    raw.residency_tier === "ke_resident" ||
    raw.residency_tier === "af_citizen" ||
    raw.residency_tier === "non_resident"
      ? raw.residency_tier
      : null;

  return {
    intent:
      raw.intent === "availability_check" || raw.intent === "clarification_needed"
        ? raw.intent
        : "quote_request",
    language: validLang,
    customer_name: typeof raw.customer_name === "string" && raw.customer_name.trim() ? raw.customer_name.trim() : null,
    circuit_name: typeof raw.circuit_name === "string" && raw.circuit_name.trim() ? raw.circuit_name.trim() : null,
    start_date: typeof raw.start_date === "string" && raw.start_date.trim() ? raw.start_date.trim() : null,
    adults: typeof raw.adults === "number" && Number.isFinite(raw.adults) ? Math.max(0, Math.trunc(raw.adults)) : null,
    children:
      typeof raw.children === "number" && Number.isFinite(raw.children) ? Math.max(0, Math.trunc(raw.children)) : 0,
    infants_under_5:
      typeof raw.infants_under_5 === "number" && Number.isFinite(raw.infants_under_5)
        ? Math.max(0, Math.trunc(raw.infants_under_5))
        : 0,
    residency_tier: validRes,
    prefer_senior_guide: Boolean(raw.prefer_senior_guide),
    discount_pct:
      typeof raw.discount_pct === "number" && Number.isFinite(raw.discount_pct)
        ? Math.min(Math.max(raw.discount_pct, 0), 50)
        : 0,
    missing_fields: Array.isArray(raw.missing_fields) ? raw.missing_fields.map(String) : [],
  };
}

export const SLOT_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["quote_request", "availability_check", "clarification_needed"] },
    language: { type: "string", enum: ["en", "sw", "mixed"] },
    customer_name: { type: ["string", "null"] },
    circuit_name: { type: ["string", "null"] },
    start_date: { type: ["string", "null"] },
    adults: { type: ["integer", "null"] },
    children: { type: "integer" },
    infants_under_5: { type: "integer" },
    residency_tier: { type: ["string", "null"], enum: ["ea_citizen", "ke_resident", "af_citizen", "non_resident", null] },
    prefer_senior_guide: { type: "boolean" },
    discount_pct: { type: "number" },
    missing_fields: { type: "array", items: { type: "string" } },
  },
  required: ["intent", "language", "children", "infants_under_5", "prefer_senior_guide", "discount_pct"],
};

export async function extractWithOllama(message: string): Promise<InquirySlots> {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL ?? "qwen3:4b";
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_SEC ?? "30") * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 30000);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: SLOT_JSON_SCHEMA,
        options: { temperature: 0 },
        messages: [
          {
            role: "system",
            content: NLU_SYSTEM_PROMPT,
          },
          { role: "user", content: message },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
    }

    const payload = (await res.json()) as { message?: { content?: string } };
    const content = payload.message?.content;
    if (!content) {
      throw new Error("Ollama returned empty message content.");
    }
    const parsed = JSON.parse(content) as Partial<InquirySlots>;
    return normalizeParsedSlots(parsed);
  } finally {
    clearTimeout(timer);
  }
}

export async function extractWithGemini(message: string): Promise<InquirySlots> {
  if (!isOnlineLlmEnabled()) {
    throw new Error("Online Cloud LLM is disabled (set ENABLE_ONLINE_LLM=1 and GEMINI_API_KEY in production).");
  }
  const apiKey = process.env.GEMINI_API_KEY!;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: message,
    config: {
      systemInstruction:
        "Extract Kenyan safari inquiry slots from English, Swahili, or mixed text. " +
        `Map known Kenyan circuits to: ${VALID_CIRCUITS.join(", ")}. ` +
        "Residency tiers: ea_citizen, ke_resident, af_citizen, non_resident (omit or null if unmentioned). " +
        "Only populate start_date if explicitly present in YYYY-MM-DD format.",
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent: { type: Type.STRING },
          language: { type: Type.STRING },
          circuit_name: { type: Type.STRING, nullable: true },
          start_date: { type: Type.STRING, nullable: true },
          adults: { type: Type.INTEGER, nullable: true },
          children: { type: Type.INTEGER },
          infants_under_5: { type: Type.INTEGER },
          residency_tier: { type: Type.STRING, nullable: true },
          prefer_senior_guide: { type: Type.BOOLEAN },
          discount_pct: { type: Type.NUMBER },
        },
        required: ["intent", "language", "children", "infants_under_5", "prefer_senior_guide", "discount_pct"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Cloud LLM returned empty text.");
  }
  return normalizeParsedSlots(JSON.parse(text) as Partial<InquirySlots>);
}

export async function extractInquirySlots(
  message: string,
  requestedMode?: NluMode
): Promise<{
  slots: InquirySlots;
  extractionSource: string;
  fallbackError: string | null;
  durationMs: number;
  effectiveMode: NluMode;
  promptPreview: string;
}> {
  const effectiveMode: NluMode =
    requestedMode ?? (useDeterministicLlm() ? "deterministic" : "ollama");
  const start = performance.now();

  if (effectiveMode === "deterministic") {
    return {
      slots: heuristicExtract(message),
      extractionSource: "heuristic",
      fallbackError: null,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      effectiveMode,
      promptPreview: "Deterministic Regex & Lexicon Extractor (English / Swahili)",
    };
  }

  if (effectiveMode === "ollama") {
    try {
      const slots = await extractWithOllama(message);
      const model = process.env.OLLAMA_MODEL ?? "qwen3:4b";
      return {
        slots,
        extractionSource: `ollama:${model}`,
        fallbackError: null,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        effectiveMode,
        promptPreview: NLU_SYSTEM_PROMPT,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        slots: heuristicExtract(message),
        extractionSource: "heuristic_fallback",
        fallbackError: msg,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        effectiveMode,
        promptPreview: NLU_SYSTEM_PROMPT,
      };
    }
  }

  try {
    const slots = await extractWithGemini(message);
    return {
      slots,
      extractionSource: "gemini:gemini-2.5-flash",
      fallbackError: null,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      effectiveMode,
      promptPreview: NLU_SYSTEM_PROMPT,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      slots: heuristicExtract(message),
      extractionSource: "heuristic_fallback",
      fallbackError: msg,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      effectiveMode,
      promptPreview: NLU_SYSTEM_PROMPT,
    };
  }
}

export const NLG_SYSTEM_PROMPT =
  "You are a helpful Nairobi safari dispatch coordinator writing a concise 2-3 sentence customer reply.\n" +
  "Rules:\n" +
  "1. Match the customer's language (English, Swahili, or polite bilingual EN/SW if mixed).\n" +
  "2. Use ONLY the verified numbers, dates, vehicle codes, guide names, booking ID, and status in the provided GROUNDING_FACTS JSON.\n" +
  "3. If status is 'confirmed', you MUST include the exact Booking #<booking_id> and the exact USD total (e.g. $1,150.00).\n" +
  "4. If status is 'rejected' due to an unknown circuit, explicitly include the phrase 'unknown circuit'.\n" +
  "5. NEVER invent, round, or alter any USD/KES totals, dates, booking numbers, or policy reasons.\n" +
  "6. Be clear, warm, and direct—do not output markdown headings, bullet lists, or JSON.";

export interface GroundingContext {
  status: "confirmed" | "awaiting_approval" | "held" | "rejected" | "clarification_needed";
  customer_name: string | null;
  language: LanguageCode;
  original_message: string;
  fallback_template: string;
  booking_id?: number | null;
  circuit_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  days?: number | null;
  total_pax?: number | null;
  vehicle_codes?: string[];
  guide_names?: string[];
  quoted_total_usd?: number | null;
  quoted_total_kes?: number | null;
  reasons?: string[];
  missing_fields?: string[];
}

function verifyGroundedReply(reply: string, facts: GroundingContext): { ok: boolean; reason: string } {
  const cleaned = reply.trim();
  if (!cleaned || cleaned.length < 12) {
    return { ok: false, reason: "Reply was empty or too short." };
  }
  if (facts.status === "confirmed") {
    if (facts.booking_id && !cleaned.includes(String(facts.booking_id))) {
      return { ok: false, reason: `Missing exact Booking #${facts.booking_id} anchor.` };
    }
    if (typeof facts.quoted_total_usd === "number") {
      const exactInt = String(Math.round(facts.quoted_total_usd));
      const commaInt = Math.round(facts.quoted_total_usd).toLocaleString("en-US");
      const formatted = facts.quoted_total_usd.toFixed(2);
      const commaFormatted = facts.quoted_total_usd.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      if (
        !cleaned.includes(formatted) &&
        !cleaned.includes(commaFormatted) &&
        !cleaned.includes(commaInt) &&
        !cleaned.includes(exactInt)
      ) {
        return { ok: false, reason: `Missing verified USD total ($${formatted}).` };
      }
    }
  }
  if (facts.status === "rejected" && facts.reasons?.some((r) => r.toLowerCase().includes("unknown circuit"))) {
    if (!cleaned.toLowerCase().includes("unknown circuit")) {
      return { ok: false, reason: "Rejected unknown-circuit response must clearly state the unsupported park." };
    }
  }
  return { ok: true, reason: "All numeric & booking anchors verified." };
}

export async function synthesizeGroundedReply(
  facts: GroundingContext,
  requestedMode?: NluMode
): Promise<{
  text: string;
  responseSource: string;
  durationMs: number;
  promptPreview: string;
  groundingCheck: string;
  fallbackError: string | null;
}> {
  const effectiveMode: NluMode =
    requestedMode ?? (useDeterministicLlm() ? "deterministic" : "ollama");
  const start = performance.now();

  if (effectiveMode === "deterministic") {
    return {
      text: facts.fallback_template,
      responseSource: "deterministic_template",
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      promptPreview: "Deterministic Verified Template (LLM skipped in deterministic mode)",
      groundingCheck: "Exact template values",
      fallbackError: null,
    };
  }

  const userPayload = `CUSTOMER_MESSAGE: ${facts.original_message}\nGROUNDING_FACTS:\n${JSON.stringify(
    {
      status: facts.status,
      customer_name: facts.customer_name,
      language: facts.language,
      booking_id: facts.booking_id ?? null,
      circuit_name: facts.circuit_name ?? null,
      start_date: facts.start_date ?? null,
      end_date: facts.end_date ?? null,
      days: facts.days ?? null,
      total_pax: facts.total_pax ?? null,
      vehicle_codes: facts.vehicle_codes ?? [],
      guide_names: facts.guide_names ?? [],
      quoted_total_usd: facts.quoted_total_usd ?? null,
      quoted_total_kes: facts.quoted_total_kes ?? null,
      reasons: facts.reasons ?? [],
      missing_fields: facts.missing_fields ?? [],
    },
    null,
    2
  )}`;

  if (effectiveMode === "ollama") {
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
    const model = process.env.OLLAMA_MODEL ?? "qwen3:4b";
    const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_SEC ?? "30") * 1000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 30000);

    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          options: { temperature: 0.2 },
          messages: [
            { role: "system", content: NLG_SYSTEM_PROMPT },
            { role: "user", content: userPayload },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
      }
      const payload = (await res.json()) as { message?: { content?: string } };
      const draft = (payload.message?.content ?? "").trim();
      const check = verifyGroundedReply(draft, facts);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      if (!check.ok) {
        return {
          text: facts.fallback_template,
          responseSource: "template_grounding_guardrail",
          durationMs,
          promptPreview: NLG_SYSTEM_PROMPT,
          groundingCheck: `Guardrail rejected LLM draft (${check.reason}) -> safe verified reply used`,
          fallbackError: null,
        };
      }
      return {
        text: draft,
        responseSource: `ollama:${model}`,
        durationMs,
        promptPreview: NLG_SYSTEM_PROMPT,
        groundingCheck: check.reason,
        fallbackError: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        text: facts.fallback_template,
        responseSource: "template_fallback",
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        promptPreview: NLG_SYSTEM_PROMPT,
        groundingCheck: "Used verified deterministic reply while Ollama offline",
        fallbackError: msg,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Optional production online LLM mode
  try {
    if (!isOnlineLlmEnabled()) {
      throw new Error("Online Cloud LLM is disabled.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPayload,
      config: {
        systemInstruction: NLG_SYSTEM_PROMPT,
        temperature: 0.2,
      },
    });
    const draft = (response.text ?? "").trim();
    const check = verifyGroundedReply(draft, facts);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    if (!check.ok) {
      return {
        text: facts.fallback_template,
        responseSource: "template_grounding_guardrail",
        durationMs,
        promptPreview: NLG_SYSTEM_PROMPT,
        groundingCheck: `Guardrail rejected Cloud LLM draft (${check.reason})`,
        fallbackError: null,
      };
    }
    return {
      text: draft,
      responseSource: "gemini:gemini-2.5-flash",
      durationMs,
      promptPreview: NLG_SYSTEM_PROMPT,
      groundingCheck: check.reason,
      fallbackError: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      text: facts.fallback_template,
      responseSource: "template_fallback",
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      promptPreview: NLG_SYSTEM_PROMPT,
      groundingCheck: "Used verified deterministic reply fallback",
      fallbackError: msg,
    };
  }
}

export function mergeSlots(prior: InquirySlots | null, current: InquirySlots): InquirySlots {
  if (!prior) {
    return {
      ...current,
      start_date: current.start_date ?? "2026-12-15",
      residency_tier: current.residency_tier ?? "non_resident",
    };
  }

  const merged: InquirySlots = { ...prior };
  if (current.customer_name) {
    merged.customer_name = current.customer_name;
  }
  if (current.circuit_name) {
    merged.circuit_name = current.circuit_name;
  }
  if (current.start_date) {
    merged.start_date = current.start_date;
  } else if (!merged.start_date) {
    merged.start_date = "2026-12-15";
  }

  if (current.adults !== null && current.adults > 0) {
    merged.adults = current.adults;
  }
  if (current.children > 0) {
    merged.children = current.children;
  }
  if (current.infants_under_5 > 0) {
    merged.infants_under_5 = current.infants_under_5;
  }
  if (current.residency_tier) {
    merged.residency_tier = current.residency_tier;
  } else if (!merged.residency_tier) {
    merged.residency_tier = "non_resident";
  }

  if (current.prefer_senior_guide) {
    merged.prefer_senior_guide = true;
  }
  if (current.discount_pct > 0) {
    merged.discount_pct = current.discount_pct;
  }
  if (current.language) {
    merged.language = current.language;
  }
  return merged;
}
