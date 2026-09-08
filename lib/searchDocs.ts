import {
  type SearchResponseRevirApiDocsCom,
  type SearchResponseRvtDocsCom,
  type SearchResult,
  SearchResultTypes,
} from "../types/index.ts";
import { z } from "zod";

export async function searchWrapper(
  query: string,
  year: number,
  max: number,
  types: ReadonlyArray<(typeof SearchResultTypes)[number]> = SearchResultTypes,
): Promise<SearchResult[]> {
  // Query both sources in parallel. A failure of one source degrades the
  // result set but must not take down the whole search: only throw when
  // every source failed.
  const [rvtDocsResult, revitApiDocsResult] = await Promise.allSettled([
    searchRvtDocsCom(query, year, max * 2, types),
    searchRevitApiDocsCom(query, year, max * 2, types),
  ]);

  if (
    rvtDocsResult.status === "rejected" && revitApiDocsResult.status === "rejected"
  ) {
    throw rvtDocsResult.reason;
  }
  if (rvtDocsResult.status === "rejected") {
    console.error(
      "Warning: rvtdocs.com search failed, returning revitapidocs.com results only:",
      rvtDocsResult.reason,
    );
  }
  if (revitApiDocsResult.status === "rejected") {
    console.error(
      "Warning: revitapidocs.com search failed, returning rvtdocs.com results only:",
      revitApiDocsResult.reason,
    );
  }

  const results1 = rvtDocsResult.status === "fulfilled" ? rvtDocsResult.value : [];
  const results2 = revitApiDocsResult.status === "fulfilled"
    ? revitApiDocsResult.value
    : [];

  const allResults = [...results1, ...results2];
  const dedupedResults = dedupePageIdTwins(dedupeByUrl(allResults));
  const sortedResults = sortByType(dedupedResults);
  return sortedResults.slice(0, max);
}

function dedupeByUrl(results: SearchResult[]): SearchResult[] {
  const urlMap = new Map<string, SearchResult>();
  const countEmpty = (obj: SearchResult) =>
    Object.values(obj).filter((v) => v === "").length;

  for (const result of results) {
    const url = result.url;
    if (!urlMap.has(url)) {
      urlMap.set(url, result);
    } else {
      const existing = urlMap.get(url);
      if (existing && countEmpty(result) < countEmpty(existing)) {
        urlMap.set(url, result);
      }
    }
  }
  return Array.from(urlMap.values());
}

/**
 * A slug that is a bare page id instead of a readable path. The secondary
 * source only has page ids; those pages resolve on rvtdocs.com as well, but
 * they come back without a description and without a namespace.
 */
const PAGE_ID_SLUG =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPageIdResult(result: SearchResult): boolean {
  return PAGE_ID_SLUG.test(result.url.split("/").pop() ?? "");
}

/**
 * Last dotted segment of the entity a result points at, without an overload's
 * parameter list and without the type word the secondary source appends to its
 * titles. "/2025/Autodesk.Revit.DB.Wall.Create(Document,Curve)" and a page-id
 * result titled "Wall.Create Method" both yield "create".
 */
function memberNameOf(result: SearchResult): string {
  const stripOverload = (value: string) => value.replace(/\(.*\)\s*$/, "").trim();

  if (isPageIdResult(result)) {
    const withoutType = stripOverload(result.title).replace(
      /\s(?:Class|Methods?|Propert(?:y|ies)|Constructor|Interface|Enumeration)(?:\s+Member)?$/i,
      "",
    );
    return (withoutType.split(".").pop() ?? "").toLowerCase();
  }

  const slug = decodeURIComponent(result.url.split("/").pop() ?? "");
  return (stripOverload(slug).split(".").pop() ?? "").toLowerCase();
}

/**
 * Drops page-id results that duplicate a readable one.
 *
 * Both sources index the same entity, so a search often returns it twice: once
 * as "/2025/Autodesk.Revit.DB.ElementTransformUtils.RotateElement" with a
 * description, once as "/2025/<page-id>" without. The readable twin is strictly
 * more useful, so the page-id one goes - but only when the match is
 * unambiguous. "Create" exists on dozens of classes, so a bare member name with
 * several readable candidates keeps all of them instead of risking a real
 * entity. Page-id results with no readable twin survive on purpose: they are
 * the only way to reach a class's whole "Methods" or "Properties" listing page.
 */
function dedupePageIdTwins(results: SearchResult[]): SearchResult[] {
  const readable = results.filter((result) => !isPageIdResult(result));
  if (readable.length === 0) return results;

  const dropped = new Set<SearchResult>();
  for (const candidate of results) {
    if (!isPageIdResult(candidate)) continue;
    const name = memberNameOf(candidate);
    if (!name) continue;
    const twins = readable.filter((result) =>
      result.type === candidate.type && memberNameOf(result) === name
    );
    if (twins.length === 1) dropped.add(candidate);
  }

  return dropped.size > 0
    ? results.filter((result) => !dropped.has(result))
    : results;
}

function sortByType(results: SearchResult[]): SearchResult[] {
  const typeOrder = [
    "Class",
    "Methods",
    "Properties",
    "Constructor",
  ];

  return results.sort((a, b) => {
    const aIndex = typeOrder.indexOf(a.type);
    const bIndex = typeOrder.indexOf(b.type);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

/**
 * Searches Revit API documentation using the rvtdocs.com Search V2 API endpoint
 * (GET /search/v2/api/). The `fields` parameter is required: without it the
 * backend returns an empty result set.
 */
export async function searchRvtDocsCom(
  query: string,
  year: number,
  maxResults: number,
  types: ReadonlyArray<(typeof SearchResultTypes)[number]> = SearchResultTypes,
): Promise<SearchResult[]> {
  try {
    // Using the rvtdocs.com Search V2 API endpoint
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("v", year.toString());
    params.set("fields", "title");
    params.set("limit", maxResults.toString());
    params.set("source", "mcp");
    const searchUrl = `https://rvtdocs.com/search/v2/api/?${params.toString()}`;

    // Make the search request
    const response = await fetch(searchUrl);

    if (!response.ok) {
      throw new Error(
        `Search request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json() as SearchResponseRvtDocsCom;
    const results: SearchResult[] = [];

    // Parse the response based on the expected format
    if (data.results && Array.isArray(data.results)) {
      for (const item of data.results.slice(0, maxResults)) {
        const result: SearchResult = {
          title: item.title || "",
          description: (item.description || "").replace(
            /^Description:\s*/i,
            "",
          ),
          namespace: (item.namespace || "").replace(/^Namespace:\s*/i, ""),
          type: item.type || "",
          url: item.url || "",
        };
        // The endpoint also reports where a member is declared and whether it
        // is obsolete. Both save a consumer a round trip (and a wrong guess on
        // inherited members), so pass them through instead of dropping them.
        if (item.declaring_type) result.declaringType = item.declaring_type;
        if (item.is_obsolete) result.isObsolete = true;
        results.push(result);
      }
    }

    return results.filter((r) =>
      types.includes(r.type as (typeof SearchResultTypes)[number])
    );
  } catch (error) {
    console.error("Error searching Revit API docs using rvtdocs.com:", error);
    throw error;
  }
}

/**
 * Searches Revit API documentation using the www.revitapidocs.com search endpoint
 * This is necessary to keep because it makes "Properties" and "Methods" pages available
 */
export async function searchRevitApiDocsCom(
  query: string,
  year: number,
  maxResults: number,
  types: ReadonlyArray<(typeof SearchResultTypes)[number]> = SearchResultTypes,
): Promise<SearchResult[]> {
  try {
    // Construct the search URL with current timestamp
    const timestamp = Date.now();
    const searchUrl = `https://ac.cnstrc.com/autocomplete/${
      encodeURIComponent(query)
    }?query=${
      encodeURIComponent(query)
    }&autocomplete_key=key_yyAC1mb0cTgZTwSo&c=ciojs-2.1233.4&num_results=${maxResults}&i=d705c917-8e5a-491f-8bc4-9b43e78de48c&s=10&_dt=${timestamp}`;

    // Make the search request
    const response = await fetch(searchUrl);
    if (!response.ok) {
      throw new Error(
        `Search request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json() as SearchResponseRevirApiDocsCom;
    const results: SearchResult[] = [];

    if (data.sections?.Products) {
      for (const item of data.sections.Products) {
        if (TypeFromTitle.parse(item.value) !== "Members") {
          results.push({
            title: item.value,
            url: `/${year}/${item.data.url.split(".")[0]}`,
            type: TypeFromTitle.parse(item.value),
          });
        }
      }
    }

    return results.filter((r) =>
      types.includes(r.type as (typeof SearchResultTypes)[number])
    );
  } catch (error) {
    console.error(
      "Error searching Revit API docs using revitapidocs.com:",
      error,
    );
    throw error;
  }
}

const TypeFromTitle = z.string().transform((title) => {
  const parts = title.trim().split(/\s+/);
  const lastPart = parts[parts.length - 1];

  for (const t of [...SearchResultTypes, "Members"]) {
    if (lastPart === t) return t;
  }
  return "Unknown";
});
