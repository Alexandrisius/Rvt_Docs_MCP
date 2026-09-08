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
trees **plus each overload's own C# signature**, member listings.

**What it is NOT:**

- **No LLM and no built-in knowledge.** It is a stateless network scraper/normalizer.
  If the answer is not on those two sites, the server cannot produce it.
- **No database, no cache.** Every call goes to the network (see §10 for why this is
  the biggest resilience risk).
- **No community content.** The sites' `Discussion` and `Community Snippets` cards are
  dropped on purpose (`lib/extractDocs.ts`, `SKIPPED_SECTION_LABELS`): the discussion
  is not server-rendered at all (the page loads comments via JS behind a login) and
  the snippets amount to 0–1 pyRevit/Python card per page. The official SDK `Examples`
  card *is* extracted, but only on request — `includeExamples: true`, off by default
  (I-05). Broader examples must come from elsewhere (web search, The Building Coder,
  `search-library`); bundling a third-party example corpus into this server is
  explicitly rejected — see the "Rejected" record in §10.

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
| `serverInfo` | name `revit-docs-mcp`, version `1.0.9` — hardcoded in `main.ts`, **bump it before every tag** (builds up to `v1.0.6` reported `1.0.0`, so clients could not tell them apart) |
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
| `lib/toolsCommon.ts` | Shared zod schemas: `queryString`, `queryTypes`, `urlSlug` (its exact shape is spelled out in the `.describe()` text, and so is why the plural `queryTypes` values cannot enumerate a class's members), `year` (2020–2027), `maxResults` (1–50, default 10), `includeExamples` (default false) | **High** — these descriptions are the only documentation an agent sees |
| `lib/searchDocs.ts` | Both search sources, `Promise.allSettled`, `dedupeByUrl` → `dedupePageIdTwins` (drops the bare page-id twin of a readable result; helpers `PAGE_ID_SLUG`, `memberNameOf`), `declaringType` / `isObsolete` passthrough, sort by type, slice | **High** — contains the Search V2 endpoint and the mandatory `fields` param |
| `lib/extractDocs.ts` | HTML → markdown. parse5 DOM walk, section cards, syntax, opt-in `Examples`, parameters, exceptions, hierarchy/overloads, overload-signature expansion of stub pages (`isOverloadsStub`, `extractOverloadSignatures`, `fetchSyntaxBlock`, `MAX_OVERLOAD_PAGES`), inherited-member slug suggestion (`suggestInheritedMemberSlug`, `findInheritedFrom`), `SKIPPED_SECTION_LABELS` + `EXAMPLES_SECTION_LABEL` | **Highest** — the most fragile file; breaks whenever the site re-templates |
| `lib/searchVectorLibrary.ts` | OpenAI vector-store search for `search-library` | Low (gated feature) |
| `tools/*.ts` | One file per MCP tool: schema + handler wiring. `retrieve-doc.ts` also owns the 404 path — it appends the declaring type's slug via `suggestInheritedMemberSlug` | Medium |
| `types/index.ts` | Response shapes of both sites (`SearchResponseRvtDocsCom`, `SearchResponseRevirApiDocsCom`, `SearchResult`, `SearchResultTypes`). `SearchResult` carries two optional fields: `declaringType` (the type that declares a member) and `isObsolete` (set **only** when true, so the common case has no extra noise) | **High** — must match live site responses |
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
  queryTypes?, year?, maxResults?)`, `retrieve-doc(urlSlug, includeExamples?)`,
  `retrieve-docs(queryString, queryTypes?, year?, maxResults?, includeExamples?)`.
  Renaming a tool or a parameter is a breaking change: it requires a major version bump
  and a release note. Adding an *optional* parameter with a default that preserves the
  old behaviour (as `includeExamples: false` did) is not breaking.
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
  `includeExamples` is the reference implementation of this rule: the official C#
  example costs ~350-450 tokens and exists on ~50% of pages, so it defaults to `false`
  and the VB / AI-translated Python tabs of the same sample are never emitted.
  **One bounded exception (`v1.0.8`):** an overloads *stub* page is enriched with each
  overload's C# signature (`## Overload Signatures`) without the caller asking. It is
  capped — `MAX_OVERLOAD_PAGES = 10` in `lib/extractDocs.ts`, unreachable overloads are
  skipped, and anything beyond the cap is reported as a count instead of fetched — so
  the worst case is ~1.5 kB. Rationale: it replaces N round trips (one per overload)
  with a single call. Anything whose cost is larger or unbounded still has to be opt-in.
- **I-06 — Partial failure must not fail the whole call.** Search sources are queried
  with `Promise.allSettled` and only throw when *every* source failed; `retrieve-docs`
  wraps each page in `try/catch` so one unreachable page does not discard the pages
  already fetched. `retrieve-doc` (single page) *may* throw — that is intended.
- **I-07 — stdout belongs to JSON-RPC only.** Never write logs to stdout from
  `lib/`, `tools/` or `main.ts`; every diagnostic goes to `console.error` (stderr).
  A lenient client (opencode) skips non-JSON lines, but a strict one can fail the
  handshake, so this is not cosmetic. **Verified clean since `v1.0.9`**: a stdio run
  emits 4 JSON lines and 0 non-JSON lines on stdout, with all five diagnostics on
  stderr. Never echo secret material either — not even a prefix: `main.ts` reports
  `OpenAI API key: configured|not set`, because a client that keeps its server's
  stderr would otherwise accumulate key fragments. The only legitimate stdout writer
  is the `-h` help path, which exits before the transport starts.
- **I-08 — No secrets in the repository.** OpenAI key and vector-store id come from
  environment variables or `-k` / `-v`. `.env` is gitignored; keep it that way.
- **I-09 — Binaries are never committed.** `.gitignore` has `Rvt_Docs_MCP*`. Release
  assets are produced by CI, not uploaded from a working tree.
- **I-10 — Do not push tags without an explicit instruction.** Any tag matching `v*`
  triggers CI and **publishes a public release**. Tags `v1.0.0`–`v1.0.5` already exist
  (inherited from upstream at fork time, no assets), `v1.0.6` fixed the Search V2
  breakage, `v1.0.7` added `includeExamples`, `v1.0.8` carries the five usability
  fixes that came out of a blind agent test, and `v1.0.9` cleaned up stdout (I-07) —
  `main.ts` already reports `1.0.9`. Next version is `v1.0.10`.

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
    if (!line.startsWith("{")) continue;              // safety net: stdout is pure JSON-RPC since v1.0.9 (I-07)
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

Also worth checking: `year: 2020` and `year: 2027` both return valid slugs, and the
same slug called twice — once without the flag and once with `includeExamples: true` —
returns **2425** and **2970** characters respectively, the second one containing a
`## Examples` section with a single ```` ```csharp ```` block (no `vbnet`, no `python`).
The flag must never change the default response. That pair is for the eight-parameter
`Wall.Create` overload and was re-measured on the released `v1.0.8` CI artifact:
**2425** and **2970**, unchanged from `v1.0.7`. A specific-overload page is not an
overloads stub, so the `v1.0.8` enrichment cannot fire on it.

**Behaviour baseline for `v1.0.8`** — measured 2026-09-08 on the local build, driven over
MCP stdio with the client above. These are the checks the five usability fixes touched;
re-run them after any change to `lib/extractDocs.ts` or `lib/searchDocs.ts`:

- `search-docs "RotateElement"` → **3 results, zero page-id slugs, `declaringType` present
  on all 3**. Before `dedupePageIdTwins` this returned 5 results, two of them bare page-id
  duplicates with no description.
- `search-docs "WallType"` with `queryTypes: ["Methods"]` → **1 result, type `Methods`,
  page-id slug preserved**. It has no readable twin, and it is the only path to a class's
  whole member-listing page — proof that the dedupe did not eat it.
- `retrieve-doc /2025/Autodesk.Revit.DB.Transaction.Start` → **382 → 548 characters**, now
  with `## Overload Signatures` containing `### Start()` and `### Start(String)` and the
  real C# (`public TransactionStatus Start`).
- `retrieve-doc /2025/Autodesk.Revit.DB.Wall.Create` (the stub, no parameter list) →
  **2,357 characters with 5 overload signatures**.
- `retrieve-doc /2025/Autodesk.Revit.DB.LocationPoint.Rotate` → error text ending with
  **`Try: /2025/Autodesk.Revit.DB.Location.Rotate`**.
- Regression, `retrieve-doc /2025/Autodesk.Revit.DB.ElementTransformUtils.RotateElement`
  with `includeExamples: true` → **1,165 characters** with `## Examples` and the
  `RotateColumn` sample.
- Regression, the same slug **without** the flag → **827 characters** with `## Parameters`
  and `## Exceptions` and **no** `## Examples`. The default response is untouched.
- Regression, untouched page shapes: the class page `/2025/Autodesk.Revit.DB.Wall` →
  **15,295 characters**; the eight-parameter `Wall.Create` overload → **2,425** default
  and **2,970** with `includeExamples`.

All of the above was re-run against the **released `v1.0.8` CI artifact**, not only the
local build: the handshake reported `serverInfo.version` `1.0.8` and every number came
back identical. Do the same for the next release — the two builds differ in size
(97,471,888 local vs 97,471,264 CI) and only a re-run proves they behave alike.

**stdout purity check (`v1.0.9`+).** Count what the server writes to each stream during a
short stdio session — `initialize` + `tools/list` + one `search-docs` + one `retrieve-doc`:

- stdout must be **4 JSON lines and 0 non-JSON lines**;
- stderr carries the diagnostics (`OpenAI API key: not set`, `Vector store ID: not set`,
  the two `search-library` warnings, `Revit API Docs MCP Server is running...`);
- the handshake must report `serverInfo.version` matching the tag.

Measured on the `v1.0.9` build: stdout 4/0, stderr 5 lines, version `1.0.9`, and the
`v1.0.8` behaviour baseline unchanged (search 3 results with `declaringType`, stub 548
characters with `## Overload Signatures`).

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
while the binary stays untracked.

**How opencode picks the server up — and it matters which CLI you mean.** Downstream
users run both the legacy `opencode` (1.18.x) and the OpenCode 2.0 preview `opencode2`
(`v0.0.0-beta-*`, npm `@opencode/cli`) against this server, and the same committed
`opencode.json` works for both (`mcp.<name>.{type,command,enabled}` — confirmed with
`opencode mcp list` and with the V2 daemon serving it). Everything below was verified on
2026-09-08 on a machine with both CLIs installed.

- **`opencode2` (V2) is client/server.** One shared background daemon per user account
  (`opencode2.exe serve --service`, registered in `~/.local/state/opencode/service.json`)
  owns the sessions *and* the MCP children, one instance per project directory. Closing
  the TUI window or the editor does **not** restart it, so a stale MCP state survives
  "restarts". Manage it with `opencode2 service status|restart|stop|start` (`status`
  prints the URL, e.g. `http://127.0.0.1:49374`). Use `--standalone` for a private
  server when isolating a problem, `--server <url>` to attach to a specific one, and
  `opencode2 <dir>` to open another project without depending on the shell's cwd.
- **`opencode` (V1, 1.18.x) has no `service` command** and no shared daemon: the server
  belongs to the TUI process (or to your own `opencode serve` + `opencode attach <url>`),
  so restarting it really does restart MCP. Never diagnose V2 behaviour with the V1
  binary — its help lacks `service`, `--standalone` and `--server`, which produces
  confidently wrong conclusions (it did here, and that wrong claim was committed before
  being corrected).
- **The V2 daemon does not respawn a dead MCP child.** If you kill
  `Rvt_Docs_MCP-windows.exe` or replace the exe under it, the tools disappear from
  running sessions and do not come back on their own.
- **Cheap reload: a config toggle.** `"enabled": false` → save → `true`. The daemon
  re-reads the config and spawns a fresh child from the current binary. Wait a few
  seconds — checking immediately shows nothing and misleads you. **Heavy reset:**
  `opencode2 service restart`, which kills every active session.
- **`mcp list` is not proof of your session's state.** It creates its own instance,
  connects to the exe anew and prints `✓ revit-api-docs connected` even when the server
  behind the actual session is dead.
- Windows locks a running executable image: overwriting or deleting it fails with
  `Access is denied` (not "file in use"), which is easy to misread as a permissions
  problem. Free the file first (`opencode2 service restart`, or kill just that MCP
  child), then swap it, then toggle `enabled`.

**Who is holding the binary, and why closing the UI does not release it.** The V2
daemon is a single per-user background process (`opencode2.exe serve --service`) that
owns **one MCP child per project directory** that has the server configured. Observed
live on 2026-09-08 with one TUI window open:

```
opencode2.exe  74164  serve --service          <- the daemon, survives closing the TUI
 ├─ Rvt_Docs_MCP-windows.exe  29212  D:\...\Rvt_Docs_MCP\         <- fork repo project
 └─ Rvt_Docs_MCP-windows.exe  39584  D:\...\AGK-SmartCon-Pro\tools\ <- SmartCon project
opencode2.exe  74192                            <- the TUI you actually see
```

So two locked copies of the binary with one visible window is normal, and closing the
window kills only the TUI. Find and free them like this:

```powershell
# which children exist and which project each belongs to
Get-CimInstance Win32_Process -Filter "Name LIKE 'Rvt_Docs_MCP%'" |
  Select-Object ProcessId, ParentProcessId, CreationDate, ExecutablePath

opencode2 service status            # prints the daemon URL when it is alive

# free ONE project's binary (daemon and other projects keep working)
Get-CimInstance Win32_Process -Filter "Name LIKE 'Rvt_Docs_MCP%'" |
  Where-Object ExecutablePath -eq 'D:\path\to\tools\Rvt_Docs_MCP-windows.exe' |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# or free everything at once, then bring the daemon back
opencode2 service stop ; opencode2 service start
```

After the swap, toggle `"enabled": false` → `true` in that project's `opencode.json`:
the daemon does **not** respawn a child it did not kill itself. Two more sources of a
transient lock: `opencode mcp list` (V1) spawns its own short-lived instance of the
binary, and `deno compile --output <same name>` fails with `Access is denied` while a
child is running — compile to a different name (`Rvt_Docs_MCP-test.exe`) and swap after.

This repository ships its own root-level `opencode.json` for dogfooding: it points at
`./Rvt_Docs_MCP-windows.exe`, i.e. exactly the artifact the build command above
produces. The config is committed, the binary is not (`Rvt_Docs_MCP*` in
`.gitignore`), so after a fresh clone you must build the binary before the server
connects. Do not switch this config to `deno run -A main.ts`: Deno is not guaranteed
to be on `PATH` (the winget install does not create a shim).

### Publish a release

Bump the handshake version first — `McpServer({ name, version })` in `main.ts` must
match the tag you are about to push (this is what lets a client tell builds apart), then
rebuild and re-run the smoke client. `main.ts` currently reports `1.0.9`; the next version
after `v1.0.9` is `v1.0.10`.

```bash
git tag -a v1.0.10 -m "v1.0.10 - <what changed>"
git push origin master
git push origin v1.0.10         # push the tag explicitly; --follow-tags would also work
gh run list --repo Alexandrisius/Rvt_Docs_MCP --limit 3
gh run watch <run-id> --repo Alexandrisius/Rvt_Docs_MCP --exit-status
```

CI builds all three targets (~1–2 min) and creates the release. **Two gotchas:**

1. The release body is created **empty** by `softprops/action-gh-release`. Always fill
   it in afterwards: `gh release edit v1.0.9 --notes-file notes.md`.
2. **Re-verify the CI artifact**, do not trust the local build — compile environments
   differ. Download the asset (`gh release download v1.0.9 --pattern
   "Rvt_Docs_MCP-windows.exe" --dir <tmp>`) and run the stdio smoke client above
   against it, including the `v1.0.8` behaviour baseline. For `v1.0.6` the CI artifact
   answered byte-identically to the local build (`RETRIEVE len: 2425`). For `v1.0.7` the
   CI asset (97,441,696 bytes) and the local build (97,441,859 bytes) differ in size but
   answered identically: `revit-docs-mcp v1.0.7`, baseline `2425`,
   `includeExamples: true` → `2970`. The `v1.0.8` numbers were measured on the local
   build only, so the CI asset of that release still has to be checked.

## 7. Failure modes and diagnostics

| Symptom | Cause | Where to look |
|---|---|---|
| `404 Not Found` from `search-docs` | rvtdocs.com changed its search endpoint again | `lib/searchDocs.ts` → `searchRvtDocsCom`; open the site's devtools network tab and re-read the real endpoint |
| HTTP 200 but **empty** result set | the mandatory `fields` parameter is missing/wrong | `params.set("fields", "title")` — without it the Search V2 backend returns nothing |
| `Main content section not found` | page layout re-templated, the headline anchor no longer matches | `lib/extractDocs.ts` — it anchors on stable CSS classes, not HTML comments; re-inspect the markup and update the class names |
| Sections silently missing (e.g. no Exceptions) | card class renamed, or the label landed in `SKIPPED_SECTION_LABELS` | `extractSection` + `SKIPPED_SECTION_LABELS` |
| Results without descriptions | a page-id result with **no** readable twin survives on purpose — it is the only way to reach a class's whole `Methods` / `Properties` listing page; otherwise one source returned a thinner record and `dedupeByUrl` keeps the record with fewer empty fields | `dedupePageIdTwins` + `dedupeByUrl` in `lib/searchDocs.ts`, shapes in `types/index.ts` |
| The same entity twice in the results, one copy without a description | both sources index every entity — once under a readable slug, once under a bare page id (GUID). Since `v1.0.8` `dedupePageIdTwins` drops the page-id twin, but **only** when exactly one readable result of the same type carries the same member name; with several candidates (`Create` exists on dozens of classes) nothing is dropped, because guessing would delete real entities | `dedupePageIdTwins`, `PAGE_ID_SLUG`, `memberNameOf` in `lib/searchDocs.ts` |
| An entity that *should* be in the results is missing | the page-id twin rule matched too eagerly and a real entity was mistaken for a duplicate of a readable one | `memberNameOf` (it strips an overload's parameter list and the type word the secondary source appends to its titles) and the `twins.length === 1` guard in `dedupePageIdTwins`; compare against what the two sources returned before the dedupe |
| Only one source's results | the other source is down — by design (I-06), a warning goes to stderr | `searchWrapper` |
| `search-library` missing | `OPENAI_API_KEY` / `OPENAI_VECTOR_STORE_ID` not both set | `main.ts` |
| Client handshake fails / hangs | since `v1.0.9` stdout is pure JSON-RPC, so this is now almost always the OS blocking an unsigned binary, or a client that never sent `notifications/initialized` | run the purity check (§6): stdout must be 4 JSON lines and 0 non-JSON lines — any extra line means someone added a `console.log`/`console.info` (I-07); on Windows check "Unblock" in file properties |
| Tools vanished mid-session, or a new parameter is silently ignored after a rebuild | the opencode service does not respawn a dead MCP child, and `opencode mcp list` still prints `✓ connected` because it spawns its own instance | toggle `enabled` false→true in `opencode.json` (see §6), or run `opencode2 service restart` — the latter kills every active session |
| A specific `year` returns nothing | outside site coverage (2020–2027) | `lib/toolsCommon.ts` |
| `retrieve-doc` on an overload fails | slug must be the exact string from search results, including the parenthesised parameter list | pass `url` from `search-docs` verbatim |
| `retrieve-doc` on an inherited member → `404` | the member is declared on a base type: `LocationPoint.Rotate` has no page, `Location.Rotate` does. Since `v1.0.8` the error text ends with `This member is likely declared on a base type. Try: /2025/Autodesk.Revit.DB.Location.Rotate` | `suggestInheritedMemberSlug` + `findInheritedFrom` in `lib/extractDocs.ts`, called from the catch block of `tools/retrieve-doc.ts`. **Suggestion missing?** It is best effort: it fires only on a 404 for a `<Type>.<Member>` slug (no `(`, no hash) and needs the class page's `Inherited From` column, which the 2025+ docs have. **Suggestion wrong?** The cell is picked by header position — re-check `findInheritedFrom` against the live member table. Any failure returns null and the plain error is served unchanged |
| An overloads stub page comes back without `## Overload Signatures` | the anchor matching no longer fits the markup: overload links are collected by `href` starting with the page's own path followed by `(` (parameterised) or `-` (hashed — a parameterless overload lives at e.g. `/2025/Autodesk.Revit.DB.Transaction.Start-1146fa87`, which cannot be derived from the member name) | `isOverloadsStub` (the breadcrumb's `crumb-pagetype` chip must read `Overloads`) and `extractOverloadSignatures` in `lib/extractDocs.ts`; re-inspect the anchors of a live stub page. Unreachable overloads are skipped instead of failing the call, and past `MAX_OVERLOAD_PAGES = 10` the section ends with a note about how many were not expanded |
| `includeExamples: true` but no `## Examples` in the response | either the page genuinely has no example (~50% of pages do not), or the card was renamed | `extractSection` in `lib/extractDocs.ts` — it matches the label `Examples` and the class `example-code-snippet` (distinct from the Syntax card's `code-snippet`), plus `data-tab-index="C#-n"` to pick the C# tab |

**If the site moved again:** reproduce with the smoke client, capture the failing raw
response, fix the endpoint or selectors, `deno check`, re-run the smoke client, then
release a new tag. Update §2 of this file and the fork notice in `README.md`, and tell
upstream.

## 8. How the pipeline works (so you can fix it)

**Search (`lib/searchDocs.ts`)**

1. Query both sources in parallel with `Promise.allSettled`, each asking for `max * 2`
   results. Throw only if *both* rejected; otherwise warn on stderr and continue.
2. rvtdocs.com: `GET https://rvtdocs.com/search/v2/api/?q=<query>&v=<year>&fields=title&limit=<n>&source=mcp`.
   The response's `declaring_type` and `is_obsolete` are passed through as `declaringType`
   and `isObsolete` (the latter only when true) instead of being dropped.
3. Concatenate → `dedupeByUrl` (keeps the record with fewer empty fields) →
   `dedupePageIdTwins` (drops a bare page-id twin when **exactly one** readable result of
   the same type carries the same member name; page-id results without a twin survive,
   they are the only way to reach a class's member-listing page) → `sortByType` (Class,
   Methods, Properties, Constructor first) → `slice(0, max)`.

**Extraction (`lib/extractDocs.ts`, parse5)**

1. Find the headline card; if absent → `Main content section not found`.
2. Walk labeled section cards (`Syntax`, `Parameters`, `Exceptions`, member lists, …),
   skipping labels in `SKIPPED_SECTION_LABELS` = `["Discussion", "Community Snippets"]`
   and community card classes. The `Examples` label (`EXAMPLES_SECTION_LABEL`) is added
   to that skip list unless the caller passed `includeExamples: true`.
3. `Syntax` → the code block of the *active* language tab (C# in practice); VB / C++ /
   F# tabs are dropped.
4. `Examples` (opt-in) → the `example-code-snippet` div whose `data-tab-index` starts
   with `C#`; the AI-translated Python tab and the VB tab hold the same sample and are
   dropped. A page with no C# tab falls back to whichever tab is not `hidden`.
5. Parameters table + `return-row` (`return-type` / `return-desc`) → `**Return Value:**`.
6. Exceptions table, member tables, then tables living outside labeled sections.
7. The hierarchy card renders as `## Hierarchy` on class pages and as `## Overloads` +
   an overload list on member pages (detected by an `Overloads (n):` prefix regex).
8. **Overloads stub → signatures.** When the breadcrumb's page-type chip reads `Overloads`
   (`isOverloadsStub`), the page is a stub: it lists the overloads but shows no
   signatures. `extractOverloadSignatures` then collects the overload links from the
   page's own anchors — an `href` starting with the page path plus `(` or `-`, because a
   parameterless overload lives at a hashed slug
   (`/2025/Autodesk.Revit.DB.Transaction.Start-1146fa87`) that cannot be derived from the
   member name — fetches up to `MAX_OVERLOAD_PAGES = 10` of them in parallel
   (`Promise.allSettled`; unreachable ones are skipped, not fatal) and appends
   `## Overload Signatures` with each overload's C# block from `fetchSyntaxBlock`. Past the
   cap the section ends with a note about how many were not expanded. This is the bounded
   exception to I-05.
9. Collapse 3+ consecutive newlines and trim.
10. **Error path (`tools/retrieve-doc.ts`, not `extractDocs.ts`).** On a 404 the catch
    block calls `suggestInheritedMemberSlug`, which re-reads the *class* page, looks up the
    member's `Inherited From` cell with `findInheritedFrom` and appends
    `Try: /<year>/<Namespace>.<DeclaringType>.<Member>` to the error text. Best effort: any
    failure returns null and the plain error is served unchanged.

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

1. **Response caching / offline snapshot** — the top resilience risk: the project has
   already been broken once by an upstream site change, and every call hits the
   network. A local cache (or a bundled snapshot for common entities) would survive the
   next migration. Upstream marked caching "unlikely"; that judgement predates the
   September 2026 breakage.
2. **No Linux target** in the CI matrix (`windows`, `macos-x64`, `macos-arm64` only).
3. **No automated tests.** The stdio smoke client in §6 is a candidate for a
   `deno task smoke` that runs against a recorded fixture, so regressions in
   `extractDocs.ts` are caught without depending on a live site.
4. **Upstream PR** for [kaitpw/Rvt_Docs_MCP#3](https://github.com/kaitpw/Rvt_Docs_MCP/issues/3)
   — offered, not merged.

### Rejected — do not propose or implement again

**Bundling or indexing third-party code examples is permanently out of scope for this
fork** (maintainer decision, 2026-09-08). That covers every variant that was researched:
embedding `jeremytammik/the_building_coder_samples` (MIT, ~3.4 MB, ~180 `Cmd*.cs` files),
indexing `jeremytammik/RevitSdkSamples` (MIT but 1.8 GB), scraping The Building Coder
prose, extending the OpenAI vector-store path, and a store of agent-contributed
"verified snippets". The only examples support is `includeExamples` — the official SDK
sample that ships with the documentation page itself.

Why: a bundled corpus turns a stateless scraper into a dataset with licensing,
staleness and retrieval-quality obligations that nobody here will maintain, and "find me
a real-world example" is already served better by web search than by a frozen snapshot.

Research kept so it is not repeated: The Building Coder left Typepad (shut down August
2025; `thebuildingcoder.typepad.com` now 302-redirects to a parking page — never build
against that domain) and lives on at `jeremytammik.github.io/tbc/a/` (repo
`jeremytammik/tbc`, branch `gh-pages`, MIT) with a 577 KB post index and a public
Pagefind index; a hand-written Pagefind shard client was judged too fragile for the
value. `search-library` stays as-is: gated, optional, upstream's design.

Done and removed from this list: the `serverInfo.version` bump (was hardcoded to
`1.0.0`, now matches the release and is part of the §6 release checklist), the five
usability items shipped in `v1.0.8`, and stdout hygiene (I-07) shipped in `v1.0.9` —
all diagnostics moved to stderr and the OpenAI key is no longer echoed, not even as a
prefix.

**Where those five came from — a blind test.** An agent with zero context was given a real
Revit task (rotate a column 45° around Z, check whether it is pinned, inside a transaction)
and no hints about the tools. It scored the toolset **7.5/10** (`search-docs` 8.5,
`retrieve-doc` 6.5), solved the task **without inventing a single signature**, and reported
exactly the five pains below. They are recorded here so the provenance of the current
behaviour is not lost:

- **The `urlSlug` format was nowhere described** → it now lives in the parameter's
  `.describe()` (`lib/toolsCommon.ts`): copy the slug verbatim from the `url` field of a
  `search-docs` result, the leading slash is optional, the shape is
  `/<year>/<Namespace>.<Type>` for a class and `/<year>/<Namespace>.<Type>.<Member>` for a
  member, and one specific overload is addressed by appending its parameter list exactly as
  shown (`/2025/Autodesk.Revit.DB.Wall.Create(Document,Curve,ElementId,Boolean)`).
- **Singular vs plural `queryTypes` was unexplained** → now stated in the same file:
  singular values (Class, Method, Property, Constructor, Interface, Enumeration) match
  individual API pages from the primary source rvtdocs.com; plural values (Methods,
  Properties) match a class's whole member-listing page, come only from the secondary source
  revitapidocs.com, and are returned for only some classes (measured: `WallType` → 1 result,
  `Transaction` → 1, `Element` → 0, `Level` → 0). They are therefore **not** a reliable way
  to enumerate members — retrieve the Class page instead, whose Methods/Properties tables
  list every member including the type each one is declared on.
- **Search results were thin and duplicated** → `declaringType` (the API already returned
  `declaring_type`; it was being dropped) and `isObsolete` (set only when true) are passed
  through, and `dedupePageIdTwins` removes the descriptionless page-id twin of a readable
  result while keeping page-id results that have no twin.
- **An inherited member's 404 was a dead end** → the error text now ends with the slug that
  works (`suggestInheritedMemberSlug` + `findInheritedFrom` in `lib/extractDocs.ts`, called
  from `tools/retrieve-doc.ts`).
- **An overloads stub cost one extra call per overload** → such a page now gains
  `## Overload Signatures` with each overload's C# syntax block, capped at
  `MAX_OVERLOAD_PAGES = 10` (the bounded exception to I-05).

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
