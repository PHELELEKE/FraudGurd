/**
 * Small Civils and VZ Coatings are two companies run as one business. They share this one
 * system, but every request, order, invoice and alert says which of the two it belongs to.
 */
export const COMPANIES = ["small_civils", "vz_coatings"] as const;
export type Company = (typeof COMPANIES)[number];

export const COMPANY_LABEL: Record<Company, string> = {
  small_civils: "Small Civils",
  vz_coatings: "VZ Coatings",
};

export const COMPANY_SHORT: Record<Company, string> = {
  small_civils: "SC",
  vz_coatings: "VZ",
};

/** A dot colour only, never a filled badge, so it is never mistaken for a risk or status tag. */
export const COMPANY_COLOR: Record<Company, string> = {
  small_civils: "#F0B429",
  vz_coatings: "#38BDF8",
};

export function isCompany(v: unknown): v is Company {
  return v === "small_civils" || v === "vz_coatings";
}

export type CompanyFilter = "all" | Company;

/** Reads a ?company= URL parameter. Anything other than a known company means "All companies". */
export function parseCompanyFilter(v: string | undefined): CompanyFilter {
  return isCompany(v) ? v : "all";
}
