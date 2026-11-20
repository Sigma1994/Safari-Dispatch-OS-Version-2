import { useState } from "react";
import { Compass } from "lucide-react";
import type { CircuitRecord } from "../types";
import { formatAuthority } from "../utils/format";

interface CircuitsCatalogProps {
  circuits: CircuitRecord[];
}

export function CircuitsCatalog({ circuits }: CircuitsCatalogProps) {
  const [season, setSeason] = useState<"high" | "low">("high");
  const [maraImgErr, setMaraImgErr] = useState(false);
  const [amboImgErr, setAmboImgErr] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          <div className="h-48 bg-slate-100 relative overflow-hidden">
            {!maraImgErr ? (
              <img
                src="/src/assets/images/circuit_maasai_mara_1795101040604.jpg"
                alt="Maasai Mara National Reserve savanna plains"
                referrerPolicy="no-referrer"
                onError={() => setMaraImgErr(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-50 to-emerald-50 flex items-center justify-center">
                <Compass className="w-8 h-8 text-emerald-700" />
              </div>
            )}
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Narok County Reserve · 3 Days · Peak Season Jul–Dec</div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">Maasai Mara Classic</h3>
            <p className="text-xs text-slate-600 mt-1">
              Daily park entry fees range from KES 1,500 (East African Citizens, low season) to USD 200 (International Visitors, peak season).
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          <div className="h-48 bg-slate-100 relative overflow-hidden">
            {!amboImgErr ? (
              <img
                src="/src/assets/images/circuit_amboseli_loop_1795101041669.jpg"
                alt="Amboseli National Park with Mount Kilimanjaro backdrop"
                referrerPolicy="no-referrer"
                onError={() => setAmboImgErr(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-sky-50 to-emerald-50 flex items-center justify-center">
                <Compass className="w-8 h-8 text-emerald-700" />
              </div>
            )}
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">KWS National Park · 4 Days · Peak Season Dec–Feb &amp; Jul–Oct</div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">Amboseli Kilimanjaro Loop</h3>
            <p className="text-xs text-slate-600 mt-1">
              Standard KWS park rates apply year-round, with 50% child lodge sharing rates and free park entry for children under 5.
            </p>
          </div>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Park Entry &amp; Lodge Rates</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Per-person daily park fees (Adult / Child) and nightly lodge rates used when calculating quotes.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setSeason("high")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                season === "high" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Peak Season
            </button>
            <button
              type="button"
              onClick={() => setSeason("low")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                season === "low" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Low Season
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3 font-medium">Safari Circuit</th>
                <th className="py-2 pr-3 font-medium">Park Authority</th>
                <th className="py-2 pr-3 font-medium text-right">Days</th>
                <th className="py-2 pr-3 font-medium text-right">Drive / Day</th>
                <th className="py-2 pr-3 font-medium text-right">Lodge / Night</th>
                <th className="py-2 pr-3 font-medium text-right">EA Citizen (KES)</th>
                <th className="py-2 pr-3 font-medium text-right">KE Resident (KES)</th>
                <th className="py-2 pr-3 font-medium text-right">African Citizen ($)</th>
                <th className="py-2 font-medium text-right">International ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {circuits.map((c) => {
                const eaA = season === "high" ? c.high_ea_citizen_adult_kes : c.low_ea_citizen_adult_kes;
                const eaC = season === "high" ? c.high_ea_citizen_child_kes : c.low_ea_citizen_child_kes;
                const keA = season === "high" ? c.high_ke_resident_adult_kes : c.low_ke_resident_adult_kes;
                const keC = season === "high" ? c.high_ke_resident_child_kes : c.low_ke_resident_child_kes;
                const afA = season === "high" ? c.high_af_citizen_adult_usd : c.low_af_citizen_adult_usd;
                const afC = season === "high" ? c.high_af_citizen_child_usd : c.low_af_citizen_child_usd;
                const nrA = season === "high" ? c.high_non_res_adult_usd : c.low_non_res_adult_usd;
                const nrC = season === "high" ? c.high_non_res_child_usd : c.low_non_res_child_usd;

                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      <div className="text-slate-500">{c.region}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{formatAuthority(c.authority_type)}</td>
                    <td className="py-2.5 pr-3 font-mono text-right tabular-nums text-slate-800">{c.days}</td>
                    <td className="py-2.5 pr-3 font-mono text-right tabular-nums text-slate-700">
                      {c.max_daily_drive_hours.toFixed(1)}h
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-right tabular-nums text-slate-900">
                      ${c.lodge_nightly_usd.toFixed(0)}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-right tabular-nums text-slate-800 whitespace-nowrap">
                      {eaA.toLocaleString()} / {eaC.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-right tabular-nums text-slate-800 whitespace-nowrap">
                      {keA.toLocaleString()} / {keC.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-right tabular-nums text-slate-800 whitespace-nowrap">
                      {afA} / {afC}
                    </td>
                    <td className="py-2.5 font-mono text-right tabular-nums text-slate-900 font-medium whitespace-nowrap">
                      {nrA} / {nrC}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
