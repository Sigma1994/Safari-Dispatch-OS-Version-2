import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import type { FleetRecord, GuideRecord } from "../types";
import { StatusText } from "./StatusText";

export function FleetAndGuides() {
  const [startDate, setStartDate] = useState("2026-12-11");
  const [endDate, setEndDate] = useState("2026-12-13");
  const [fleet, setFleet] = useState<FleetRecord[]>([]);
  const [guides, setGuides] = useState<GuideRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);

  async function loadAvailability(s: string, e: string) {
    setLoading(true);
    try {
      const qs = `start_date=${encodeURIComponent(s)}&end_date=${encodeURIComponent(e)}`;
      const [fRes, gRes] = await Promise.all([fetch(`/api/fleet?${qs}`), fetch(`/api/guides?${qs}`)]);
      if (fRes.ok) setFleet((await fRes.json()) as FleetRecord[]);
      if (gRes.ok) setGuides((await gRes.json()) as GuideRecord[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAvailability(startDate, endDate);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Vehicle &amp; Guide Availability</h2>
            <p className="text-sm text-slate-500 mt-1">
              Select travel dates to see which safari cruisers and driver-guides are free. Sample Booking #1 reserves cruiser LC-01 and guide Peter Kamau from Dec 10 to Dec 13, 2026.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 items-end">
            <div>
              <label htmlFor="avail-start" className="block text-xs font-medium text-slate-700 mb-1">
                From Date
              </label>
              <input
                id="avail-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="avail-end" className="block text-xs font-medium text-slate-700 mb-1">
                To Date
              </label>
              <input
                id="avail-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadAvailability(startDate, endDate)}
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Check Availability
            </button>
          </div>
        </section>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden relative min-h-[180px]">
          {!imgFailed ? (
            <img
              src="/src/assets/images/fleet_safari_cruiser_1795101041316.jpg"
              alt="4x4 Pop-Top Safari Land Cruiser on Kenyan savanna track"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover max-h-56"
            />
          ) : (
            <div className="w-full h-full min-h-[180px] bg-gradient-to-br from-slate-100 to-emerald-50 flex flex-col items-center justify-center p-4 text-center">
              <Truck className="w-8 h-8 text-emerald-700 mb-2" />
              <div className="text-sm font-semibold text-slate-800">Licensed Safari Fleet</div>
              <div className="text-xs text-slate-500">4x4 Pop-Top Land Cruisers &amp; Tour Vans</div>
            </div>
          )}
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Safari Vehicles</h3>
          <span className="text-xs text-slate-500 tabular-nums">
            {fleet.filter((f) => f.is_free_for_dates).length} of {fleet.length} ready for {startDate} → {endDate}
          </span>
        </div>

        {loading ? (
          <div className="space-y-2 py-4">
            <div className="h-8 bg-slate-100 rounded animate-pulse" />
            <div className="h-8 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-medium">Vehicle Code</th>
                  <th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 font-medium text-right">Seats</th>
                  <th className="py-2 pr-3 font-medium text-right">Daily Rate (USD)</th>
                  <th className="py-2 pr-3 font-medium">Tour Permit</th>
                  <th className="py-2 pr-3 font-medium">Date Availability</th>
                  <th className="py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fleet.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">{v.code}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{v.vehicle_type}</td>
                    <td className="py-2.5 pr-3 font-mono text-right tabular-nums text-slate-800">{v.max_pax}</td>
                    <td className="py-2.5 pr-3 font-mono text-right tabular-nums text-slate-900">
                      {Number(v.daily_rate_usd).toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{v.tsv_licensed ? "Licensed" : "Needs Renewal"}</td>
                    <td className="py-2.5 pr-3 text-slate-600">
                      {v.is_free_for_dates ? (
                        <span className="text-emerald-700 font-medium">Available for dates</span>
                      ) : v.conflicting_booking_id ? (
                        <span className="text-amber-700 font-medium">Booked on Trip #{v.conflicting_booking_id}</span>
                      ) : (
                        <span className="text-red-700">Unavailable</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <StatusText status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Driver-Guides</h3>
          <span className="text-xs text-slate-500 tabular-nums">
            {guides.filter((g) => g.is_free_for_dates).length} of {guides.length} available for {startDate} → {endDate}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3 font-medium">Guide Name</th>
                <th className="py-2 pr-3 font-medium">Experience</th>
                <th className="py-2 pr-3 font-medium">Languages</th>
                <th className="py-2 pr-3 font-medium text-right">Daily Rate (USD)</th>
                <th className="py-2 pr-3 font-medium">Date Availability</th>
                <th className="py-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {guides.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-medium text-slate-900">{g.name}</td>
                  <td className="py-2.5 pr-3 capitalize text-slate-700">{g.tier}</td>
                  <td className="py-2.5 pr-3 font-mono text-slate-600">{g.languages}</td>
                  <td className="py-2.5 pr-3 font-mono text-right tabular-nums text-slate-900">
                    {Number(g.daily_rate_usd).toFixed(2)}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">
                    {g.is_free_for_dates ? (
                      <span className="text-emerald-700 font-medium">Available for dates</span>
                    ) : g.conflicting_booking_id ? (
                      <span className="text-amber-700 font-medium">Assigned to Trip #{g.conflicting_booking_id}</span>
                    ) : (
                      <span className="text-red-700">Unavailable</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <StatusText status={g.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
