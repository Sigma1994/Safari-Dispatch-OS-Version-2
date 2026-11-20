import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { BookingRecord } from "../types";
import { formatParty, formatResidency } from "../utils/format";
import { StatusText } from "./StatusText";

interface BookingsLedgerProps {
  bookings: BookingRecord[];
  onNavigateToDispatch: () => void;
}

export function matchesBookingSearch(b: BookingRecord, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const cleanIdQuery = q.replace(/^#/, "");
  const idStr = String(b.id);
  const matchesId =
    idStr === cleanIdQuery ||
    `#${idStr}`.includes(q) ||
    (cleanIdQuery.length > 0 && /^\d+$/.test(cleanIdQuery) && idStr.includes(cleanIdQuery));

  const matchesCircuit = b.circuit_name.toLowerCase().includes(q);
  const matchesCustomer = (b.customer_name ?? "").toLowerCase().includes(q);
  const matchesSecondary =
    b.thread_id.toLowerCase().includes(q) ||
    (b.guide_name ?? "").toLowerCase().includes(q) ||
    b.vehicle_codes_json.toLowerCase().includes(q);

  return matchesId || matchesCircuit || matchesCustomer || matchesSecondary;
}

const FILTER_TABS: Array<{ id: "all" | "confirmed" | "held" | "rejected"; label: string }> = [
  { id: "all", label: "All" },
  { id: "confirmed", label: "Confirmed" },
  { id: "held", label: "On Hold" },
  { id: "rejected", label: "Declined" },
];

export function BookingsLedger({ bookings, onNavigateToDispatch }: BookingsLedgerProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | "confirmed" | "held" | "rejected">("all");
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  function handleClearSearch() {
    setQuery("");
    setStatusFilter("all");
    searchInputRef.current?.focus();
  }

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      return matchesBookingSearch(b, query);
    });
  }, [bookings, statusFilter, query]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, b) => {
        if (b.status === "confirmed") {
          acc.confirmedUsd += Number(b.quoted_total_usd);
          acc.confirmedKes += Number(b.quoted_total_kes);
          acc.confirmedCount += 1;
        }
        return acc;
      },
      { confirmedUsd: 0, confirmedKes: 0, confirmedCount: 0 }
    );
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Confirmed Trips</div>
          <div className="text-xl font-mono font-semibold text-slate-900 tabular-nums mt-1">
            {totals.confirmedCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Confirmed Value (USD)</div>
          <div className="text-xl font-mono font-semibold text-emerald-700 tabular-nums mt-1">
            USD {totals.confirmedUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Confirmed Value (KES)</div>
          <div className="text-xl font-mono font-semibold text-slate-900 tabular-nums mt-1">
            KES {totals.confirmedKes.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap hidden md:inline">
              Showing {filtered.length} of {bookings.length}
            </span>
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                id="bookings-search-input"
                type="text"
                aria-label="Filter bookings by circuit name, customer name, or booking ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by park, customer, or booking #1..."
                className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-16 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              {(query.length > 0 || statusFilter !== "all") && (
                <button
                  type="button"
                  aria-label="Clear search and reset filter"
                  onClick={handleClearSearch}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 whitespace-nowrap"
                >
                  <X className="w-3 h-3 shrink-0" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center border-t border-slate-200">
            <p className="text-sm font-medium text-slate-700">No bookings match your search</p>
            <p className="text-xs text-slate-500 mt-1">
              {query.trim()
                ? `No bookings matched "${query.trim()}". Try searching by safari park, customer name, or booking number.`
                : "Try selecting a different status tab or create a new quote."}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              {(query.trim() || statusFilter !== "all") && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={onNavigateToDispatch}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
              >
                New Safari Quote
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-medium">Booking #</th>
                  <th className="py-2 pr-3 font-medium">Customer</th>
                  <th className="py-2 pr-3 font-medium">Safari Circuit</th>
                  <th className="py-2 pr-3 font-medium">Travel Dates</th>
                  <th className="py-2 pr-3 font-medium">Travelers</th>
                  <th className="py-2 pr-3 font-medium">Vehicles &amp; Guide</th>
                  <th className="py-2 pr-3 font-medium text-right">USD</th>
                  <th className="py-2 pr-3 font-medium text-right">KES</th>
                  <th className="py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((b) => {
                  let vehicles = "";
                  try {
                    vehicles = (JSON.parse(b.vehicle_codes_json) as string[]).join(", ");
                  } catch {
                    vehicles = b.vehicle_codes_json;
                  }
                  return (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3 font-mono text-slate-700 font-medium tabular-nums">#{b.id}</td>
                      <td className="py-2.5 pr-3 text-slate-900 font-medium">
                        {b.customer_name || <span className="text-slate-400 font-normal">Walk-in Guest</span>}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-slate-900">{b.circuit_name}</div>
                        <div className="text-slate-500">{formatResidency(b.residency_tier)}</div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {b.start_date} → {b.end_date}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700 whitespace-nowrap">
                        {formatParty(b.adults, b.children, b.infants_under_5)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-mono text-slate-800">{vehicles || "—"}</div>
                        <div className="text-slate-500">{b.guide_name ?? "Unassigned"}</div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-right text-slate-900 tabular-nums">
                        {Number(b.quoted_total_usd).toFixed(2)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-right text-slate-600 tabular-nums">
                        {Number(b.quoted_total_kes).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 text-right">
                        <StatusText status={b.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
