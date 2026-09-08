export interface SearchResult {
  title: string;
  description?: string;
  namespace?: string;
  type: string;
  url: string;
  /**
   * Type that declares the member, when the source reports it. Lets an agent
   * address an inherited member on its declaring type instead of guessing why
   * "LocationPoint.Rotate" does not exist.
   */
  declaringType?: string;
  /** Only set when true, so the common case carries no extra noise. */
  isObsolete?: boolean;
}

export interface SearchResponseRvtDocsCom {
  results?: Array<{
    page_id?: string;
    year_version?: string;
    title?: string;
    type?: string;
    namespace?: string;
    headline_main?: string;
    declaring_type?: string;
    description?: string;
    is_obsolete?: boolean;
    url?: string;
  }>;
  total?: number;
}

export interface SearchResponseRevirApiDocsCom {
  sections?: {
    Products?: Array<{
      value: string;
      data: {
        description?: string;
        url: string;
        id: string;
        image_url?: string;
      };
      matched_terms?: string[];
    }>;
  };
}

export const SearchResultTypes = [
  "Class",
  "Constructor",
  "Method",
  "Methods",
  "Property",
  "Properties",
  "Interface",
  "Enumeration",
] as const;
