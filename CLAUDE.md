# EasyPeasyMCP

Lightweight zero-config MCP server. Give it an `llms-full.txt` (path or URL) and optional OpenAPI/AsyncAPI dirs — it registers the right tools automatically.

## Project structure

| File | Purpose |
|---|---|
| `index.js` | MCP server — loads content, registers tools, starts stdio transport |
| `build.js` | CLI tool (`easy-peasy-build`) — generates `llms-full.txt` from local markdown + specs |
| `package.json` | `easy-peasy-mcp` (server) and `easy-peasy-build` (build) bin entries |

## Setup

```bash
npm install
```

## Running locally

```bash
node index.js --llms ./llms-full.txt --openapi ./openapi --name "my-project"
node index.js --config ./.easypeasymcp.json
```

## Registering with Claude Code

```bash
# Via config file (recommended)
claude mcp add my-project node /absolute/path/to/EasyPeasyMCP/index.js -- \
  --config /absolute/path/to/your-project/.easypeasymcp.json

# Via CLI args
claude mcp add my-project node /absolute/path/to/EasyPeasyMCP/index.js -- \
  --name "my-project" \
  --llms /absolute/path/to/llms-full.txt \
  --openapi /absolute/path/to/openapi
```

Note the `--` separator between `node index.js` and the server's own flags.

## .easypeasymcp.json config schema

```json
{
  "name": "my-project",
  "llmsTxt": "./llms-full.txt",
  "openapi": "./openapi",
  "asyncapi": "./asyncapi",
  "build": {
    "docs": ["./guides", "./api-reference"],
    "title": "My Project"
  }
}
```

All paths are relative to the config file's directory. `llmsTxt` can also be a URL. Omit any key you don't have. `build` is optional — when present, `--rebuild` flag triggers regeneration of `llms-full.txt` on server startup.

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server transport and tool registration
- `js-yaml` — parse YAML OpenAPI/AsyncAPI specs into objects (`index.js` only; `build.js` reads YAML as raw strings intentionally)
- `zod` — schema validation for tool parameters

## Key conventions

- Tools are registered **conditionally**: only when the relevant content is provided (no content = no tool)
- YAML specs are parsed with `js-yaml` into objects (same as JSON); returned as JSON via `get_openapi_spec` / `get_asyncapi_spec`
- `search_documentation` covers all loaded content: llms-full.txt + all specs
- Config file paths are resolved relative to the config file's directory
- No build step — plain ESM, `"type": "module"` in package.json

## Debugging

Use absolute paths when running from outside the project directory:

```bash
npx @modelcontextprotocol/inspector@latest node /absolute/path/to/EasyPeasyMCP/index.js -- \
  --config /absolute/path/to/.easypeasymcp.json
```
