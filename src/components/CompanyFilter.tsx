import Link from "next/link";
import { COMPANIES, COMPANY_LABEL, COMPANY_COLOR, type CompanyFilter as Filter } from "@/lib/companies";

/**
 * "All companies / Small Civils / VZ Coatings" links for the top of a list page.
 * basePath is the page path; extraQuery carries any other filter already on the URL (e.g. show=all).
 */
export function CompanyFilterBar({ current, basePath, extraQuery = {} }: { current: Filter; basePath: string; extraQuery?: Record<string, string> }) {
  const href = (company: Filter) => {
    const params = new URLSearchParams(extraQuery);
    if (company !== "all") params.set("company", company);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="company-filter">
      <Link href={href("all")} aria-current={current === "all" ? "page" : undefined}>
        All companies
      </Link>
      {COMPANIES.map((c) => (
        <Link key={c} href={href(c)} aria-current={current === c ? "page" : undefined}>
          <span className="company-dot" style={{ background: COMPANY_COLOR[c] }} />
          {COMPANY_LABEL[c]}
        </Link>
      ))}
    </div>
  );
}
