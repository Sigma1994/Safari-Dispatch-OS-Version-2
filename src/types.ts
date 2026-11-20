export type NluMode = "deterministic" | "ollama" | "gemini";
export type NavSection = "dispatch" | "bookings" | "fleet" | "circuits" | "engine" | "training";

export interface InquirySlots {
  intent: string;
  language: string;
  customer_name?: string | null;
  circuit_name: string | null;
  start_date: string | null;
  adults: number | null;
  children: number;
  infants_under_5: number;
  residency_tier: string | null;
  prefer_senior_guide: boolean;
  discount_pct: number;
  missing_fields: string[];
  extraction_source?: string;
  fallback_error?: string | null;
}

export interface CircuitRecord {
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

export interface FleetRecord {
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

export interface GuideRecord {
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
  circuit: CircuitRecord;
  season: "high" | "low";
  start_date: string;
  end_date: string;
  days: number;
  nights: number;
  adults: number;
  children: number;
  infants_under_5: number;
  total_pax: number;
  residency_tier: string;
  assigned_vehicles: FleetRecord[];
  vehicle_codes: string[];
  uncovered_pax: number;
  assigned_guides: GuideRecord[];
  guide: GuideRecord | null;
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

export type QuoteResult = QuoteSuccess | { error: string; available_circuits?: string[] };

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

export interface PendingApprovalItem {
  thread_id: string;
  idempotency_key: string | null;
  user_message: string;
  slots: InquirySlots;
  quote: QuoteResult;
  critique: CritiqueResult;
  status: string;
  created_at: string;
}

export interface BookingRecord {
  id: number;
  idempotency_key: string | null;
  thread_id: string;
  customer_name: string | null;
  circuit_id: number;
  circuit_name: string;
  circuit_code: string;
  vehicle_codes_json: string;
  guide_id: number | null;
  guide_name: string | null;
  start_date: string;
  end_date: string;
  adults: number;
  children: number;
  infants_under_5: number;
  residency_tier: string;
  discount_pct: number;
  quoted_total_usd: number;
  quoted_total_kes: number;
  status: "confirmed" | "held" | "rejected";
  created_at: string;
}

export interface AuditEntry {
  id: number;
  thread_id: string;
  node_name: string;
  decision: string;
  details: Record<string, unknown> | string;
  created_at: string;
}

export interface HealthResponse {
  status: string;
  mode: "deterministic" | "ollama";
  gemini_configured: boolean;
  online_llm_enabled?: boolean;
  database?: {
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
  };
  policy: {
    usd_to_kes_rate: number;
    max_auto_discount_pct: number;
    max_daily_drive_hours_safe: number;
  };
  ollama: {
    reachable: boolean;
    model_installed: boolean;
    model: string;
    base_url: string;
    error?: string;
  };
}

export interface VerificationSuiteReport {
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    name: string;
    category: "pricing" | "workflow" | "concurrency" | "nlu";
    passed: boolean;
    duration_ms: number;
    error?: string;
  }>;
}
