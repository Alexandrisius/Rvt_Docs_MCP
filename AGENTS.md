# AGENTS.md — Rvt_Docs_MCP (maintained fork)

Instructions for AI agents and humans working in this repository.
**Read this file completely before changing any code.** It contains the project's
purpose, the contract that downstream users depend on, the exact build/verify/release
commands, and the failure modes we have already lived through.

---

## 1. What this project is

An **MCP server** (Deno + TypeScript, stdio transport) that gives AI agents reliable
access to **Revit API reference documentation**.

It scrapes two documentation sites — `rvtdocs.com` and `revitapidocs.com` — and
converts their HTML into compact, agent-friendly markdown: C# syntax only,
Parameters / Exceptions / Return Value as tables, inheritance hierarchy, overload
trees, member listings.

**What it is NOT:**

- **No LLM and no built-in knowledge.** It is a stateless network scraper/normalizer.
  If the answer is not on those two sites, the server cannot produce it.
- **No database, no cache.** Every call goes to the network (see §10 for why this is
  the biggest resilience risk).
- **No code examples.** The sites' `Examples`, `Community Snippets` and `Discussion`
  cards are dropped on purpose (`lib/extractDocs.ts`, `SKIPPED_SECTION_LABELS`).
  Examples must come from elsewhere (web search, The Building Coder, `search-library`).

**Why it exists at all:** the Revit API surface is enormous and niche, so models
hallucinate classes, methods and even namespaces. A tool that returns the *actual*
signature, the *actual* exceptions and the *actual* version availability removes most
of that guesswork while costing ~600 tokens for a method page instead of ~50k for the
raw HTML (~13x compression measured on `Autodesk.Revit.DB.Wall`).

## 2. Why this FORK exists

| | |
|---|---|
| Upstream | [kaitpw/Rvt_Docs_MCP](https://github.com/kaitpw/Rvt_Docs_MCP) — inactive since August 2025 |
| What broke | Around **4–5 September 2026** rvtdocs.com migrated to a new **"Search V2"** backend and re-templated every documentation page |
| Symptoms | `search-docs` / `retrieve-docs` → `404 Not Found` (the old `POST /search/api/search` endpoint was removed); `retrieve-doc` → `Main content section not found` |
| Why it was sneaky | The server still started and its tools still looked alive. Nothing failed until the first actual call |
| Fix | commit `42b3bfa` — *fix: adapt to rvtdocs.com Search V2 API and redesigned page layout* |
| Upstream report | [kaitpw/Rvt_Docs_MCP#3](https://github.com/kaitpw/Rvt_Docs_MCP/issues/3) — full analysis + proposed fix, PR offered |
| Consequence | **All binaries built before that date are broken**, including every asset in the upstream releases. This fork's releases (`v1.0.6`+) are the working distribution |

## 3. Hard facts

| Parameter | Value |
|---|---|
| Default branch | `master` (not `main`) |
| Runtime | Deno 2.x (`deno --version` → 2.9.6 verified) |
| Protocol | MCP over **stdio**, newline-delimited JSON-RPC |
| `serverInfo` | name `revit-docs-mcp`, version `1.0.0` (hardcoded in `main.ts`, **not** bumped per release — known debt, §10) |
| Tools exposed | `search-docs`, `retrieve-doc`, `retrieve-docs` |
| Tool gated | `search-library` — registered **only** if both `OPENAI_API_KEY` and `OPENAI_VECTOR_STORE_ID` are set (env or `-k` / `-v` flags) |
| Doc sources | `rvtdocs.com` (primary, Search V2) + `revitapidocs.com` (secondary) |
| Revit versions | **2020–2027**, default 2025 (`lib/toolsCommon.ts`) |
| Binary size | ~93 MB Windows / ~93 MB macOS-x64 / ~82 MB macOS-arm64 |
| CI | GitHub Actions, `.github/workflows/deno.yml`, triggers on tag `v*` |
| Tests | **none automated** — verification is manual (§6) |
| License | none declared upstream; the search APIs were reverse-engineered from the network console. See the licensing note at the bottom of `README.md` before redistributing |

## 4. Repository map

| Path | Responsibility | Care level |
|---|---|---|
| `main.ts` | CLI arg parsing (`-k`, `-v`, `-h`), env reading, tool registration, stdio transport | Medium — touches startup; remember stdout is the protocol channel (§5, I-07) |
| `lib/toolsCommon.ts` | Shared zod schemas: `queryString`, `queryTypes`, `year` (2020–2027), `maxResults` (1–50, default 10) | **High** — these descriptions are the only documentation an agent sees |
| `lib/searchDocs.ts` | Both search sources, `Promise.allSettled`, dedupe by URL, sort by type, slice | **High** — contains the Search V2 endpoint and the mandatory `fields` param |
| `lib/extractDocs.ts` | HTML → markdown. parse5 DOM walk, section cards, syntax, parameters, exceptions, hierarchy/overloads, `SKIPPED_SECTION_LABELS` | **Highest** — the most fragile file; breaks whenever the site re-templates |
| `lib/searchVectorLibrary.ts` | OpenAI vector-store search for `search-library` | Low (gated feature) |
| `tools/*.ts` | One file per MCP tool: schema + handler wiring | Medium |
| `types/index.ts` | Response shapes of both sites (`SearchResponseRvtDocsCom`, `SearchResponseRevirApiDocsCom`, `SearchResult`, `SearchResultTypes`) | **High** — must match live site responses |
| `deno.json` | Tasks (`dev`, `compile`), imports (MCP SDK, openai, std/cli, std/dotenv, parse5, zod) | Medium |
| `.github/workflows/deno.yml` | Matrix build (windows / macos-x64 / macos-arm64) + release | Medium — a tag push **publishes a public release** |
| `README.md` | Public entry point: fork notice, features, tools, setup, opencode config | Keep accurate |
| `docs/INSTALL-opencode-ru.md`, `docs/INSTALL-opencode-en.md` | Step-by-step install guide for opencode users (RU / EN) | Keep in sync with reality |
| `AGENTS.md` | This file | Update when behaviour changes |
| `.gitignore` | `Rvt_Docs_MCP*`, `.env`, `node_modules/*` — **binaries never in git** | Do not weaken |

## 5. Invariants — the contract you must not break

Downstream users paste tool names and parameter rules into their own `AGENTS.md`
files. Breaking these silently breaks their agents.

- **I-01 — Tool names and parameters are public API.** `search-docs(queryString,
  queryTypes?, year?, maxResults?)`, `retrieve-doc(urlSlug)`,
  `retrieve-docs(queryString, queryTypes?, year?, maxResults?)`. Renaming a tool or a
  parameter is a breaking change: it requires a major version bump and a release note.
- **I-02 — `queryString` is an entity name, not natural language.** Valid: `Wall`,
  `ElementTransformUtils.MoveElement`, `ConnectorManager`, `Constructor(arg1, arg2)`.
  `Class.Member` works only for `year >= 2025`. The zod `.describe(...)` text is the
  only place an agent learns this — keep it precise.
- **I-03 — `retrieve-docs` takes `queryString`, NOT a list of URLs.** It means "search,
  then fetch the full docs of what was found". Agents constantly assume otherwise; do
  not turn it into a URL-list tool without a new tool name.
- **I-04 — `year` range lives in exactly one place** (`lib/toolsCommon.ts`,
  `z.number().min(2020).max(2027)`). Do not hardcode years elsewhere.
- **I-05 — Responses stay token-cheap.** Markdown with tables, C# syntax only,
  community cards skipped. Any feature that can inflate a response (examples, all
  language tabs, full member docs) must be **opt-in per call**, never default.
- **I-06 — Partial failure must not fail the whole call.** Search sources are queried
  with `Promise.allSettled` and only throw when *every* source failed; `retrieve-docs`
  wraps each page in `try/catch` so one unreachable page does not discard the pages
  already fetched. `retrieve-doc` (single page) *may* throw — that is intended.
- **I-07 — stdout belongs to JSON-RPC only.** Never write logs to stdout from
  `lib/` or `tools/`. Known existing debt: `main.ts` emits three informational lines
  via `console.info` (`Using OpenAI API Key: …`, `Using Vector Store ID: …`,
  `Revit API Docs MCP Server is running...`) which land on **stdout**. Lenient clients
  (opencode) skip non-JSON lines; a strict client could fail the handshake. Do not add
  more; the fix is to route them to `console.error`.
- **I-08 — No secrets in the repository.** OpenAI key and vector-store id come from
  environment variables or `-k` / `-v`. `.env` is gitignored; keep it that way.
- **I-09 — Binaries are never committed.** `.gitignore` has `Rvt_Docs_MCP*`. Release
  assets are produced by CI, not uploaded from a working tree.
- **I-10 — Do not push tags without an explicit instruction.** Any tag matching `v*`
  triggers CI and **publishes a public release**. Tags `v1.0.0`–`v1.0.5` already exist
  (inherited from upstream at fork time, no assets). Next version after `v1.0.6` is
  `v1.0.7`.

## 6. Build, verify, release — exact commands

### Prerequisites

```bash
winget install DenoLand.Deno     # Windows; then open a NEW terminal (PATH refresh)
deno --version                   # expect deno 2.x.x (stable, release, x86_64-pc-windows-msvc)
```

### Type-check and build

```bash
deno check main.ts                                             # expect exit code 0, no type errors
deno task dev                                                  # MCP inspector + HMR (localhost)
deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts      # local Windows binary
deno compile -A --output Rvt_Docs_MCP main.ts                  # macOS / Linux
./Rvt_Docs_MCP-windows.exe -h                                  # prints the help menu, exits 0
```

`deno task compile` also works but names the binary after the entrypoint (`main.exe`) —
always pass `--output` explicitly.

### Verify functionally (there is no test suite — this IS the test)

Running the executable in a terminal is useless except for `-h`: it is a stdio server.
To exercise the tools, drive it over stdio with newline-delimited JSON-RPC. Minimal
Node client (keep stdin **open** — if stdin hits EOF the process exits and in-flight
requests are dropped, which looks like a false failure):

```js
const { spawn } = require("child_process");
const p = spawn(process.argv[2], [], { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
p.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line.startsWith("{")) continue;              // skip the informational lines (I-07)
    const msg = JSON.parse(line);
    if (msg.id === 2) console.log("TOOLS:", msg.result.tools.map((t) => t.name).join(", "));
    if (msg.id === 3) console.log("SEARCH:", msg.result.content[0].text.slice(0, 200));
    if (msg.id === 4) console.log("RETRIEVE len:", msg.result.content[0].text.length);
  }
});
p.stderr.on("data", (d) => process.stderr.write("[stderr] " + d));
const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1.0" } } });
setTimeout(() => send({ jsonrpc: "2.0", method: "notifications/initialized" }), 800);
setTimeout(() => send({ jsonrpc: "2.0", id: 2, method: "tools/list" }), 1500);
setTimeout(() => send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search-docs", arguments: { queryString: "Wall", year: 2025, maxResults: 2 } } }), 2500);
setTimeout(() => send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "retrieve-doc", arguments: { urlSlug: "/2025/Autodesk.Revit.DB.Wall.Create(Document,Curve,ElementId,ElementId,Double,Double,Boolean,Boolean)" } } }), 12000);
setTimeout(() => { p.kill(); process.exit(0); }, 40000);
```

**Expected output on a healthy build** (measured on `v1.0.6`):

```
TOOLS: search-docs, retrieve-docs, retrieve-doc
SEARCH: [{"title":"Wall Class","description":"Represents a wall in Autodesk Revit.","namespace":"Autodesk.Revit.DB","type":"Class","url":"/2025/Autodesk.Revit.DB.Wall"} …
RETRIEVE len: 2425
```

The retrieved page must contain `## Parameters`, `## Exceptions`,
`**Return Value:** \`Wall\``, the `public static Wall Create(` C# block and the
`## Overloads` tree. `search-library` is absent unless both OpenAI variables are set —
that is correct, not a bug.

Also worth checking: `year: 2020` and `year: 2027` both return valid slugs.

### Verify inside a real client (opencode)

Create `opencode.json` in any project, put the binary in `tools/`, then:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "revit-api-docs": { "type": "local", "command": ["tools/Rvt_Docs_MCP-windows.exe"], "enabled": true }
  }
}
```

```bash
opencode mcp list     # expect: ✓ revit-api-docs connected
```

Project-relative paths resolve from the project root, so this config is committable
while the binary stays untracked. **Restart the client after editing the config** —
running sessions do not pick up new servers.

### Publish a release

```bash
git tag -a v1.0.7 -m "v1.0.7 - <what changed>"
git push origin master
git push origin v1.0.7          # push the tag explicitly; --follow-tags would also work
gh run list --repo Alexandrisius/Rvt_Docs_MCP --limit 3
gh run watch <run-id> --repo Alexandrisius/Rvt_Docs_MCP --exit-status
```

CI builds all three targets (~1–2 min) and creates the release. **Two gotchas:**

1. The release body is created **empty** by `softprops/action-gh-release`. Always fill
   it in afterwards: `gh release edit v1.0.7 --notes-file notes.md`.
2. **Re-verify the CI artifact**, do not trust the local build — compile environments
   differ. Download the asset (`gh release download v1.0.7 --pattern
   "Rvt_Docs_MCP-windows.exe" --dir <tmp>`) and run the stdio smoke client above
   against it. For `v1.0.6` the CI artifact answered byte-identically to the local
   build (`RETRIEVE len: 2425`).

## 7. Failure modes and diagnostics

| Symptom | Cause | Where to look |
|---|---|---|
| `404 Not Found` from `search-docs` | rvtdocs.com changed its search endpoint again | `lib/searchDocs.ts` → `searchRvtDocsCom`; open the site's devtools network tab and re-read the real endpoint |
| HTTP 200 but **empty** result set | the mandatory `fields` parameter is missing/wrong | `params.set("fields", "title")` — without it the Search V2 backend returns nothing |
| `Main content section not found` | page layout re-templated, the headline anchor no longer matches | `lib/extractDocs.ts` — it anchors on stable CSS classes, not HTML comments; re-inspect the markup and update the class names |
| Sections silently missing (e.g. no Exceptions) | card class renamed, or the label landed in `SKIPPED_SECTION_LABELS` | `extractSection` + `SKIPPED_SECTION_LABELS` |
| Results without descriptions | one source returns a thinner record; dedupe keeps the record with fewer empty fields | `dedupeByUrl` in `lib/searchDocs.ts`, shapes in `types/index.ts` |
| Only one source's results | the other source is down — by design (I-06), a warning goes to stderr | `searchWrapper` |
| `search-library` missing | `OPENAI_API_KEY` / `OPENAI_VECTOR_STORE_ID` not both set | `main.ts` |
| Client handshake fails / hangs | non-JSON on stdout (I-07), or the OS blocked an unsigned binary | run the smoke client and look at raw stdout; on Windows check "Unblock" in file properties |
| A specific `year` returns nothing | outside site coverage (2020–2027) | `lib/toolsCommon.ts` |
| `retrieve-doc` on an overload fails | slug must be the exact string from search results, including the parenthesised parameter list | pass `url` from `search-docs` verbatim |

**If the site moved again:** reproduce with the smoke client, capture the failing raw
response, fix the endpoint or selectors, `deno check`, re-run the smoke client, then
release a new tag. Update §2 of this file and the fork notice in `README.md`, and tell
upstream.

## 8. How the pipeline works (so you can fix it)

**Search (`lib/searchDocs.ts`)**

1. Query both sources in parallel with `Promise.allSettled`, each asking for `max * 2`
   results. Throw only if *both* rejected; otherwise warn on stderr and continue.
2. rvtdocs.com: `GET https://rvtdocs.com/search/v2/api/?q=<query>&v=<year>&fields=title&limit=<n>&source=mcp`
3. Concatenate → `dedupeByUrl` (keeps the record with fewer empty fields) →
   `sortByType` (Class, Methods, Properties, Constructor first) → `slice(0, max)`.

**Extraction (`lib/extractDocs.ts`, parse5)**

1. Find the headline card; if absent → `Main content section not found`.
2. Walk labeled section cards (`Syntax`, `Parameters`, `Exceptions`, member lists, …),
   skipping labels in `SKIPPED_SECTION_LABELS` = `["Discussion", "Community Snippets",
   "Examples"]` and community card classes.
3. `Syntax` → the code block of the *active* language tab (C# in practice); VB / C++ /
   F# tabs are dropped.
4. Parameters table + `return-row` (`return-type` / `return-desc`) → `**Return Value:**`.
5. Exceptions table, member tables, then tables living outside labeled sections.
6. The hierarchy card renders as `## Hierarchy` on class pages and as `## Overloads` +
   an overload list on member pages (detected by an `Overloads (n):` prefix regex).
7. Collapse 3+ consecutive newlines and trim.

## 9. Documentation map

| Document | Audience |
|---|---|
| `README.md` | everyone — fork notice, features, tools, setup, opencode config |
| `docs/INSTALL-opencode-en.md` | opencode users, beginner-level, step-by-step (English) |
| `docs/INSTALL-opencode-ru.md` | the same guide in Russian |
| `AGENTS.md` (this file) | agents and contributors working on the code |
| Release notes (`v1.0.6`+) | what broke, what was fixed, what was verified |
| [kaitpw/Rvt_Docs_MCP#3](https://github.com/kaitpw/Rvt_Docs_MCP/issues/3) | the Search V2 root-cause analysis |

Keep the two install guides **in sync**: they are translations of each other. If you
change a command, a config sample or a troubleshooting row in one, change it in the
other.

## 10. Known debt and roadmap

Ordered by value. Nothing here is started — pick it up only with an explicit instruction.

1. **stdout hygiene (I-07)** — move the three `console.info` lines in `main.ts` to
   stderr. Small change, removes a real interoperability risk with strict MCP clients.
2. **Response caching / offline snapshot** — the top resilience risk: the project has
   already been broken once by an upstream site change, and every call hits the
   network. A local cache (or a bundled snapshot for common entities) would survive the
   next migration. Upstream marked caching "unlikely"; that judgement predates the
   September 2026 breakage.
3. **Code examples** — the sites have very few, and the ones they have are dropped by
   design (I-05). Upstream's planned approach is a vector store over RevitSdkSamples
   and community repos. A promising alternative is a store of *verified* snippets
   contributed by agents after a successful run. Must stay opt-in per call.
4. **`serverInfo.version` is hardcoded to `1.0.0`** in `main.ts` while releases are
   `v1.0.6`+. Bump it (or derive it) so clients can tell builds apart.
5. **No Linux target** in the CI matrix (`windows`, `macos-x64`, `macos-arm64` only).
6. **No automated tests.** The stdio smoke client in §6 is a candidate for a
   `deno task smoke` that runs against a recorded fixture, so regressions in
   `extractDocs.ts` are caught without depending on a live site.
7. **Upstream PR** for [kaitpw/Rvt_Docs_MCP#3](https://github.com/kaitpw/Rvt_Docs_MCP/issues/3)
   — offered, not merged.

## 11. Conventions

- Deno 2 + TypeScript. Schemas via `zod`, HTML via `parse5`. Do not add dependencies
  without a concrete need; `deno.lock` must stay consistent.
- Comments explain **why**, not what — especially for fragile selectors, mandatory
  query parameters and site-specific quirks. The existing comments in
  `lib/searchDocs.ts` and `lib/extractDocs.ts` are the model to follow.
- User-facing text (README, release notes, tool descriptions, errors) is in **English**.
  The Russian install guide is the only intentional exception.
- Commit style: Conventional Commits — `fix:`, `feat:`, `docs:`, `chore:`.
- Never commit binaries, `.env`, or secrets (I-08, I-09).

## 12. Quick start for an agent with zero context

1. Read `README.md` §Overview and §Tools — learn what the server promises.
2. Read this file, §5 (invariants) and §7 (failure modes) at minimum.
3. Confirm the toolchain: `deno --version`, then `deno check main.ts` (exit 0).
4. Baseline the behaviour: run the §6 stdio smoke client and record the output **before**
   changing anything, so you can tell your change from pre-existing behaviour.
5. Make the smallest change that fixes the problem. If it touches `lib/extractDocs.ts`
   or `lib/searchDocs.ts`, re-read §8 first.
6. Re-run `deno check` and the smoke client. Compare with the baseline from step 4.
7. Do not create tags, releases, branches or PRs unless explicitly asked (I-10).
8. If you changed behaviour, update `README.md`, both install guides and §2/§7/§10 of
   this file in the same commit.
