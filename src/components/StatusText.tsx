import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  approved: "Approved",
  available: "Available",
  passed: "Passed",
  awaiting_approval: "Needs Approval",
  pending: "Waiting for Review",
  clarification_needed: "More Details Needed",
  held: "On Hold",
  rejected: "Declined",
  conflict: "Schedule Conflict",
  maintenance: "In Maintenance",
  on_leave: "On Leave",
  failed: "Failed",
};

export function StatusText({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const label = STATUS_LABELS[normalized] ?? status.replaceAll("_", " ");

  if (normalized === "confirmed" || normalized === "approved" || normalized === "available" || normalized === "passed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }
  if (normalized === "awaiting_approval" || normalized === "pending" || normalized === "clarification_needed" || normalized === "held") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }
  if (normalized === "rejected" || normalized === "conflict" || normalized === "maintenance" || normalized === "on_leave" || normalized === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
        {normalized === "conflict" ? (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <XCircle className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{label}</span>
      </span>
    );
  }
  return <span className="text-xs font-semibold text-slate-600">{label}</span>;
}
