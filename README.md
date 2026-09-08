# Revit API MCP Server

> ## ⚠️ This is a maintained fork
>
> Forked from [kaitpw/Rvt_Docs_MCP](https://github.com/kaitpw/Rvt_Docs_MCP)
> (upstream inactive since August 2025).
>
> **Binaries in the upstream releases are broken.** Around 4-5 September 2026
> rvtdocs.com migrated to a new "Search V2" backend: the old
> `POST /search/api/search` endpoint was removed and the documentation pages were
> re-templated. Builds produced before that date still start and look healthy, but
> fail on every call — `search-docs` returns `404 Not Found`, `retrieve-doc`
> returns `Main content section not found`. Full analysis:
> [kaitpw/Rvt_Docs_MCP#3](https://github.com/kaitpw/Rvt_Docs_MCP/issues/3).
>
> **Get working binaries from
> [this repository's Releases](https://github.com/Alexandrisius/Rvt_Docs_MCP/releases)**
> (`v1.0.6` and newer), or build from source — see [Setup](#setup).
>
> ### What changed in this fork
>
> - **Search** now targets the new endpoint
>   `GET https://rvtdocs.com/search/v2/api/`. The `fields` parameter is mandatory:
>   without it the backend returns an empty result set.
> - **Page scraper rewritten** for the redesigned layout — it anchors on stable CSS
>   classes instead of HTML template comments, and additionally extracts
>   Parameters / Exceptions / Return Value as tables, the overload tree and the C#
>   syntax block. VB / C++ / F# tabs and the Discussion / Community Snippets cards are
>   dropped on purpose to keep responses token-cheap. The official SDK `Examples` card
>   is available on demand via `includeExamples: true` (off by default).
> - **Fewer round trips** (`v1.0.8`): a member page with overloads returns every
>   overload's C# signature in the same call, search results carry the declaring type of
>   each member (plus an obsolete flag), and a 404 on an inherited member points at the
>   type that actually declares it.
> - **Resilience**: both search sources are queried with `Promise.allSettled`, so a
>   dead source degrades the result set instead of failing the whole call; in
>   `retrieve-docs` one unreachable page no longer discards pages already fetched.
> - **Version range** widened to 2020-2027 to match site coverage.

## Overview

Because of the absurd surface area of the Revit API, AI often hallucinates
classes, methods, properties, or even entire namespaces. Furthermore, useful,
but unofficial or uncommon uses of the API are so niche that AI's have no
knowledge of it. To curb this, this MCP server provides LLMs access to Revit API
documentation and other related content (see
[Rvt_Docs_Tbc_Embedder](https://github.com/kaitpw/Rvt_Docs_TBC_Embedder)). Under
the hood, it uses both rvtdocs.com and revitapidocs.com, and if enabled, the
Building Coder Blog.

Simply ask your MCP client what the Revit API docs say about something and it
will use a combination of tools to explore the API docs on its own.

### Features

- **Search Revit API**: Search for classes, methods, and properties (or any API
  entity) in the Revit API documentation.
- **Access Documentation**: Retrieve the content of an API entity's docs page
  either via the url or the entities name.
- **Search/Access TBC Blog**: Perform semantic search over a vector space of The
  Building Coder blog embeddings.

### Features (Planned)

- **Code Examples**: the official SDK example that ships with a docs page is already
  available per call (`includeExamples: true` on `retrieve-doc` / `retrieve-docs`).
  What is still missing is *community* code: Get code examples for Revit API usage and
  make them accessible. See
  [RevitSdkSamples](https://github.com/jeremytammik/RevitSdkSamples) and
  [the_building_coder_samples](https://github.com/jeremytammik/the_building_coder_samples)
  (both MIT). Or maybe even entire repos, like those from ricuan-io, Nice3point,
  chuongmep, kilkellym, and of course jeremytammik. Note that The Building Coder blog
  itself moved off Typepad (shut down August 2025) to
  [jeremytammik.github.io/tbc](https://jeremytammik.github.io/tbc/a/) — MIT-licensed,
  with a complete post index and a Pagefind full-text index, so it is now practical to
  consume without scraping.
- **More Resources**: Add other content to the vector store. Candidates include
  tbc-related pdfs, random blog posts, and Autodesk University resources.
- **Caching (Unlikely)**: Cache responses to reduce traffic to the api doc
  sites.

## Tools

This repository provides four MCP tools for working with Revit API
documentation:

- **`search-docs`** - Search Revit API documentation to find entities matching
  your query. Returns entity names, descriptions, namespaces, types, and URL
  slugs for further exploration (but not the documentation itself). A member
  result also carries `declaringType` - the type that declares it, which is where
  its page lives when the member is inherited - and `isObsolete` when the entity
  is deprecated (the field is omitted otherwise). Results are deduplicated: both
  documentation sites index the same entity, once under a readable slug and once
  under a bare page id, and only the readable one (the one with a description) is
  returned.

- **`retrieve-doc`** - Retrieve a single Revit API documentation page using its
  URL slug. Use this after getting a URL slug from a search operation. Pass
  `includeExamples: true` to also get the page's official C# code example (about
  half of all pages have one; it adds ~500-3,300 characters). A member with
  several overloads returns every overload's C# signature in the same call (an
  `## Overload Signatures` section), so you do not have to fetch them one by one.
  An inherited member has no page of its own - `LocationPoint.Rotate` does not
  exist, `Location.Rotate` does - and such a 404 comes back with the slug of the
  type that declares it, so the error is not a dead end.

- **`retrieve-docs`** - Get full documentation content for multiple Revit API
  entities based on a search query. Useful when you need complete documentation
  content, not just search results. Accepts the same `includeExamples` flag, which
  then applies to every retrieved page.

- **`search-library`** - Search a comprehensive library of Revit API learning
  resources including blog posts, code examples, PDFs, and practical guides.
  Powered by OpenAI's vector store for semantic search.

## Setup

Download the executable for your OS from
[**this repository's Releases**](https://github.com/Alexandrisius/Rvt_Docs_MCP/releases)
(`v1.0.6` and newer). Do **not** use the
[upstream releases](https://github.com/kaitpw/Rvt_Docs_MCP/releases) — those builds
predate the rvtdocs.com Search V2 migration and fail on every call (see the fork
notice at the top).

Or clone and build from source:

```bash
git clone https://github.com/Alexandrisius/Rvt_Docs_MCP.git
cd Rvt_Docs_MCP

deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts   # Windows
deno compile -A --output Rvt_Docs_MCP main.ts               # macOS / Linux
```

`deno task compile` works too, but Deno then names the binary after the entrypoint
(`main.exe`). Pass `--output` explicitly when the name matters, because that is the
name you put into your MCP config. Cross-compiling from any OS:

```bash
deno compile -A --target x86_64-pc-windows-msvc --output Rvt_Docs_MCP-windows.exe main.ts
deno compile -A --target aarch64-apple-darwin  --output Rvt_Docs_MCP-macos-arm64   main.ts
```

Add this executable somewhere in your file system that makes sense. Good practice
for Windows is `<username>/bin/`, but it can be anywhere — including a `tools/`
folder inside your project, which lets you use a project-relative path in the MCP
config and commit that config to git.

Run `path\to\executable -h` in your terminal to see the help menu. FYI: This
executable is useless to run in the terminal besides for the help menu and for
testing the command you will be adding to your mcp config.

### Abbreviated Help Menu

To use the MCP server, add the executable to your mcp config for whatever MCP
client and OS your using.

```json
{
  "mcpServers": {
    "revit-api-docs (macos-arm64)": {
      "command": "path/to/Rvt_Docs_MCP-macos-arm64"
    },
    "revit-api-docs (macos-x64)": {
      "command": "path/to/Rvt_Docs_MCP-macos-x64"
    },
    "revit-api-docs (windows)": {
      "command": "path\\to\\Rvt_Docs_MCP-windows.exe"
    },
    "revit-api-docs (with search-library enabled)": {
      "command": "path\\to\\Rvt_Docs_MCP-windows.exe",
      "args": ["-v", "vs_xxx", "-k", "sk-proj-xxx"]

    }
  }
}
```

### opencode config

opencode uses a different shape (`mcp` + `type: local` + `command` as an array).
Project-relative paths are resolved from the project root, so the config below can
be committed to git while the executable itself stays untracked:

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

Verify with `opencode mcp list` — expect `✓ revit-api-docs connected`. Restart
opencode after editing the config; already-running sessions do not pick up new
servers. Keep the executable out of git (it is ~93 MB and GitHub blocks files over
100 MB): add `*.exe` to `.gitignore` and commit only the config.

For a detailed step-by-step walkthrough — prerequisites, getting the binary,
config, `.gitignore`, verification, in-session smoke tests with expected output, a
11-row troubleshooting table and a ready-to-paste `AGENTS.md` block that stops the
agent from misusing the tools — see
[`docs/INSTALL-opencode-ru.md`](docs/INSTALL-opencode-ru.md) (Russian).

To enable search-library, you must first follow the steps described in
[Rvt_Docs_Tbc_Embedder](https://github.com/kaitpw/Rvt_Docs_TBC_Embedder). After
doing so, run the executable with the `-k` (OpenAI API key) and `-v` (OpenAI
vector store ID) flags as seen above. To verify that this runs properly, run the
command on its own in your terminal. The ouput is informative, though as
mentioned above its meaningless otherwise.

## Development & Contribution

**Working on this repository with an AI agent (or by hand)? Read
[`AGENTS.md`](AGENTS.md) first.** It describes what the project is and why this fork
exists, the tool contract that downstream users depend on, the exact
build / verify / release commands (there is no automated test suite — verification is
a manual MCP stdio smoke test), the failure modes we have already lived through, and
the invariants that must not be broken (for example: never push a `v*` tag unless you
intend to publish a public release, and stdout belongs to JSON-RPC only).

This project is open everything. Please contribute. Frankly I've never released
code for others to use before so I don't really know how licensing and pull
requests work so bear with me. Any help on anything is appreciated.

**Another note on licensing. I am using both rvtdocs.com and revitapidocs.com
search API's (which I ripped from the network console). I am concerned about the
legality of this but could not find licenses for them. I don't intend to do
anything in bad faith, so please tell me if this is wrong.**

This project uses Deno as the runtime. You can simply run the MCP server with
`deno task dev`. I've made this command such that it runs the mcp inspector on
localhost and listens to the repo with HMR. The HMR is a little slow since the
inspector runs it so just mindful of that.

The source code should hopefully be self explanatory and I'm open to any new
tools being added. My only stipulation is that you must set up an easy pipeline
to make the tool usable if it requires further setup (for example
[Rvt_Docs_Tbc_Embedder](https://github.com/kaitpw/Rvt_Docs_TBC_Embedder)).

A simple cross platform compilation is set up with Deno in Github workflows. To
trigger a build make a new git tag. Then push with `git push --follow-tags`.
