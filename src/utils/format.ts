export function formatResidency(tier: string | null | undefined): string {
  switch (tier) {
    case "ea_citizen":
      return "East African Citizen";
    case "ke_resident":
      return "Kenya Resident";
    case "af_citizen":
      return "African Citizen";
    case "non_resident":
      return "International Visitor";
    default:
      return "International Visitor";
  }
}

export function formatParty(adults: number, children: number, infants: number): string {
  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults} ${adults === 1 ? "Adult" : "Adults"}`);
  if (children > 0) parts.push(`${children} ${children === 1 ? "Child" : "Children"}`);
  if (infants > 0) parts.push(`${infants} ${infants === 1 ? "Infant" : "Infants"}`);
  return parts.length > 0 ? parts.join(", ") : "0 Guests";
}

export function formatAuthority(authority: string): string {
  switch (authority) {
    case "narok_reserve":
      return "Narok County Reserve";
    case "kws_park":
      return "KWS National Park";
    case "conservancy":
      return "Private / County Conservancy";
    default:
      return authority.replaceAll("_", " ");
  }
}

export function formatMissingField(field: string): string {
  switch (field) {
    case "circuit_name":
      return "Destination or safari circuit (e.g. Maasai Mara, Amboseli)";
    case "adults":
      return "Number of adult travelers";
    case "valid_start_date_YYYY_MM_DD":
      return "Valid travel start date (YYYY-MM-DD)";
    default:
      return field.replaceAll("_", " ");
  }
}

export function formatStepName(nodeName: string): string {
  switch (nodeName) {
    case "intake":
      return "Inquiry Read";
    case "clarification":
      return "Follow-up Requested";
    case "specialist":
      return "Pricing & Availability";
    case "critic":
      return "Policy Review";
    case "human_approval":
      return "Manager Decision";
    case "finalizer":
      return "Booking Finalized";
    default:
      return nodeName.replaceAll("_", " ");
  }
}
