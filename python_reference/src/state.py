from typing import Any, Literal
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

ResidencyTier = Literal["ea_citizen", "ke_resident", "af_citizen", "non_resident"]


class InquirySlots(BaseModel):
    intent: Literal["quote_request", "availability_check", "clarification_needed"] = "quote_request"
    language: Literal["en", "sw", "mixed"] = "en"
    circuit_name: str | None = None
    start_date: str | None = Field(default=None, description="ISO YYYY-MM-DD start date if provided")
    adults: int | None = Field(default=None, ge=0, le=30)
    children: int = Field(default=0, ge=0, le=30)
    infants_under_5: int = Field(default=0, ge=0, le=10)
    residency_tier: ResidencyTier | None = None
    prefer_senior_guide: bool = False
    discount_pct: float = Field(default=0.0, ge=0.0, le=50.0)
    missing_fields: list[str] = Field(default_factory=list)


class CritiqueResult(BaseModel):
    approved: bool
    requires_human_approval: bool = False
    hard_failures: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    multi_vehicle_used: bool = False


class DispatchState(TypedDict):
    thread_id: str
    idempotency_key: str | None
    user_message: str
    prior_slots: dict[str, Any] | None
    slots: dict[str, Any]
    quote: dict[str, Any] | None
    critique: dict[str, Any] | None
    retry_count: int
    human_approved: bool | None
    reviewer: str | None
    outcome_status: str
    final_response: str
