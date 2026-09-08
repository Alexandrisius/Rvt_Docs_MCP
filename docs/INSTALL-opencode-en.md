# Installing the `revit-api-docs` MCP server into an opencode project

**Language: English | [Русский](INSTALL-opencode-ru.md)**

**Who this is for:** a person with no prior experience + an AI agent with no context.
**What you get:** your opencode repository gains 3 tools that serve Revit API reference
material (class/method signatures, parameters, exceptions, class members, availability
across Revit 2020–2027) in a compact form suitable for an AI context window.
**Time:** 10 minutes if you have a ready-made `.exe`, ~20 minutes if you build it yourself.
**Verified:** 2026-09-08, Windows 11, opencode 1.18.29 / opencode2 v0.0.0-beta-19296, Deno 2.9.6,
release [`v1.0.6`](https://github.com/Alexandrisius/Rvt_Docs_MCP/releases/tag/v1.0.6)
(the CI artifact `Rvt_Docs_MCP-windows.exe` was checked with direct MCP-protocol calls:
`tools/list` → 3 tools, `search-docs` and `retrieve-doc` → correct markdown).
**This file lives in the repository at:** `docs/INSTALL-opencode-en.md`. The Russian original is
`docs/INSTALL-opencode-ru.md`; `README.md` (Setup section) carries a shorter summary —
this guide is the detailed, beginner-oriented version.

---

## 0. Glossary (3 terms, everything after this gets easier)

| Term | What it is, in plain words |
|---|---|
| **MCP** | The protocol by which an AI agent attaches "external tools". An MCP server = a program that answers the agent's requests. |
| **`Rvt_Docs_MCP-windows.exe`** | That server. One program, ~93 MB. Inside it is a parser for the Revit API documentation sites. You never run it yourself — opencode runs it. |
| **`opencode.json`** | A settings file at the root of your repository. In it you write "run this exe as the MCP server `revit-api-docs`". |

**How it works under the hood:** the agent calls a tool → opencode launches the exe →
the exe goes to `rvtdocs.com` and `revitapidocs.com`, downloads the page it needs →
turns the HTML into clean markdown (C# syntax only, parameters and exceptions as
tables) → returns it to the agent. **There is no internal knowledge and no neural
network inside** — it is an honest parser. That is why you need an internet connection.

---

## 1. Requirements

| Needed | Why | How to check |
|---|---|---|
| Windows 10/11 (or macOS/Linux — see §10) | OS | — |
| **opencode** | MCP host | `opencode --version` → for example `1.18.29` |
| **git** | to download the sources (Option B only) | `git --version` |
| **Internet** | the exe downloads documentation from the sites on every call | — |
| **Deno 2.x** | ONLY if you build the exe yourself (Option B) | `deno --version` |

If opencode is not installed:

```powershell
npm install -g opencode-ai          # main version (the opencode command)
npm install -g @opencode/cli        # optional: V2 beta (the opencode2 command)
```

---

## 2. Step 1 — get `Rvt_Docs_MCP-windows.exe`

> ⚠️ **THE MAIN TRAP.** Do not download the exe from the **original** repository
> `kaitpw/Rvt_Docs_MCP` (its Releases section). The latest builds there are from August 2025.
> Between 2026-09-04 and 2026-09-05 the `rvtdocs.com` site moved to a new search API, "Search V2",
> and those old builds are **broken**: `search-docs` fails with `404 Not Found`,
> `retrieve-doc` fails with `Main content section not found`. The server still starts and
> looks "alive", so the breakage is invisible until the first call.
>
> You need the **fork**: <https://github.com/Alexandrisius/Rvt_Docs_MCP> — it is adapted to Search V2.

### Option A — download the ready-made exe (fast, RECOMMENDED)

1. Open **<https://github.com/Alexandrisius/Rvt_Docs_MCP/releases>**
2. Take the latest release (**`v1.0.6`** or newer) and download the asset
   **`Rvt_Docs_MCP-windows.exe`** (~93 MB).
   For macOS: `Rvt_Docs_MCP-macos-arm64` (Apple Silicon) or `Rvt_Docs_MCP-macos-x64` (Intel).
3. The release is built by the fork's GitHub Actions from the same code you would compile
   manually — there is no Deno to check, go straight to §3.

To confirm you did not download the upstream: the fork's release has three assets and a tag
of `v1.0.6` or newer; the upstream tags are `v1.0.0`…`v1.0.5`, all from August 2025.

> ℹ️ The `v1.0.0`…`v1.0.5` releases in the fork are upstream tags inherited at fork time —
> there are no binaries under them. You need `v1.0.6` or newer.

### Option B — build from source (if there is no release, or you need your own build)

**B1. Install Deno** (one command, ~1 minute):

```powershell
winget install DenoLand.Deno
```

> ⚠️ After installing, **close the terminal and open a new one** — otherwise the `deno`
> command will not be found (PATH is only refreshed for new sessions). Check:
>
> ```powershell
> deno --version    # expect: deno 2.x.x (stable, release, x86_64-pc-windows-msvc)
> ```
>
> If winget is unavailable, the Deno exe lives here (the path may differ):
> `C:\Users\<username>\AppData\Local\Microsoft\WinGet\Packages\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\deno.exe`

**B2. Clone the fork and build:**

```powershell
cd C:\Dev                                      # any folder where you keep your sources
git clone https://github.com/Alexandrisius/Rvt_Docs_MCP.git
cd Rvt_Docs_MCP
git log -1 --oneline                           # expect: 42b3bfa fix: adapt to rvtdocs.com Search V2 API...
deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts
```

The first build downloads dependencies from the internet (1–3 minutes). The expected result is
a file named `Rvt_Docs_MCP-windows.exe`, about **~93 MB**, in the repository folder.

**B3. (optional but useful) check the code and the exe itself:**

```powershell
deno check main.ts                             # expect: exit code 0, no type errors
.\Rvt_Docs_MCP-windows.exe -h                  # expect: the help menu is printed
```

> ℹ️ Running the exe in a terminal is not needed for anything else: it is a stdio server that
> waits for commands from opencode. The help menu is the only meaningful manual check.

---

## 3. Step 2 — put the exe into your repository

```powershell
cd C:\path\to\YOUR-REPOSITORY
mkdir tools                                    # if the folder does not exist
# copy the built/downloaded exe:
copy C:\Dev\Rvt_Docs_MCP\Rvt_Docs_MCP-windows.exe tools\
dir tools                                      # expect: Rvt_Docs_MCP-windows.exe  ~93 MB (97,4xx,xxx bytes)
```

**The file name must match what you write in the config.** You can name it differently —
in that case adjust the path in §4.

> You may also keep the exe outside the repository (for example `C:\Tools\Rvt_Docs_MCP\`) — but
> then the config must carry an **absolute** path, and such a config cannot be committed (the
> path will be wrong on somebody else's machine). The recommended option is `tools/` inside the
> repo + a relative path.

---

## 4. Step 3 — create `opencode.json` at the ROOT of the repository

Create the file `opencode.json` next to `.git` and paste **exactly this**:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "revit-api-docs": {
      "type": "local",
      "command": ["tools/Rvt_Docs_MCP-windows.exe"],
      "enabled": true
    }
  }
}
```

Or with commands (PowerShell, from the repository root):

```powershell
$json = @'
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "revit-api-docs": {
      "type": "local",
      "command": ["tools/Rvt_Docs_MCP-windows.exe"],
      "enabled": true
    }
  }
}
'@

# PowerShell 7 (pwsh):
Set-Content opencode.json -Value $json -Encoding utf8

# Windows PowerShell 5.1 — use this instead of the line above (otherwise you get a BOM):
# [System.IO.File]::WriteAllText("$PWD\opencode.json", $json, (New-Object System.Text.UTF8Encoding $false))

Get-Content opencode.json -Raw    # check that the file was written
```

**Important details:**

- The path `tools/Rvt_Docs_MCP-windows.exe` is **relative to the project root**. Verified:
  opencode resolves it correctly and the server connects. This is exactly why the config can be
  committed to git and will work on any machine.
- Use forward slashes `/`, not `\\`. If you write an absolute Windows path, escape it:
  `"D:\\Project\\...\\Rvt_Docs_MCP-windows.exe"`.
- The file encoding must be UTF-8 **without BOM**. The command above assumes **PowerShell 7**
  (`pwsh`) — there `-Encoding utf8` writes without a BOM. In the older **Windows PowerShell 5.1**
  the same flag adds a BOM, so use this instead:

  ```powershell
  [System.IO.File]::WriteAllText("$PWD\opencode.json", $json, (New-Object System.Text.UTF8Encoding $false))
  ```

  To check for a BOM: `[System.IO.File]::ReadAllBytes("$PWD\opencode.json")[0..2]` —
  the first bytes must be `123,10,32` (that is `{`), not `239,187,191` (BOM).
- This is a **project** config: the server will appear only in this repository. If you want it in
  all your projects, add the same `"mcp"` block to the global
  `C:\Users\<username>\.config\opencode\opencode.json` (with an absolute path to the exe only).

---

## 5. Step 4 — keep the exe out of git

The exe weighs ~93 MB. GitHub warns about files over 50 MB and **blocks** pushes of files
over 100 MB without Git LFS, and every rebuild would permanently add another ~93 MB to history.
So the exe does not go into git — only the config does.

Add to `.gitignore` (create the file if it does not exist):

```gitignore
# MCP server binaries (~93 MB, built/downloaded locally)
*.exe
```

More narrowly, if `*.exe` is too broad for your project:

```gitignore
tools/Rvt_Docs_MCP-windows.exe
```

Check:

```powershell
git check-ignore -v tools/Rvt_Docs_MCP-windows.exe   # expect: .gitignore:1:*.exe  tools/Rvt_Docs_MCP-windows.exe
git ls-files "*.exe"                                 # expect: empty
git status -sb                                       # expect: ?? opencode.json (and only that)
```

Commit the config:

```powershell
git add opencode.json .gitignore
git commit -m "chore(mcp): add project-scoped revit-api-docs MCP config

Command uses a project-relative path; the executable itself stays untracked
(*.exe is gitignored). To set up on another machine, put
Rvt_Docs_MCP-windows.exe into tools/ - build it from
Alexandrisius/Rvt_Docs_MCP: deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts"
```

---

## 6. Step 5 — verify the connection

> ⚠️ **Restart opencode.** Already-open sessions pick up a new MCP server only after a
> restart. This is the number one cause of "I did everything and there are no tools".

```powershell
cd C:\path\to\YOUR-REPOSITORY
opencode mcp list
```

**Expected output (green):**

```
┌  MCP Servers
│
●  ✓ revit-api-docs connected
│      tools/Rvt_Docs_MCP-windows.exe
│
└  1 server(s)
```

If your global config (`C:\Users\<username>\.config\opencode\opencode.json`) already has other
servers, they will also show up in the list — that is normal. A real example of the output on a
machine with global github/exa/context7 servers (verified in an empty test folder on
2026-09-08):

```
●  ✓ github          connected
●  ✓ exa             connected
●  ✓ context7        connected
●  ✓ revit-api-docs  connected
│      tools/Rvt_Docs_MCP-windows.exe
└  4 server(s)
```

There is only one criterion: the line must say **`revit-api-docs connected`**, not `failed`.

If you use opencode V2:

```powershell
opencode2 debug config
# in the output look for the block: "revit-api-docs": { "type": "local", "command": [...], "disabled": false }
```

Check the scope (this is by design — the server is project-scoped):

```powershell
cd C:\Windows\Temp
opencode mcp list        # expect: revit-api-docs is NOT in the list
```

---

## 7. Step 6 — in-session smoke test (the main check)

`mcp list` only proves that the process started. The real check is calling the tools.
Open opencode in the repository folder and ask the agent:

> Call the `revit-api-docs` MCP tool → `search-docs` with `queryString: "Wall"`,
> `year: 2025`, `maxResults: 3`. Show the raw response.

**Expected response** (means the search over the new API works):

```json
[
  { "title": "Wall Class", "description": "Represents a wall in Autodesk Revit.",
    "namespace": "Autodesk.Revit.DB", "type": "Class", "url": "/2025/Autodesk.Revit.DB.Wall" },
  { "title": "WallType Class", ... },
  { "title": "WallPaint Class", ... }
]
```

Then:

> Call `retrieve-doc` with `urlSlug: "/2025/Autodesk.Revit.DB.Wall"` and show the first 40 lines.

**Expected:** markdown with the sections `Description`, `Remarks`, `Hierarchy`, `## Syntax`
(C# only), `## Methods` (a table with an `Inherited From` column). Size ~15,000 characters.

And a method version check:

> Call `retrieve-doc` with `urlSlug: "/2025/Autodesk.Revit.DB.Wall.Create(Document,Curve,ElementId,ElementId,Double,Double,Boolean,Boolean)"`.

**Expected:** `Declaring Type`, `## Syntax` (C#), `## Parameters` (table, 8 rows),
`**Return Value:** \`Wall\``, `## Exceptions` (table, 5 rows). Size ~2,400 characters.

If all three responses look like this — **the installation is complete, everything works.**
Move on to §8.

---

## 8. What to put into `AGENTS.md` (mandatory, otherwise the agent will misuse the tools)

Create or extend the file `AGENTS.md` at the root of your repository and paste the block below
**as is**. It closes three real problems: the agent starts asking the search questions in human
language (the search returns garbage), the agent confuses `retrieve-docs` with a list of URLs,
and the agent expects code examples from an MCP that has none.

````markdown
## Revit API: search tools (MCP `revit-api-docs`)

This project has a local MCP server `revit-api-docs` connected
(fork of <https://github.com/Alexandrisius/Rvt_Docs_MCP>, exe in `tools/`, config in `opencode.json`).
The server parses `rvtdocs.com` + `revitapidocs.com` and returns Revit API reference material as
compact markdown. **It has no knowledge of its own, it does not return code examples,
and it works online only.**

### Tool hierarchy (what to use for what)

| Task | Tool |
|---|---|
| Class/method signature, parameters, exceptions, Remarks, class composition, availability across Revit versions | MCP `revit-api-docs` |
| Code examples, best practices, Jeremy Tammik / The Building Coder, StackOverflow, GitHub open-source plugins, known bugs | Exa (`exa_web_search_exa`) |
| Official documentation for .NET / WPF / NuGet libraries | Context7 |
| Revit API through Context7 | **FORBIDDEN** (not in their database) |

### Available tools and their parameters

| Tool | Accepts | Returns | When to use |
|---|---|---|---|
| `search-docs` | `queryString`, `queryTypes?`, `year?`, `maxResults?` | a list of entities `{title, description, namespace, type, url}` — WITHOUT the documentation text | always first, to obtain the `url` |
| `retrieve-doc` | `urlSlug` (a string from the search response) | one page as full markdown | you need one specific page |
| `retrieve-docs` | `queryString`, `queryTypes?`, `year?`, `maxResults?` | the full text of ALL pages found | you need the contents of several pages at once |

### Hard rules for calling the tools

1. **`queryString` is an entity NAME, not a phrase and not a question.**
   - correct: `Wall`, `Connector`, `ElementTransformUtils.MoveElement`, `FilteredElementCollector`
   - incorrect: `how do I move a wall`, `methods for creating pipe`,
     `как передвинуть стену` (a natural-language query in any language)
   - The `Class.Member` format works only when `year >= 2025`.
   - The `Constructor(arg1, arg2)` format is for finding a specific constructor.
2. **`retrieve-docs` means "find AND immediately return the full texts".** It accepts
   `queryString`, NOT a list of URLs. You cannot pass it your own list of slugs
   (validation will answer `queryString: Missing key`).
3. **`retrieve-doc` accepts only a slug** like `/2025/Autodesk.Revit.DB.Wall`, obtained from a
   search. Do not substitute full `https://...` URLs.
4. **`year` = the Revit version you are writing the code for** (range 2020–2027, default 2025).
   For cross-version code, check the signature in every target version — they differ.
5. **`queryTypes` narrows the result set:** `Class`, `Constructor`, `Method`, `Methods`,
   `Property`, `Properties`, `Interface`, `Enumeration`.
6. **Save tokens:** a class page ≈ 15,000 characters (~4k tokens), a method page
   ≈ 2,500 characters. Do not dump a dozen class pages in a row — first `search-docs`,
   then `retrieve-doc` for the specific method.
7. **Keep `maxResults` ≤ 5** for scouting (default 10, maximum 50).

### Order of work for any Revit API task

1. `search-docs` → find the entity and get its `url`
2. `retrieve-doc` → check the signature, parameters, exceptions, Remarks
3. Exa → at least 3 queries for a live code example and known issues
4. Only then write the code

### What the MCP does NOT know and does NOT return

- **Code examples.** The `Examples`, `Community Snippets` and `Discussion` sections are
  deliberately cut out during parsing (`lib/extractDocs.ts`, `SKIPPED_SECTION_LABELS`). For
  examples, go to Exa.
- VB / C++ / F# syntax tabs — only C# is returned.
- Opinions, "what is the best way", architectural recommendations.
- Anything that is not on `rvtdocs.com` / `revitapidocs.com`.
- Offline mode: there is no cache, every call goes to the network.

### How to tell that the MCP has broken (already happened on 2026-09-04/05)

| Symptom in the tool response | Cause | Fix |
|---|---|---|
| `404 Not Found` from `search-docs` | the site changed its search API again | rebuild the exe from the current fork |
| `Main content section not found` from `retrieve-doc` | the site's pages were re-templated again | same |
| Tools are visible but fail when called; the server shows "connected" | an old exe is installed (builds older than 2026-09) | rebuild the exe, restart opencode |

Rebuild: `git pull` in the fork clone → `deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts`
→ replace the exe in `tools/` → restart opencode.

### The `search-library` tool is missing — that is normal

The fork has a fourth tool (semantic search over The Building Coder), but it registers only when
both `OPENAI_API_KEY` **and** `OPENAI_VECTOR_STORE_ID` are present. Without them you see exactly
3 tools. Do not treat that as a failure.
````

---

## 9. If it does not work — diagnostics table

| Symptom | Cause | What to do |
|---|---|---|
| `opencode mcp list` → `✗ revit-api-docs failed` | wrong path to the exe / the exe is not in place | `dir tools` — is the file there? Does the name match the config? Try an absolute path with `\\` |
| No tools in the session even though `mcp list` is green | the session was started before the config was created | **restart opencode** (close it and open it again) |
| `deno` — "is not recognized as a command" | the terminal was opened before Deno was installed | open a **new** terminal; or call the exe by its full path from WinGet Packages |
| `search-docs` → `404 Not Found` | an old exe (pre-Search V2) | rebuild from the Alexandrisius fork (§2B) |
| `retrieve-doc` → `Main content section not found` | the site moved again | check the fork for new commits, rebuild; notify the maintainer |
| `Invalid arguments ... queryString: Missing key` | a list of URLs was passed to `retrieve-docs` | `retrieve-docs` takes `queryString` (search + delivery); for one specific slug use `retrieve-doc` |
| The search returns an empty/garbage list | `queryString` was set to a phrase | entity names only: `Wall`, `Class.Member` |
| `FileNotFoundException` / SmartScreen blocks the exe | Windows protection against an unsigned binary | file properties → "Unblock"; or build the exe yourself (§2B) |
| The server connects but a strict MCP client breaks the handshake | the server prints informational lines to stdout (`console.info` in `main.ts`) | opencode tolerates this fine; for another client, remove/redirect that output to stderr |
| The server is absent in another repository | by design: the config is project-scoped | copy `opencode.json` there, or register it in the global config |
| `git push` rejected: file over 100 MB | the exe got into git | add `*.exe` to `.gitignore`, `git rm --cached tools/Rvt_Docs_MCP-windows.exe`, commit again |

---

## 10. Not on Windows (macOS / Linux)

For macOS there **are** ready-made binaries in release `v1.0.6` and newer:
`Rvt_Docs_MCP-macos-arm64` (Apple Silicon, ~82 MB) and `Rvt_Docs_MCP-macos-x64`
(Intel, ~93 MB). Download the asset you need, put it into `tools/` in your repository and
run `chmod +x tools/Rvt_Docs_MCP-macos-arm64`. In `opencode.json` write
`"command": ["tools/Rvt_Docs_MCP-macos-arm64"]` (without `.exe`); in `.gitignore`, instead of
`*.exe`, list the binary names or use `tools/Rvt_Docs_MCP-*`.

For Linux there is no ready-made CI build (the workflow matrix covers Windows and macOS) —
build it on your own machine:

```bash
git clone https://github.com/Alexandrisius/Rvt_Docs_MCP.git
cd Rvt_Docs_MCP
deno compile -A --output Rvt_Docs_MCP main.ts
chmod +x Rvt_Docs_MCP
mkdir -p ../YOUR-REPO/tools && cp Rvt_Docs_MCP ../YOUR-REPO/tools/
```

In `opencode.json`: `"command": ["tools/Rvt_Docs_MCP"]` (without `.exe`),
in `.gitignore` — instead of `*.exe`, put `tools/Rvt_Docs_MCP`.

Cross-compiling for another OS (as the fork's CI does):

```bash
deno compile -A --target x86_64-pc-windows-msvc --output Rvt_Docs_MCP-windows.exe main.ts
deno compile -A --target aarch64-apple-darwin  --output Rvt_Docs_MCP-macos-arm64   main.ts
```

---

## 11. Optional — enabling the fourth tool, `search-library`

Semantic search over The Building Coder (Jeremy Tammik's blog). Requires an OpenAI key and a
pre-populated vector store (instructions: `kaitpw/Rvt_Docs_TBC_Embedder`).

```json
{
  "mcp": {
    "revit-api-docs": {
      "type": "local",
      "command": ["tools/Rvt_Docs_MCP-windows.exe", "-k", "sk-...", "-v", "vs_..."],
      "enabled": true
    }
  }
}
```

Or via the environment variables `OPENAI_API_KEY` and `OPENAI_VECTOR_STORE_ID`
(the fork has `@std/dotenv` wired in, so a `.env` file works; it is already in the fork's
`.gitignore`). **Do not commit keys into `opencode.json`** — that file lives in git.

---

## 12. Why you need this at all (understanding the value)

A comparison on the real page of the class `Autodesk.Revit.DB.Wall` (Revit 2025):

| Source | Size | In tokens (rough) |
|---|---|---|
| Raw HTML of the page on rvtdocs.com | 202,575 characters | ~50–60k — does not fit into the context |
| `retrieve-doc` response through the MCP | 15,295 characters | ~4k |
| `retrieve-doc` response for a single method | 2,425 characters | ~600 |

So the MCP gives roughly a **13x compression** and throws away everything superfluous (VB/C++/F#
tabs, discussions, navigation), keeping what the agent actually needs: the signature, parameters,
exceptions, inheritance hierarchy and the list of class members.

The second benefit is **versions 2020–2027**: you can check whether a method exists in the Revit
version you need and whether its signature changed (relevant for cross-version plugins).

What the MCP will not replace: live code examples and "the right way to do it". For that, use Exa
(The Building Coder, GitHub open-source plugins, Autodesk forums).

---

## 13. Cheat sheet (everything on one screen)

```powershell
# 1. exe into tools/   (download from the fork's Releases OR build it)
winget install DenoLand.Deno                       # new terminal after installing!
git clone https://github.com/Alexandrisius/Rvt_Docs_MCP.git
cd Rvt_Docs_MCP
deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts
copy Rvt_Docs_MCP-windows.exe C:\path\to\REPO\tools\

# 2. at the REPO root: opencode.json
#    { "$schema":"https://opencode.ai/config.json",
#      "mcp":{ "revit-api-docs":{ "type":"local",
#        "command":["tools/Rvt_Docs_MCP-windows.exe"], "enabled":true } } }

# 3. at the REPO root: .gitignore  ->  *.exe

# 4. verify (after RESTARTING opencode)
cd C:\path\to\REPO ; opencode mcp list             # ✓ revit-api-docs connected
git check-ignore -v tools/Rvt_Docs_MCP-windows.exe # ignored
git ls-files "*.exe"                               # empty

# 5. smoke test in a session: search-docs "Wall" -> url /2025/Autodesk.Revit.DB.Wall
#                        retrieve-doc  "/2025/Autodesk.Revit.DB.Wall" -> Syntax/Methods

# 6. paste the block from §8 into AGENTS.md
```

---

## 14. Where all of this comes from (sources for verification)

| Fact | Where it is confirmed |
|---|---|
| The fork is adapted to Search V2 | `lib/searchDocs.ts:108` → `https://rvtdocs.com/search/v2/api/`, commit `42b3bfa` |
| Search resilience | `lib/searchDocs.ts:18` → `Promise.allSettled` over two sources |
| Examples/Discussion are cut out | `lib/extractDocs.ts:12` → `SKIPPED_SECTION_LABELS` |
| Version range 2020–2027 | `lib/toolsCommon.ts:67` → `z.number().min(2020).max(2027)` |
| `search-library` is gated by keys | `main.ts` → `if (apiKey && vectorStoreId) createSearchLibrary(server)` |
| Fork release with working binaries | <https://github.com/Alexandrisius/Rvt_Docs_MCP/releases> → `v1.0.6` (3 assets: windows, macos-x64, macos-arm64), built by GitHub Actions on the tag |
| Upstream releases are broken | <https://github.com/kaitpw/Rvt_Docs_MCP/issues/3> — root cause analysis |
| CI builds the exe on a `v*` tag | `.github/workflows/deno.yml` in the fork |
| A relative path in the config works | verified with `opencode mcp list` → `connected`, 2026-09-08 |
| The guide was verified end-to-end | the §3–§6 commands were run verbatim in an empty test folder: BOM = `123,10,32`, `git check-ignore` → `.gitignore:1:*.exe`, `git ls-files "*.exe"` → empty, `opencode mcp list` → `✓ revit-api-docs connected` |
| The CI artifact of release `v1.0.6` works | the downloaded `Rvt_Docs_MCP-windows.exe` (97,433,508 bytes) was checked with a direct MCP-stdio client: `initialize` → `revit-docs-mcp v1.0.0`, `tools/list` → `search-docs, retrieve-docs, retrieve-doc`, `search-docs "Wall"` → slugs, `retrieve-doc` for the `Wall.Create` overload → 2,425 chars with Parameters / Exceptions / Return Value / C# syntax / Overloads |
