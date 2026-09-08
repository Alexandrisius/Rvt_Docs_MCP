import { type DefaultTreeAdapterMap, parse } from "parse5";

type Element = DefaultTreeAdapterMap["element"];
type ChildNode = DefaultTreeAdapterMap["childNode"];
type TextNode = DefaultTreeAdapterMap["textNode"];
type CommentNode = DefaultTreeAdapterMap["commentNode"];

/**
 * Section labels that hold community content rather than API reference data.
 * They are skipped to keep the output deterministic and compact.
 *
 * "Discussion" is never server-rendered (comments.js loads it client-side behind
 * a login) and "Community Snippets" holds at most one pyRevit/Python card per
 * page, so both would only add noise.
 */
const SKIPPED_SECTION_LABELS = ["Discussion", "Community Snippets"];

/**
 * Label of the card that holds the official SDK code example. Unlike the two
 * above it contains real reference content, so it is opt-in rather than always
 * dropped: it costs ~350-450 tokens and exists on roughly half of all pages.
 */
const EXAMPLES_SECTION_LABEL = "Examples";

/**
 * Card classes that hold community content (discussion / snippet cards).
 */
const SKIPPED_CARD_CLASSES = ["cmt-card", "snip-doc-card"];

export interface ExtractDocsOptions {
  /**
   * Also extract the page's `Examples` card (official SDK sample code, C# tab
   * only). Defaults to false to keep responses token-cheap.
   */
  includeExamples?: boolean;
}

/**
 * Extracts Revit API documentation from rvtdocs.com HTML and converts it to
 * markdown. Anchors on stable card classes (headline-card, params-card,
 * exceptions-card, member-section-card, ...) instead of template comments so
 * minor template rewording does not break extraction.
 */
export async function extractRvtDocsText(
  url: string,
  options: ExtractDocsOptions = {},
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Page request failed: ${response.status} ${response.statusText}`,
    );
  }
  const html = await response.text();
  const doc = parse(html);

  const htmlElement = findElement(
    doc.childNodes,
    (node) => node.nodeName === "html",
  );
  if (!htmlElement) throw new Error("HTML element not found");

  // Scope to the main content area when the template comment is present.
  const mainContent =
    findElementAfterComment(htmlElement, "Main content") ?? htmlElement;

  const headline = find(mainContent, (el) => hasClass(el, "headline-card"));
  if (!headline) throw new Error("Main content section not found");

  let markdown = extractHeadline(headline);

  // Labeled reference sections: Syntax, Parameters, Exceptions, Methods, ...
  const renderedTables = new Set<Element>();
  const skippedLabels = options.includeExamples
    ? SKIPPED_SECTION_LABELS
    : [...SKIPPED_SECTION_LABELS, EXAMPLES_SECTION_LABEL];
  const labels = findAll(
    mainContent,
    (el) => hasClass(el, "card-toolbar-label"),
  );
  for (const labelEl of labels) {
    const label = cleanText(getText(labelEl)).replace(
      /\s*\(\d+\s+members?\)/i,
      "",
    );
    if (!label || skippedLabels.includes(label)) continue;

    const card = findParent(labelEl, (el) => hasClass(el, "card"));
    if (!card) continue;
    if (SKIPPED_CARD_CLASSES.some((cls) => hasClass(card, cls))) continue;

    markdown += extractSection(label, card, renderedTables);
  }

  // Tables that live outside labeled sections.
  const tables = findAll(mainContent, (el) => el.nodeName === "table");
  for (const table of tables) {
    if (renderedTables.has(table)) continue;
    renderedTables.add(table);
    const tableMarkdown = extractTable(table);
    if (tableMarkdown.trim()) {
      markdown += `\n${tableMarkdown}`;
    }
  }

  // A member with several overloads renders as a stub: it lists them but shows
  // no signatures, which used to cost a consumer one extra round trip per
  // overload before it could see them.
  if (isOverloadsStub(headline)) {
    markdown += await extractOverloadSignatures(mainContent, url);
  }

  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Extracts namespace, title, type, description, remarks and inheritance
 * hierarchy from the headline card.
 */
function extractHeadline(headline: Element): string {
  let markdown = "";

  const breadcrumb = find(headline, (el) => hasClass(el, "card-breadcrumb"));
  if (breadcrumb) {
    const links = findAll(breadcrumb, (el) => hasClass(el, "crumb-link"))
      .map((el) => cleanText(getText(el)))
      .filter((text) => text !== "");
    if (links.length > 0) {
      markdown += `**Namespace:** ${links[0]}\n\n`;
    }
    if (links.length > 1) {
      markdown += `**Declaring Type:** ${links.slice(1).join(".")}\n\n`;
    }
  }

  const titleCard = find(headline, (el) => hasClass(el, "card-title"));
  if (titleCard) {
    const h1 = find(titleCard, (el) => el.nodeName === "h1");
    if (h1) {
      markdown += `# ${cleanText(getText(h1))}\n\n`;
    }
  }

  const pageType = find(headline, (el) => hasClass(el, "crumb-pagetype"));
  if (pageType) {
    const type = cleanText(getText(pageType));
    if (type) {
      markdown += `**Type:** ${type}\n\n`;
    }
  }

  const description = find(headline, (el) => hasClass(el, "card-description"));
  if (description) {
    const html = extractHtmlContent(description)
      .replace(/<strong>Description:<\/strong>/i, "")
      .trim();
    if (html) {
      markdown += `## Description\n\n${htmlToMarkdown(html)}\n\n`;
    }
  }

  const remarks = find(headline, (el) => hasClass(el, "card-remarks"));
  if (remarks) {
    const html = extractHtmlContent(remarks)
      .replace(/<strong>Remarks:<\/strong>/i, "")
      .trim();
    if (html) {
      markdown += `## Remarks\n\n${htmlToMarkdown(html)}\n\n`;
    }
  }

  const hierarchy = find(headline, (el) => hasClass(el, "card-hierarchy"));
  if (hierarchy) {
    markdown += extractHierarchy(hierarchy);
  }

  return markdown;
}

/**
 * Renders the hierarchy card as a markdown section. On class pages it holds
 * the inheritance tree, on member pages an overloads list; tree glyphs that
 * end up on their own line are merged with the entry that follows.
 */
function extractHierarchy(hierarchy: Element): string {
  const raw = nodeToText(hierarchy);
  let label = "Hierarchy";
  let body = raw.replace(/Inheritance Hierarchy:\s*/i, "").trim();

  const overloadsMatch = body.match(/^Overloads\s*(\(\d+\))?\s*:?\s*/i);
  if (overloadsMatch) {
    label = "Overloads";
    body = body.slice(overloadsMatch[0].length);
  }

  const lines = body
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "");

  const merged: string[] = [];
  let pendingGlyph = "";
  for (const line of lines) {
    if (/^[└├│─\s]+$/.test(line)) {
      pendingGlyph += line.trim();
      continue;
    }
    merged.push(pendingGlyph ? `${pendingGlyph} ${line}` : line);
    pendingGlyph = "";
  }
  if (pendingGlyph) merged.push(pendingGlyph);

  if (merged.length === 0) return "";
  return `## ${label}\n\n${merged.join("\n")}\n\n`;
}

/**
 * How many overload pages a stub may expand into. Members with more overloads
 * than this are rare, and every one costs a fetch plus a syntax block.
 */
const MAX_OVERLOAD_PAGES = 10;

/**
 * True when the page is an overloads stub rather than a real member page. The
 * site says so in the breadcrumb's page-type chip.
 */
function isOverloadsStub(headline: Element): boolean {
  const pageType = find(headline, (el) => hasClass(el, "crumb-pagetype"));
  return pageType !== null &&
    cleanText(getText(pageType)).toLowerCase() === "overloads";
}

/**
 * Expands an overloads stub with each overload's C# signature.
 *
 * The links are read from the page instead of being reconstructed, because a
 * parameterless overload lives at a hashed slug
 * ("/2025/Autodesk.Revit.DB.Transaction.Start-1146fa87") that cannot be derived
 * from the member name. One unreachable overload is skipped rather than fatal,
 * so a stub still returns whatever it managed to collect.
 */
async function extractOverloadSignatures(
  mainContent: Element,
  pageUrl: string,
): Promise<string> {
  const url = new URL(pageUrl);
  const basePath = url.pathname;

  const seen = new Set<string>();
  const links: { label: string; href: string }[] = [];
  for (const anchor of findAll(mainContent, (el) => el.nodeName === "a")) {
    const href = (getAttr(anchor, "href") ?? "").split("#")[0];
    // Overloads of this member are exactly the links extending its own path:
    // "...Start(String)" for parameterised ones, "...Start-<hash>" for the rest.
    if (!href.startsWith(`${basePath}(`) && !href.startsWith(`${basePath}-`)) {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    links.push({ label: cleanText(getText(anchor)), href });
  }
  if (links.length === 0) return "";

  const picked = links.slice(0, MAX_OVERLOAD_PAGES);
  const settled = await Promise.allSettled(
    picked.map((link) => fetchSyntaxBlock(`${url.origin}${link.href}`)),
  );

  let signatures = "";
  settled.forEach((result, index) => {
    if (result.status !== "fulfilled" || result.value === null) return;
    const { label } = picked[index];
    signatures +=
      `### ${label.includes("(") ? label : `${label}()`}\n\n${result.value}\n\n`;
  });
  if (signatures === "") return "";

  if (links.length > picked.length) {
    signatures +=
      `_…and ${links.length - picked.length} more overload(s), not expanded._\n\n`;
  }
  return `## Overload Signatures\n\n${signatures}`;
}

/**
 * Fetches a page and returns only its Syntax code block, or null. The signature
 * is the single thing an overloads stub is missing, so nothing else is worth the
 * tokens here.
 */
async function fetchSyntaxBlock(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) return null;

  const doc = parse(await response.text());
  const htmlElement = findElement(
    doc.childNodes,
    (node) => node.nodeName === "html",
  );
  if (!htmlElement) return null;
  const mainContent =
    findElementAfterComment(htmlElement, "Main content") ?? htmlElement;

  const label = findAll(mainContent, (el) => hasClass(el, "card-toolbar-label"))
    .find((el) => cleanText(getText(el)).toLowerCase() === "syntax");
  if (!label) return null;
  const card = findParent(label, (el) => hasClass(el, "card"));
  if (!card) return null;

  const snippets = findAll(
    card,
    (el) => hasClass(el, "code-snippet") && !hasClass(el, "hidden"),
  );
  for (const snippet of snippets) {
    const codeElement = find(snippet, (el) => el.nodeName === "code");
    if (!codeElement) continue;
    const code = cleanCode(getText(codeElement));
    if (!code) continue;
    const language = languageFromCodeClass(getAttr(codeElement, "class") ?? "");
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }
  return null;
}

/**
 * Suggests the slug of an inherited member.
 *
 * "LocationPoint.Rotate" has no page of its own: Rotate is declared on Location.
 * The class page says so in the "Inherited From" column of its member tables, so
 * look there and hand back a slug that resolves. Best effort by design - any
 * failure returns null and the caller falls back to the plain error message.
 */
export async function suggestInheritedMemberSlug(
  pageUrl: string,
): Promise<string | null> {
  try {
    const url = new URL(pageUrl);
    const segments = url.pathname.split("/").filter((segment) => segment !== "");
    if (segments.length < 2) return null;

    const year = segments[0];
    const entityPath = decodeURIComponent(segments[segments.length - 1]);
    // Only "<Type>.<Member>" can be an inheritance problem; overloads and hashed
    // slugs are handled elsewhere.
    if (!entityPath.includes(".") || entityPath.includes("(")) return null;

    const member = entityPath.split(".").pop() ?? "";
    const typePath = entityPath.slice(0, entityPath.length - member.length - 1);
    if (!member || !typePath) return null;

    const classMarkdown = await extractRvtDocsText(
      `${url.origin}/${year}/${typePath}`,
    );

    const declaringType = findInheritedFrom(classMarkdown, member);
    if (!declaringType) return null;
    if (declaringType === typePath.split(".").pop()) return null;

    const namespace =
      classMarkdown.match(/\*\*Namespace:\*\*\s*(\S+)/)?.[1] ?? "";
    return `/${year}/${namespace ? `${namespace}.` : ""}${declaringType}.${member}`;
  } catch {
    return null;
  }
}

/**
 * Reads the "Inherited From" cell of a member's row in a class page's markdown.
 * That column only exists in some years, so the header decides whether the last
 * cell is a type name or merely the description - guessing here would produce a
 * confidently wrong slug.
 */
function findInheritedFrom(
  classMarkdown: string,
  member: string,
): string | null {
  const escaped = member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowPattern = new RegExp(`^[MP]\\s+${escaped}\\s*(?:\\(|$)`);

  let inTable = false;
  let inheritedColumn = -1;

  for (const line of classMarkdown.split("\n")) {
    if (!line.startsWith("|")) {
      inTable = false;
      inheritedColumn = -1;
      continue;
    }

    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.every((cell) => cell === "" || /^-{3,}$/.test(cell))) continue;

    if (!inTable) {
      inTable = true;
      inheritedColumn = cells.findIndex((cell) =>
        /^Inherited From$/i.test(cell)
      );
      continue;
    }

    if (inheritedColumn < 0 || cells.length <= inheritedColumn) continue;
    if (!rowPattern.test(cells[0])) continue;

    const declaringType = cells[inheritedColumn];
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(declaringType)) return declaringType;
  }
  return null;
}

/**
 * Renders one labeled section card (Syntax, Parameters, Exceptions, member
 * listings, ...) as markdown based on the content it holds.
 */
function extractSection(
  label: string,
  card: Element,
  renderedTables: Set<Element>,
): string {
  // Syntax: visible code snippets (active language tab, usually C#).
  const snippets = findAll(
    card,
    (el) => hasClass(el, "code-snippet") && !hasClass(el, "hidden"),
  );
  if (snippets.length > 0) {
    let markdown = `## ${label}\n\n`;
    let added = false;
    for (const snippet of snippets) {
      const codeElement = find(snippet, (el) => el.nodeName === "code");
      if (!codeElement) continue;
      const code = cleanCode(getText(codeElement));
      if (!code) continue;
      const language = languageFromCodeClass(
        getAttr(codeElement, "class") ?? "",
      );
      markdown += `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
      added = true;
    }
    if (added) return markdown;
  }

  // Examples: the official SDK sample code that ships with the page. C# only —
  // the Python tab is an AI translation of the very same sample and the VB tab
  // duplicates it, so emitting them would triple the cost for zero new
  // information. The class token differs from the Syntax card on purpose:
  // "example-code-snippet" must not match "code-snippet".
  const exampleSnippets = findAll(
    card,
    (el) => hasClass(el, "example-code-snippet"),
  );
  if (exampleSnippets.length > 0) {
    const csharpTabs = exampleSnippets.filter((el) =>
      (getAttr(el, "data-tab-index") ?? "").startsWith("C#")
    );
    // A page that ever ships an example without a C# tab still beats dropping
    // it: fall back to whichever tab the site renders by default.
    const picked = csharpTabs.length > 0
      ? csharpTabs
      : exampleSnippets.filter((el) => !hasClass(el, "hidden"));

    let markdown = `## ${label}\n\n`;
    let added = false;
    for (const snippet of picked) {
      const codeElement = find(snippet, (el) => el.nodeName === "code");
      if (!codeElement) continue;
      const code = cleanCode(getText(codeElement));
      if (!code) continue;
      const language = languageFromCodeClass(
        getAttr(codeElement, "class") ?? "",
      );
      markdown += `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
      added = true;
    }
    if (added) return markdown;
  }

  // Parameters and return value.
  const paramRows = findAll(card, (el) => hasClass(el, "param-row"));
  if (paramRows.length > 0) {
    let markdown = `## ${label}\n\n| Type | Name | Description |\n|---|---|---|\n`;
    for (const row of paramRows) {
      const type = cleanText(getTextCell(row, "param-type"));
      const name = cleanText(getTextCell(row, "param-name"));
      const description = cleanText(getTextCell(row, "param-desc"));
      markdown += `| \`${type}\` | \`${name}\` | ${description} |\n`;
    }
    const returnRow = find(card, (el) => hasClass(el, "return-row"));
    if (returnRow) {
      const type = cleanText(getTextCell(returnRow, "return-type"));
      const description = cleanText(getTextCell(returnRow, "return-desc"));
      markdown +=
        `\n**Return Value:** \`${type}\`${description ? ` — ${description}` : ""}\n`;
    }
    return `${markdown}\n`;
  }

  // Exceptions.
  const exceptionRows = findAll(card, (el) => hasClass(el, "exc-row"));
  if (exceptionRows.length > 0) {
    let markdown = `## ${label}\n\n| Exception | Condition |\n|---|---|\n`;
    for (const row of exceptionRows) {
      const name = cleanText(getTextCell(row, "exc-name"));
      const description = cleanText(getTextCell(row, "exc-desc"));
      markdown += `| \`${name}\` | ${description} |\n`;
    }
    return `${markdown}\n`;
  }

  // Member listings and other table-based sections.
  const tables = findAll(card, (el) => el.nodeName === "table");
  if (tables.length > 0) {
    let markdown = `## ${label}\n\n`;
    for (const table of tables) {
      renderedTables.add(table);
      markdown += `${extractTable(table)}\n`;
    }
    return markdown;
  }

  // Fallback: plain text of the section without the toolbar label.
  const text = cleanText(nodeToText(card))
    .replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "")
    .trim();
  return text ? `## ${label}\n\n${text}\n\n` : "";
}

/**
 * Markdown fence language for a `<code class="language-...">` element. The site
 * spells C# as "language-cs", so csharp is the default rather than a match.
 */
function languageFromCodeClass(codeClass: string): string {
  if (codeClass.includes("vb")) return "vbnet";
  if (codeClass.includes("cpp")) return "cpp";
  if (codeClass.includes("fs")) return "fsharp";
  if (codeClass.includes("py")) return "python";
  return "csharp";
}

function findElementAfterComment(
  node: ChildNode,
  commentText: string,
): Element | null {
  if (
    node.nodeName === "#comment" &&
    (node as CommentNode).data.includes(commentText)
  ) {
    if (node.parentNode) {
      const siblings = node.parentNode.childNodes;
      const index = siblings.indexOf(node);
      for (let i = index + 1; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling.nodeName !== "#text" && sibling.nodeName !== "#comment") {
          return sibling as Element;
        }
      }
    }
  }

  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      const result = findElementAfterComment(child, commentText);
      if (result) return result;
    }
  }
  return null;
}

function extractTable(table: Element): string {
  let markdown = "";

  const thead = find(table, (el) => el.nodeName === "thead");
  const tbody = find(table, (el) => el.nodeName === "tbody");

  if (thead) {
    const headerRow = find(thead, (el) => el.nodeName === "tr");
    if (headerRow) {
      const headers = findAll(headerRow, (el) => el.nodeName === "th").map(
        (el) => cleanText(getText(el)),
      );
      markdown += `| ${headers.join(" | ")} |\n`;
      markdown += `|${headers.map(() => "---").join("|")}|\n`;
    }
  }

  if (tbody) {
    const rows = findAll(tbody, (el) => el.nodeName === "tr");
    for (const row of rows) {
      const cells = findAll(row, (el) => el.nodeName === "td").map((el) =>
        cleanText(getText(el))
      );
      if (cells.length > 0) {
        markdown += `| ${cells.join(" | ")} |\n`;
      }
    }
  }

  return `${markdown}\n`;
}

// Consolidated helper functions
function find(
  element: Element | ChildNode,
  predicate: (el: Element) => boolean,
): Element | null {
  if (
    "nodeName" in element && element.nodeName !== "#text" &&
    element.nodeName !== "#comment"
  ) {
    const el = element as Element;
    if (predicate(el)) return el;
  }

  if ("childNodes" in element) {
    for (const child of element.childNodes) {
      const result = find(child, predicate);
      if (result) return result;
    }
  }
  return null;
}

function findElement(
  node: ChildNode | ChildNode[],
  predicate: (el: Element) => boolean,
): Element | null {
  const nodes = Array.isArray(node) ? node : [node];
  for (const n of nodes) {
    const result = find(n, predicate);
    if (result) return result;
  }
  return null;
}

function findAll(
  element: Element,
  predicate: (el: Element) => boolean,
): Element[] {
  const results: Element[] = [];

  if (predicate(element)) {
    results.push(element);
  }

  if (element.childNodes) {
    for (const child of element.childNodes) {
      if (child.nodeName !== "#text" && child.nodeName !== "#comment") {
        results.push(...findAll(child as Element, predicate));
      }
    }
  }
  return results;
}

function findParent(
  element: Element,
  predicate: (el: Element) => boolean,
): Element | null {
  let current = element.parentNode;
  while (current && "attrs" in current) {
    const el = current as Element;
    if (predicate(el)) return el;
    current = el.parentNode;
  }
  return null;
}

/**
 * Token-based class match: "code-snippet" must not match
 * "example-code-snippet" and "card-toolbar" must not match "card-toolbar-h".
 */
function hasClass(element: Element, className: string): boolean {
  const classAttr = element.attrs?.find((attr) => attr.name === "class")
    ?.value;
  if (!classAttr) return false;
  return classAttr.split(/\s+/).includes(className);
}

function getAttr(element: Element, name: string): string | undefined {
  return element.attrs?.find((attr) => attr.name === name)?.value;
}

function getText(node: ChildNode): string {
  if (node.nodeName === "#text") {
    return (node as TextNode).value;
  }
  if ("childNodes" in node) {
    return node.childNodes.map(getText).join("");
  }
  return "";
}

/**
 * Text content with <br> preserved as line breaks.
 */
function nodeToText(node: ChildNode): string {
  if (node.nodeName === "#text") {
    return (node as TextNode).value;
  }
  if (node.nodeName === "br") {
    return "\n";
  }
  if ("childNodes" in node) {
    return node.childNodes.map(nodeToText).join("");
  }
  return "";
}

/**
 * Text of the first descendant carrying the given class token.
 */
function getTextCell(row: Element, className: string): string {
  const cell = find(row, (el) => hasClass(el, className));
  return cell ? getText(cell) : "";
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Normalizes code block text without collapsing line breaks.
 */
function cleanCode(code: string): string {
  return code
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHtmlContent(element: Element): string {
  let html = "";
  if (element.childNodes) {
    for (const child of element.childNodes) {
      if (child.nodeName === "#text") {
        html += (child as TextNode).value;
      } else if (child.nodeName === "br") {
        html += "\n";
      } else if (child.nodeName === "strong") {
        html += `<strong>${getText(child)}</strong>`;
      } else if (["ul", "ol", "li", "p"].includes(child.nodeName)) {
        html += `<${child.nodeName}>${
          extractHtmlContent(child as Element)
        }</${child.nodeName}>`;
      } else {
        html += extractHtmlContent(child as Element);
      }
    }
  }
  return html;
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<p>/g, "")
    .replace(/<\/p>/g, "\n")
    .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
    .replace(/<ul>/g, "")
    .replace(/<\/ul>/g, "")
    .replace(/<ol>/g, "")
    .replace(/<\/ol>/g, "")
    .replace(/<li>(.*?)<\/li>/g, "- $1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .replace(/\n /g, "\n")
    .trim();
}
