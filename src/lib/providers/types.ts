// Shared contract for people-data providers (Apollo, PDL, Coresignal).
// A single normalized row shape lets the UI treat every source the same and
// lets the registry dedupe the same person found by multiple providers.

export type ProviderName = 'apollo' | 'pdl' | 'coresignal'

// Parsed search intent. Current-role fields drive Apollo; the history fields
// (past_*, intern, experience_year) and person_name unlock PDL / Coresignal,
// which Apollo structurally can't search.
export interface SearchFilters {
  // Current role (Apollo-style)
  q_organization_name?: string | null
  person_titles?: string[] | null
  person_locations?: string[] | null
  organization_num_employees_ranges?: string[] | null
  industries?: string[] | null
  early_stage?: boolean | null
  q_keywords?: string | null
  // Employment-history intent (PDL / Coresignal)
  past_company?: string | null
  past_title?: string | null
  intern?: boolean | null
  experience_year?: number | null
  // A specific person named in the query
  person_name?: string | null
}

export interface ProviderPerson {
  provider: ProviderName
  providerId: string          // id used to enrich/reveal within that provider
  firstName: string
  lastName: string            // may be masked (Apollo) or full (PDL/Coresignal)
  lastNameMasked: boolean
  title: string
  company: string
  domain: string
  location: string
  linkedinUrl: string | null
  email: string | null
  revealed: boolean           // true when contact is already present (no reveal needed)
}

export interface PeopleProvider {
  name: ProviderName
  // Configured = its API key is present. Unconfigured providers are skipped.
  isConfigured(): boolean
  search(filters: SearchFilters, limit: number): Promise<ProviderPerson[]>
}
