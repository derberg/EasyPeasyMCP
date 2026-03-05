# EasyPeasyMCP

<table><tr>
<td><img src="assets/logo.png" alt="EasyPeasyMCP logo" /></td>
<td>

A lightweight, zero-config [MCP](https://modelcontextprotocol.io/) server for documentation projects.

Give it an `llms-full.txt` file (local path or URL) and optional OpenAPI/AsyncAPI directories. It also hellps you to build one if you do not have it. It registers only the MCP tools that make sense for what you've provided — no code changes, no hard-coded paths.

</td>
</tr></table>

## Table of Contents

- [Why it's different](#why-its-different)
- [When to use this — and when not to](#when-to-use-this--and-when-not-to)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Generating llms-full.txt](#generating-llms-fulltxt)
- [Configuration reference](#configuration-reference)
  - [`easy-peasy-mcp` (MCP server)](#easy-peasy-mcp-mcp-server)
  - [`easy-peasy-build` (llms-full.txt generator)](#easy-peasy-build-llms-fulltxt-generator)
- [Local debugging](#local-debugging)

## Why it's different

* **No RAG, no vector database, no embedding pipeline.**
Search is a case-insensitive line scan with configurable context — all in-process, in memory. For small projects with well-structured content like `llms-full.txt`, this is all you need to get started — no infrastructure, no ops burden, easy to pitch internally. The entire search capability is ~25 lines of vanilla JS with zero runtime dependencies.
* **Any project with an `llms-full.txt` is MCP-enabled in 30 seconds.**
Point `llmsTxt` at a hosted URL and you're done — no local file sync, no pipeline. Docs update, the AI gets fresh content automatically. It's the adoption curve that matters: the [llms.txt standard](https://llmstxt.org/) is becoming the norm for docs sites, and this tool makes every one of them instantly AI-accessible. 

    Don't have an `llms-full.txt` yet? No problem — as long as you have Markdown files, the bundled `easy-peasy-build` CLI will generate one for you from your docs and specs.
* **Conditional tool registration keeps the AI's context clean.**
No OpenAPI directory? No `list_openapi_specs` tool. Tools only appear when the content exists — the MCP surface matches exactly what you've provided.

## When to use this — and when not to

This is a **speed-first tool**. Use it when you need an agent to access new knowledge in minutes, not days — a quick proof of concept, a personal workflow, a demo, or an early internal pilot where getting something working fast matters more than getting it perfect.

For professional, long-term setups shared across teams, you will eventually want a proper **chunk → embed → RAG** pipeline instead. That gives you semantic search (the agent finds *meaning*, not just matching words), much lower token consumption per query, and the ability to scale across large or frequently updated knowledge bases without loading everything into memory. This tool loads the full content on every startup — that's fine for a few hundred KB, but it's a ceiling, not a foundation.

No docs at all? Not even Markdown files? If you're in a real hurry, just ask the agent to scrape the developer portal you depend on — it can crawl the relevant pages and pull the content together. It can even check common locations for OpenAPI or AsyncAPI specs and fetch those too. Combine that with `easy-peasy-build` and you have a working MCP server in minutes, with zero local files to maintain.

The honest summary: use this to validate that AI-assisted documentation is worth investing in. Once it is, graduate to a proper RAG stack.

## How it works

| What you provide | Tools registered |
|---|---|
| `llms-full.txt` | `get_full_documentation`, `search_documentation` |
| OpenAPI directory | `list_openapi_specs`, `get_openapi_spec` |
| AsyncAPI directory | `list_asyncapi_specs`, `get_asyncapi_spec` |

`search_documentation` covers all loaded content (llms-full.txt + all specs).

## Quick start

<table>
<tr>
<th>Option A — Config file</th>
<th>Option B — CLI args</th>
</tr>
<tr>
<td>

Drop an `.easypeasymcp.json` (or `.easypeasymcp.yaml`) in your docs project root:

**JSON:**
```json
{
  "name": "my-project",
  "llmsTxt": "./llms-full.txt",
  "openapi": "./openapi",
  "asyncapi": "./asyncapi",
  "build": {
    "docs": ["./guides", "./api-reference"]
  }
}
```

**YAML:**
```yaml
name: my-project
llmsTxt: ./llms-full.txt
openapi: ./openapi
asyncapi: ./asyncapi
build:
  docs:
    - ./guides
    - ./api-reference
```

Paths are relative to the config file. Omit any key you don't have.
`llmsTxt` can also be a URL. The `build` section is optional — include it if you want the server to regenerate `llms-full.txt` on every startup (add `--rebuild` to the command below).

**Registration requires absolute path to config file** (paths inside the config are relative to it):

```bash
# Use absolute path
claude mcp add my-project npx easy-peasy-mcp@0.0.9 \
  -- --rebuild --config /absolute/path/to/.easypeasymcp.json

# Or convert relative to absolute with shell expansion
claude mcp add my-project npx easy-peasy-mcp@0.0.9 \
  -- --rebuild --config $(pwd)/.easypeasymcp.json
```

</td>
<td>

No config file needed — pass everything directly. Works with URLs too:

```bash
claude mcp add asyncapi npx easy-peasy-mcp@0.0.9 -- \
  --name "asyncapi" \
  --llms https://raw.githubusercontent.com/derberg/EasyPeasyMCP/refs/heads/main/example-llms/asyncapi.txt
```

</td>
</tr>
</table>

## Generating llms-full.txt

<table>
<tr>
<th width="30%">Option A — gitingest.com</th>
<th width="70%">Option B — easy-peasy-build</th>
</tr>
<tr>
<td>

[gitingest.com](https://gitingest.com/) generates a single combined text file from any public repo or website. Good for a one-off grab when you don't need the file to stay in sync with updates.

</td>
<td>

For local Markdown files + OpenAPI/AsyncAPI specs:

```bash
npx --package=easy-peasy-mcp@0.0.9 easy-peasy-build \
  --docs ./guides \
  --docs ./api-reference \
  --openapi ./openapi \
  --asyncapi ./asyncapi \
  --output ./llms-full.txt
```

- `--docs` is repeatable for multiple source directories
- Reads `.md` and `.mdx` files recursively, sorted by name
- OpenAPI/AsyncAPI files are included as code-fenced blocks
- Omit `--output` to print to stdout

To keep `llms-full.txt` fresh automatically, add a `build` section to `.easypeasymcp.json` and pass `--rebuild` when registering the MCP server — it will regenerate on every startup instead of needing a manual run.

</td>
</tr>
</table>

## Configuration reference

### `easy-peasy-mcp` (MCP server)

| CLI flag | Config key | Description |
|---|---|---|
| `--config <path>` | — | Path to `.easypeasymcp.json`. Config file keys are used as defaults; CLI flags override them. |
| `--name <string>` | `name` | Server name, shown in MCP client and embedded in tool descriptions. Defaults to `"docs"`. |
| `--llms <path\|url>` | `llmsTxt` | Path or URL to `llms-full.txt`. Registers `get_full_documentation` and `search_documentation`. |
| `--openapi <dir>` | `openapi` | Path to a directory of OpenAPI specs (JSON/YAML). Registers `list_openapi_specs` and `get_openapi_spec`. |
| `--asyncapi <dir>` | `asyncapi` | Path to a directory of AsyncAPI specs (JSON/YAML). Registers `list_asyncapi_specs` and `get_asyncapi_spec`. |
| `--rebuild` | `build` | Rebuild `llms-full.txt` from local sources on every startup. Requires a config file with a `build` section (see below). |

Config file paths are resolved relative to the config file's location. At least one of `--llms`, `--openapi`, or `--asyncapi` is required.

#### `build` config section

Optional. When present, add `--rebuild` to the `claude mcp add` command and the server will regenerate `llms-full.txt` on every startup.

```json
{
  "name": "my-project",
  "llmsTxt": "./llms-full.txt",
  "openapi": "./openapi",
  "build": {
    "docs": ["./guides", "./api-reference"],
    "title": "My Project"
  }
}
```

`openapi` and `asyncapi` from the top level are reused automatically. `llmsTxt` is the output path.

### `easy-peasy-build` (llms-full.txt generator)

| CLI flag | Description |
|---|---|
| `--docs <dir>` | Markdown source directory. Repeatable for multiple directories. |
| `--openapi <dir>` | OpenAPI spec directory. Files included as code-fenced blocks. |
| `--asyncapi <dir>` | AsyncAPI spec directory. Files included as code-fenced blocks. |
| `--title <string>` | Project title for the generated file header. |
| `--output <path>` | Output file path. Omit to print to stdout. |

## Local debugging

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to interactively test the server:

<table>
<tr>
<th>With config file</th>
<th>With CLI args</th>
</tr>
<tr>
<td>

```bash
npx @modelcontextprotocol/inspector@0.21.1 \
  npx easy-peasy-mcp@0.0.9 -- \
  --config /path/to/.easypeasymcp.json
```

</td>
<td>

```bash
npx @modelcontextprotocol/inspector@0.21.1 \
  npx easy-peasy-mcp@0.0.9 -- \
  --llms /path/to/llms-full.txt \
  --openapi /path/to/openapi
```

</td>
</tr>
</table>

To try it right now without any local files:

```bash
npx @modelcontextprotocol/inspector@0.21.1 \
  npx easy-peasy-mcp@0.0.9 -- \
  --llms https://raw.githubusercontent.com/derberg/EasyPeasyMCP/refs/heads/main/example-llms/asyncapi.txt
```

