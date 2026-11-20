import { DEFAULT_DB_PATH, readConn, writeTx } from "./db.ts";
import {
  BookingConflictError,
  type CircuitRow,
  type FleetRow,
  type GuideRow,
  type QuoteResult,
  type QuoteSuccess,
  type ResidencyTier,
} from "./types.ts";

export { BookingConflictError };

export function getUsdToKes(): number {
  const raw = Number(process.env.USD_TO_KES_RATE ?? "129.5");
  return Number.isFinite(raw) && raw > 0 ? raw : 129.5;
}

export function validateIsoDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid ISO date format '${dateStr}'.`);
  }
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`Invalid calendar date '${dateStr}'.`);
  }
  return dt;
}

export function isHighSeason(startDateObj: Date, authorityType: CircuitRow["authority_type"]): boolean {
  const month = startDateObj.getUTCMonth() + 1;
  if (authorityType === "narok_reserve") {
    return month >= 7;
  }
  return month === 7 || month === 8 || month === 9 || month === 10 || month === 12 || month === 1 || month === 2;
}

export function computeEndDate(startDateObj: Date, days: number): string {
  const end = new Date(startDateObj.getTime());
  end.setUTCDate(end.getUTCDate() + Math.max(days - 1, 0));
  return end.toISOString().slice(0, 10);
}

export function allocateVehicles(
  availableVehicles: FleetRow[],
  totalPax: number
): { assigned: FleetRow[]; uncoveredPax: number } {
  let remaining = Math.max(Math.trunc(totalPax), 0);
  if (remaining === 0) {
    return { assigned: [], uncoveredPax: 0 };
  }

  const pool = availableVehicles
    .filter((v) => Number(v.tsv_licensed) === 1)
    .map((v) => ({ ...v }))
    .sort((a, b) => {
      if (b.max_pax !== a.max_pax) return b.max_pax - a.max_pax;
      return a.daily_rate_usd - b.daily_rate_usd;
    });

  const assigned: FleetRow[] = [];
  for (const v of pool) {
    if (remaining <= 0) break;
    const take = Math.min(v.max_pax, remaining);
    assigned.push({ ...v, assigned_pax: take });
    remaining -= take;
  }

  return { assigned, uncoveredPax: remaining };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function buildSafariQuote(params: {
  circuitQuery: string;
  adults: number;
  children?: number;
  infantsUnder5?: number;
  residencyTier?: ResidencyTier;
  startDate?: string;
  preferSeniorGuide?: boolean;
  discountPct?: number;
  dbPath?: string;
}): Promise<QuoteResult> {
  const {
    circuitQuery,
    adults,
    children = 0,
    infantsUnder5 = 0,
    residencyTier = "non_resident",
    startDate = "2026-12-15",
    preferSeniorGuide = false,
    discountPct = 0,
    dbPath = DEFAULT_DB_PATH,
  } = params;

  const fx = getUsdToKes();
  let startObj: Date;
  try {
    startObj = validateIsoDate(startDate);
  } catch {
    return { error: `Invalid start_date '${startDate}'. Expected valid ISO YYYY-MM-DD date.` };
  }

  const adultsI = Math.max(Math.trunc(adults), 0);
  const childrenI = Math.max(Math.trunc(children), 0);
  const infantsI = Math.max(Math.trunc(infantsUnder5), 0);
  const totalPax = adultsI + childrenI + infantsI;
  if (totalPax <= 0) {
    return { error: "Guest count must be at least 1." };
  }

  const q = circuitQuery.trim();

  const dbData = await readConn(async (conn) => {
    const circuitRow = await conn.get<CircuitRow>(
      `
      SELECT * FROM circuits
      WHERE LOWER(name) = LOWER(?)
         OR LOWER(code) = LOWER(?)
         OR LOWER(name) LIKE LOWER(?)
         OR LOWER(park_or_reserve) LIKE LOWER(?)
      ORDER BY
          CASE
              WHEN LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?) THEN 0
              WHEN LOWER(name) LIKE LOWER(?) THEN 1
              ELSE 2
          END,
          id ASC
      LIMIT 1
      `,
      q,
      q,
      `%${q}%`,
      `%${q}%`,
      q,
      q,
      `%${q}%`
    );

    if (!circuitRow) {
      const nameRows = await conn.all<{ name: string }>("SELECT name FROM circuits ORDER BY id");
      const names = nameRows.map((r) => r.name);
      return {
        circuitRow: undefined,
        names,
        freeVehicles: [] as FleetRow[],
        freeGuides: [] as GuideRow[],
        endDate: "",
      };
    }

    const days = Number(circuitRow.days);
    const endDate = computeEndDate(startObj, days);

    const freeVehicles = await conn.all<FleetRow>(
      `
      SELECT f.*
      FROM fleet f
      WHERE f.status = 'available'
        AND f.tsv_licensed = 1
        AND f.id NOT IN (
            SELECT va.vehicle_id
            FROM vehicle_allocations va
            WHERE va.status = 'active'
              AND NOT (va.end_date < ? OR va.start_date > ?)
        )
      `,
      startDate,
      endDate
    );

    const { assigned: tempAssigned } = allocateVehicles(freeVehicles, totalPax);
    const guidesRequired = Math.max(tempAssigned.length, 1);
    const guideFilter = preferSeniorGuide ? "AND g.tier = 'senior'" : "";

    const freeGuides = await conn.all<GuideRow>(
      `
      SELECT g.*
      FROM guides g
      WHERE g.status = 'available'
        ${guideFilter}
        AND g.id NOT IN (
            SELECT bg.guide_id
            FROM booking_guides bg
            JOIN bookings b ON b.id = bg.booking_id
            WHERE bg.status = 'active'
              AND b.status = 'confirmed'
              AND NOT (bg.end_date < ? OR bg.start_date > ?)
        )
      ORDER BY CASE WHEN g.tier = 'senior' THEN 0 ELSE 1 END, g.daily_rate_usd ASC
      LIMIT ?
      `,
      startDate,
      endDate,
      guidesRequired
    );

    return { circuitRow, names: [] as string[], freeVehicles, freeGuides, endDate };
  }, dbPath);

  if (!dbData.circuitRow) {
    return {
      error: `Unknown circuit '${circuitQuery}'. Available circuits: ${dbData.names.join(", ")}`,
      available_circuits: dbData.names,
    };
  }

  const circuit = dbData.circuitRow;
  const days = Number(circuit.days);
  const nights = Math.max(days - 1, 0);
  const endDate = dbData.endDate;
  const highSeason = isHighSeason(startObj, circuit.authority_type);
  const seasonLabel: "high" | "low" = highSeason ? "high" : "low";

  const { assigned: assignedVehicles, uncoveredPax } = allocateVehicles(dbData.freeVehicles, totalPax);
  const guidesRequired = Math.max(assignedVehicles.length, 1);
  const freeGuides = dbData.freeGuides;
  const guidesShortfall = Math.max(guidesRequired - freeGuides.length, 0);
  const leadGuide = freeGuides.length > 0 ? freeGuides[0] : null;

  const prefix = highSeason ? "high" : "low";
  let parkFeesUsd = 0;
  let parkFeesKes = 0;

  if (residencyTier === "ea_citizen" || residencyTier === "ke_resident") {
    const adultKes = Number(circuit[`${prefix}_${residencyTier}_adult_kes` as keyof CircuitRow]);
    const childKes = Number(circuit[`${prefix}_${residencyTier}_child_kes` as keyof CircuitRow]);
    parkFeesKes = round2((adultsI * adultKes + childrenI * childKes) * days);
    parkFeesUsd = round2(parkFeesKes / fx);
  } else {
    const tierKey = residencyTier === "af_citizen" ? "af_citizen" : "non_res";
    const adultUsd = Number(circuit[`${prefix}_${tierKey}_adult_usd` as keyof CircuitRow]);
    const childUsd = Number(circuit[`${prefix}_${tierKey}_child_usd` as keyof CircuitRow]);
    parkFeesUsd = round2((adultsI * adultUsd + childrenI * childUsd) * days);
    parkFeesKes = round2(parkFeesUsd * fx);
  }

  const vehicleTotalUsd = round2(assignedVehicles.reduce((acc, v) => acc + Number(v.daily_rate_usd) * days, 0));
  const guideTotalUsd = round2(freeGuides.reduce((acc, g) => acc + Number(g.daily_rate_usd) * days, 0));
  const lodgePaxEquivalent = adultsI + 0.5 * childrenI;
  const lodgeTotalUsd = round2(Number(circuit.lodge_nightly_usd) * nights * lodgePaxEquivalent);

  const grossTotalUsd = round2(vehicleTotalUsd + guideTotalUsd + lodgeTotalUsd + parkFeesUsd);
  const netTotalUsd = round2(grossTotalUsd * (1.0 - Number(discountPct) / 100.0));
  const netTotalKes = round2(netTotalUsd * fx);

  return {
    circuit,
    season: seasonLabel,
    start_date: startDate,
    end_date: endDate,
    days,
    nights,
    adults: adultsI,
    children: childrenI,
    infants_under_5: infantsI,
    total_pax: totalPax,
    residency_tier: residencyTier,
    assigned_vehicles: assignedVehicles,
    vehicle_codes: assignedVehicles.map((v) => v.code),
    uncovered_pax: uncoveredPax,
    assigned_guides: freeGuides,
    guide: leadGuide,
    guides_required: guidesRequired,
    guides_shortfall: guidesShortfall,
    discount_pct: Number(discountPct),
    fx_usd_to_kes: fx,
    breakdown_usd: {
      vehicles: vehicleTotalUsd,
      guide: guideTotalUsd,
      accommodation: lodgeTotalUsd,
      conservation_fees: parkFeesUsd,
    },
    breakdown_kes: {
      vehicles: round2(vehicleTotalUsd * fx),
      guide: round2(guideTotalUsd * fx),
      accommodation: round2(lodgeTotalUsd * fx),
      conservation_fees: parkFeesKes,
    },
    gross_total_usd: grossTotalUsd,
    quoted_total_usd: netTotalUsd,
    quoted_total_kes: netTotalKes,
  };
}

export function isQuoteSuccess(q: QuoteResult | null | undefined): q is QuoteSuccess {
  return Boolean(q && !("error" in q) && "circuit" in q);
}

export async function persistBookingTransaction(params: {
  threadId: string;
  quote: QuoteResult;
  status: "confirmed" | "held" | "rejected";
  customerName?: string | null;
  idempotencyKey?: string | null;
  dbPath?: string;
}): Promise<number | null> {
  const { threadId, quote, status, customerName = null, idempotencyKey = null, dbPath = DEFAULT_DB_PATH } = params;
  if (!isQuoteSuccess(quote)) return null;

  const { circuit, assigned_vehicles, assigned_guides, guide, vehicle_codes, start_date, end_date } = quote;
  const guides = assigned_guides.length > 0 ? assigned_guides : guide ? [guide] : [];
  const leadGuide = guides[0] ?? null;

  return writeTx(async (conn) => {
    if (status === "confirmed") {
      for (const v of assigned_vehicles) {
        const conflict = await conn.get(
          `
          SELECT 1 FROM vehicle_allocations
          WHERE vehicle_id = ?
            AND status = 'active'
            AND NOT (end_date < ? OR start_date > ?)
          LIMIT 1
          `,
          v.id,
          start_date,
          end_date
        );
        if (conflict) {
          throw new BookingConflictError(
            `Vehicle ${v.code} was allocated to another trip for ${start_date}..${end_date}.`
          );
        }
      }

      for (const g of guides) {
        const gConflict = await conn.get(
          `
          SELECT 1 FROM booking_guides bg
          JOIN bookings b ON b.id = bg.booking_id
          WHERE bg.guide_id = ?
            AND bg.status = 'active'
            AND b.status = 'confirmed'
            AND NOT (bg.end_date < ? OR bg.start_date > ?)
          LIMIT 1
          `,
          g.id,
          start_date,
          end_date
        );
        if (gConflict) {
          throw new BookingConflictError(
            `Guide ${g.name} was booked on another trip for ${start_date}..${end_date}.`
          );
        }
      }
    }

    const res = await conn.run(
      `
      INSERT INTO bookings (
          idempotency_key, thread_id, customer_name, circuit_id, vehicle_codes_json, guide_id,
          start_date, end_date, adults, children, infants_under_5, residency_tier,
          discount_pct, quoted_total_usd, quoted_total_kes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      idempotencyKey,
      threadId,
      customerName,
      circuit.id,
      JSON.stringify(vehicle_codes),
      leadGuide && status === "confirmed" ? leadGuide.id : null,
      start_date,
      end_date,
      quote.adults,
      quote.children,
      quote.infants_under_5,
      quote.residency_tier,
      quote.discount_pct,
      quote.quoted_total_usd,
      quote.quoted_total_kes,
      status
    );

    const bookingId = Number(res.lastInsertRowid);

    if (status === "confirmed") {
      for (const v of assigned_vehicles) {
        await conn.run(
          `
          INSERT INTO vehicle_allocations (
              booking_id, vehicle_id, start_date, end_date, assigned_pax, status
          ) VALUES (?, ?, ?, ?, ?, 'active')
          `,
          bookingId,
          v.id,
          start_date,
          end_date,
          v.assigned_pax ?? 1
        );
      }

      for (const g of guides) {
        await conn.run(
          `
          INSERT INTO booking_guides (
              booking_id, guide_id, start_date, end_date, status
          ) VALUES (?, ?, ?, ?, 'active')
          `,
          bookingId,
          g.id,
          start_date,
          end_date
        );
      }
    }

    return bookingId;
  }, dbPath);
}
