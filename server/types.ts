export type ResidencyTier = "ea_citizen" | "ke_resident" | "af_citizen" | "non_resident";
export type LanguageCode = "en" | "sw" | "mixed";
export type NluMode = "deterministic" | "ollama" | "gemini";

export interface InquirySlots {
  intent: "quote_request" | "availability_check" | "clarification_needed";
  language: LanguageCode;
  customer_name?: string | null;
  circuit_name: string | null;
  start_date: string | null;
  adults: number | null;
  children: number;
  infants_under_5: number;
  residency_tier: ResidencyTier | null;
  prefer_senior_guide: boolean;
  discount_pct: number;
  missing_fields: string[];
  extraction_source?: string;
  fallback_error?: string | null;
}

export interface CircuitRow {
  id: number;
  code: string;
  name: string;
  park_or_reserve: string;
  authority_type: "narok_reserve" | "kws_park" | "conservancy";
  region: string;
  days: number;
  max_daily_drive_hours: number;
  lodge_nightly_usd: number;
  high_ea_citizen_adult_kes: number;
  high_ea_citizen_child_kes: number;
  high_ke_resident_adult_kes: number;
  high_ke_resident_child_kes: number;
  high_af_citizen_adult_usd: number;
  high_af_citizen_child_usd: number;
  high_non_res_adult_usd: number;
  high_non_res_child_usd: number;
  low_ea_citizen_adult_kes: number;
  low_ea_citizen_child_kes: number;
  low_ke_resident_adult_kes: number;
  low_ke_resident_child_kes: number;
  low_af_citizen_adult_usd: number;
  low_af_citizen_child_usd: number;
  low_non_res_adult_usd: number;
  low_non_res_child_usd: number;
}

export interface FleetRow {
  id: number;
  code: string;
  vehicle_type: string;
  max_pax: number;
  daily_rate_usd: number;
  tsv_licensed: number;
  status: "available" | "maintenance" | "retired";
  assigned_pax?: number;
  is_free_for_dates?: boolean;
  conflicting_booking_id?: number | null;
}

export interface GuideRow {
  id: number;
  name: string;
  languages: string;
  tier: "senior" | "standard";
  daily_rate_usd: number;
  status: "available" | "on_leave";
  is_free_for_dates?: boolean;
  conflicting_booking_id?: number | null;
}

export interface QuoteBreakdown {
  vehicles: number;
  guide: number;
  accommodation: number;
  conservation_fees: number;
}

export interface QuoteSuccess {
  circuit: CircuitRow;
  season: "high" | "low";
  start_date: string;
  end_date: string;
  days: number;
  nights: number;
  adults: number;
  children: number;
  infants_under_5: number;
  total_pax: number;
  residency_tier: ResidencyTier;
  assigned_vehicles: FleetRow[];
  vehicle_codes: string[];
  uncovered_pax: number;
  assigned_guides: GuideRow[];
  guide: GuideRow | null;
  guides_required: number;
  guides_shortfall: number;
  discount_pct: number;
  fx_usd_to_kes: number;
  breakdown_usd: QuoteBreakdown;
  breakdown_kes: QuoteBreakdown;
  gross_total_usd: number;
  quoted_total_usd: number;
  quoted_total_kes: number;
}

export interface QuoteError {
  error: string;
  available_circuits?: string[];
}

export type QuoteResult = QuoteSuccess | QuoteError;

export interface CritiqueResult {
  approved: boolean;
  requires_human_approval: boolean;
  hard_failures: string[];
  reasons: string[];
  multi_vehicle_used: boolean;
}

export interface AiTraceStep {
  id: "nlu_intake" | "tool_pricing" | "policy_critic" | "state_checkpoint" | "nlg_response";
  title: string;
  engine: string;
  status: "completed" | "fallback" | "paused" | "blocked" | "retried";
  duration_ms: number;
  summary: string;
  prompt_preview?: string;
  input_payload?: Record<string, unknown>;
  output_payload?: Record<string, unknown>;
  note?: string;
}

export interface AiTrace {
  architecture_pattern: string;
  requested_engine: NluMode;
  effective_nlu_engine: string;
  effective_nlg_engine: string;
  total_duration_ms: number;
  steps: AiTraceStep[];
}

export interface DispatchState {
  thread_id: string;
  idempotency_key: string | null;
  user_message: string;
  prior_slots: InquirySlots | null;
  slots: InquirySlots | null;
  quote: QuoteResult | null;
  critique: CritiqueResult | null;
  retry_count: number;
  human_approved: boolean | null;
  reviewer: string | null;
  outcome_status: string;
  final_response: string;
  nlu_trace?: AiTraceStep | null;
  nlg_trace?: AiTraceStep | null;
  ai_trace?: AiTrace | null;
}

export interface DbStatusInfo {
  active_engine: "postgres" | "sqlite";
  configured_mode: "auto" | "postgres" | "sqlite";
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    reachable: boolean;
    error?: string;
  };
}

export interface WorkflowResponse {
  thread_id: string;
  paused_for_approval: boolean;
  status: string;
  final_response: string;
  slots: InquirySlots | null;
  quote: QuoteResult | null;
  critique: CritiqueResult | null;
  interrupt: Record<string, unknown> | null;
  idempotent_replay: boolean;
  ai_trace?: AiTrace | null;
}

export class BookingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingConflictError";
  }
}
