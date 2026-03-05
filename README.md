# EasyPeasyMCP

A lightweight, zero-config [MCP](https://modelcontextprotocol.io/) server for documentation projects.

Give it an `llms-full.txt` file (local path or URL) and optional OpenAPI/AsyncAPI directories. It registers only the tools that make sense for what you've provided — no code changes, no hard-coded paths.

## Why it's different

* **No RAG, no vector database, no embedding pipeline.**
Search is a case-insensitive line scan with configurable context — all in-process, in memory. For small projects with well-structured content like `llms-full.txt`, this is all you need to get started — no infrastructure, no ops burden, easy to pitch internally. The entire search capability is ~25 lines of vanilla JS with zero runtime dependencies.

    > For larger or longer-term needs, a proper RAG setup with semantic search will outperform this — but that's a problem worth having once you've validated the use case.
* **Any project with an `llms-full.txt` is MCP-enabled in 30 seconds.**
Point `llmsTxt` at a hosted URL and you're done — no local file sync, no pipeline. Docs update, the AI gets fresh content automatically. It's the adoption curve that matters: the [llms.txt standard](https://llmstxt.org/) is becoming the norm for docs sites, and this tool makes every one of them instantly AI-accessible. 

    Don't have an `llms-full.txt` yet? No problem — as long as you have Markdown files, the bundled `easy-peasy-build` CLI will generate one for you from your docs and specs.
* **Conditional tool registration keeps the AI's context clean.**
No OpenAPI directory? No `list_openapi_specs` tool. Tools only appear when the content exists — the MCP surface matches exactly what you've provided.

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

Drop an `.easypeasymcp.json` in your docs project root:

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

Paths are relative to the config file. Omit any key you don't have.
`llmsTxt` can also be a URL. The `build` section is optional — include it if you want the server to regenerate `llms-full.txt` on every startup (add `--rebuild` to the command below).

```bash
claude mcp add my-project npx easy-peasy-mcp \
  -- --rebuild --config /absolute/path/to/.easypeasymcp.json
```

</td>
<td>

No config file needed — pass everything directly. Works with URLs too:

```bash
claude mcp add likec4 npx easy-peasy-mcp -- \
  --name "likec4" \
  --llms https://likec4.dev/llms-full.txt
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
npx easy-peasy-build \
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
npx @modelcontextprotocol/inspector@latest \
  npx easy-peasy-mcp -- \
  --config /path/to/.easypeasymcp.json
```

</td>
<td>

```bash
npx @modelcontextprotocol/inspector@latest \
  npx easy-peasy-mcp -- \
  --llms /path/to/llms-full.txt \
  --openapi /path/to/openapi
```

</td>
</tr>
</table>

To try it right now without any local files:

```bash
npx @modelcontextprotocol/inspector@latest \
  npx easy-peasy-mcp -- \
  --llms https://likec4.dev/llms-full.txt
```

