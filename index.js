#!/usr/bin/env node
/**
 * EasyPeasyMCP
 *
 * A lightweight, zero-config MCP server. Point it at an llms-full.txt file
 * (path or URL) and optional OpenAPI/AsyncAPI directories — it registers only
 * the tools that make sense for what you've provided.
 *
 * Usage:
 *   node index.js --llms ./llms-full.txt --openapi ./openapi --name "my-project"
 *   node index.js --config ./.easypeasymcp.json
 *
 * Tools registered dynamically:
 *   llmsTxt provided  → get_full_documentation, search_documentation
 *   openapi dir       → list_openapi_specs, get_openapi_spec
 *   asyncapi dir      → list_asyncapi_specs, get_asyncapi_spec
 *   (search covers all loaded content)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname, resolve, basename, extname } from "path";
import { parseArgs } from "util";
import { z } from "zod";
import { load as yamlLoad } from "js-yaml";
import { build } from "./build.js";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    config:   { type: "string" },   // path to .easypeasymcp.json
    llms:     { type: "string" },   // path or URL to llms-full.txt
    openapi:  { type: "string" },   // path to OpenAPI directory
    asyncapi: { type: "string" },   // path to AsyncAPI directory
    name:     { type: "string" },   // project / server name
    rebuild:  { type: "boolean" },  // rebuild llms-full.txt before starting
  },
  strict: false,
});

// ---------------------------------------------------------------------------
// Resolve configuration (file → override with CLI args)
// ---------------------------------------------------------------------------

let cfg = {};

if (args.config) {
  const configPath = resolve(args.config);
  const configDir = dirname(configPath);
  const raw = JSON.parse(readFileSync(configPath, "utf8"));

  // Paths in config are relative to the config file's directory
  const rel = (p) => (p ? resolve(configDir, p) : undefined);

  cfg = {
    name:     raw.name,
    llmsTxt:  raw.llmsTxt?.startsWith("http") ? raw.llmsTxt : rel(raw.llmsTxt),
    openapi:  rel(raw.openapi),
    asyncapi: rel(raw.asyncapi),
    build:    raw.build ? {
      docs:  (raw.build.docs ?? []).map((d) => resolve(configDir, d)),
      title: raw.build.title,
    } : undefined,
  };
}

const projectName  = args.name     || cfg.name     || "docs";
const llmsTxtSrc   = args.llms     || cfg.llmsTxt;                      // path or URL
const openapiDir   = args.openapi  ? resolve(args.openapi)  : cfg.openapi;
const asyncapiDir  = args.asyncapi ? resolve(args.asyncapi) : cfg.asyncapi;

if (!llmsTxtSrc && !openapiDir && !asyncapiDir) {
  console.error(
    "Error: provide at least one of --llms <path|url>, --openapi <dir>, --asyncapi <dir>.\n" +
    "Or point to a config file with --config <path>."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Rebuild llms-full.txt if requested
// ---------------------------------------------------------------------------

if (args.rebuild || cfg.build) {
  if (!cfg.build) {
    console.error("Error: --rebuild requires a config file with a \"build\" section.");
    process.exit(1);
  }
  if (!llmsTxtSrc || llmsTxtSrc.startsWith("http")) {
    console.error("Error: rebuild requires llmsTxt to be a local file path.");
    process.exit(1);
  }
  build({
    docs:     cfg.build.docs,
    openapi:  openapiDir,
    asyncapi: asyncapiDir,
    title:    cfg.build.title ?? projectName,
    output:   llmsTxtSrc,
  });
}

// ---------------------------------------------------------------------------
// Load content into memory at startup
// ---------------------------------------------------------------------------

// llms-full.txt — local file or remote URL
let fullDocs = null;
if (llmsTxtSrc) {
  if (llmsTxtSrc.startsWith("http://") || llmsTxtSrc.startsWith("https://")) {
    const res = await fetch(llmsTxtSrc);
    if (!res.ok) {
      console.error(`Failed to fetch llms-full.txt from ${llmsTxtSrc}: HTTP ${res.status}`);
      process.exit(1);
    }
    fullDocs = await res.text();
  } else {
    fullDocs = readFileSync(resolve(llmsTxtSrc), "utf8");
  }
}

// OpenAPI specs
const openapiSpecs = loadSpecDir(openapiDir);

// AsyncAPI specs
const asyncapiSpecs = loadSpecDir(asyncapiDir);

/**
 * Load all JSON / YAML / YML files from a directory.
 * JSON files are parsed to objects; YAML files are kept as raw strings.
 *
 * @param {string|undefined} dir
 * @returns {Record<string, object|string>}
 */
function loadSpecDir(dir) {
  if (!dir || !existsSync(dir)) return {};
  const specs = {};
  for (const file of readdirSync(dir).sort()) {
    const ext = extname(file).toLowerCase();
    if (![".json", ".yaml", ".yml"].includes(ext)) continue;
    const name = basename(file, ext);
    const raw = readFileSync(join(dir, file), "utf8");
    specs[name] = ext === ".json" ? JSON.parse(raw) : yamlLoad(raw);
  }
  return specs;
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: projectName, version: "1.0.0" });

// — get_full_documentation —————————————————————————————————————————————————
if (fullDocs !== null) {
  server.registerTool(
    "get_full_documentation",
    {
      description:
        `Returns the complete ${projectName} documentation from llms-full.txt. ` +
        "Prefer search_documentation for targeted lookups to avoid loading the entire file.",
    },
    async () => ({ content: [{ type: "text", text: fullDocs }] })
  );
}

// — list_openapi_specs ————————————————————————————————————————————————————
if (Object.keys(openapiSpecs).length > 0) {
  server.registerTool(
    "list_openapi_specs",
    {
      description:
        `Lists all available ${projectName} OpenAPI specifications. ` +
        "Use the returned names with get_openapi_spec to fetch a specific spec.",
    },
    async () => ({
      content: [{ type: "text", text: specSummary(openapiSpecs) }],
    })
  );

  // — get_openapi_spec ——————————————————————————————————————————————————
  server.registerTool(
    "get_openapi_spec",
    {
      description:
        "Returns the full OpenAPI specification for the given name. " +
        "Prefer search_documentation for targeted lookups to avoid loading the entire spec. " +
        "Use list_openapi_specs to discover valid names.",
      inputSchema: { name: z.string().describe("Spec name as returned by list_openapi_specs") },
    },
    async ({ name }) => specResponse(openapiSpecs, name, "list_openapi_specs")
  );
}

// — list_asyncapi_specs ———————————————————————————————————————————————————
if (Object.keys(asyncapiSpecs).length > 0) {
  server.registerTool(
    "list_asyncapi_specs",
    {
      description:
        `Lists all available ${projectName} AsyncAPI specifications. ` +
        "Use the returned names with get_asyncapi_spec to fetch a specific spec.",
    },
    async () => ({
      content: [{ type: "text", text: specSummary(asyncapiSpecs) }],
    })
  );

  // — get_asyncapi_spec —————————————————————————————————————————————————
  server.registerTool(
    "get_asyncapi_spec",
    {
      description:
        "Returns the full AsyncAPI specification for the given name. " +
        "Prefer search_documentation for targeted lookups to avoid loading the entire spec. " +
        "Use list_asyncapi_specs to discover valid names.",
      inputSchema: { name: z.string().describe("Spec name as returned by list_asyncapi_specs") },
    },
    async ({ name }) => specResponse(asyncapiSpecs, name, "list_asyncapi_specs")
  );
}

// — search_documentation ——————————————————————————————————————————————————
const hasAnyContent =
  fullDocs !== null ||
  Object.keys(openapiSpecs).length > 0 ||
  Object.keys(asyncapiSpecs).length > 0;

if (hasAnyContent) {
  server.registerTool(
    "search_documentation",
    {
      description:
        `Searches all loaded ${projectName} documentation (llms-full.txt and any OpenAPI/AsyncAPI specs) ` +
        "for lines containing the query string (case-insensitive). " +
        "Returns matching lines with surrounding context.",
      inputSchema: {
        query: z.string().describe("Keyword or phrase to search for"),
        context_lines: z
          .number()
          .int()
          .min(0)
          .max(20)
          .default(2)
          .describe("Lines of context before and after each match (0–20, default 2)"),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(5)
          .describe("Maximum number of results to return (1–50, default 5)"),
      },
    },
    async ({ query, context_lines = 2, max_results = 5 }) => {
      const lq = query.toLowerCase();
      const results = [];

      if (fullDocs) {
        results.push(...searchLines(fullDocs.split("\n"), lq, context_lines, "llms-full.txt"));
      }
      for (const [name, spec] of Object.entries(openapiSpecs)) {
        const text = typeof spec === "string" ? spec : JSON.stringify(spec, null, 2);
        results.push(...searchLines(text.split("\n"), lq, context_lines, `openapi/${name}`));
      }
      for (const [name, spec] of Object.entries(asyncapiSpecs)) {
        const text = typeof spec === "string" ? spec : JSON.stringify(spec, null, 2);
        results.push(...searchLines(text.split("\n"), lq, context_lines, `asyncapi/${name}`));
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No matches found for "${query}".` }] };
      }

      const truncated = results.length > max_results;
      const output = results
        .slice(0, max_results)
        .map((r) => r.text)
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text",
            text:
              output +
              (truncated
                ? `\n\n[Showing first ${max_results} of ${results.length} matches — refine your query or increase max_results for more.]`
                : ""),
          },
        ],
      };
    }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * One-line summary per spec for listing tools.
 * @param {Record<string, object|string>} specs
 */
function specSummary(specs) {
  return Object.keys(specs)
    .map((name) => {
      const spec = specs[name];
      if (typeof spec === "object") {
        const info = spec.info ?? {};
        const title = info.title ?? "?";
        const version = info.version ?? "?";
        return `${name}  (${title} — ${version})`;
      }
      return name; // YAML kept as raw string — no info to extract
    })
    .join("\n");
}

/**
 * Return a spec's content or an isError response if the name is unknown.
 * @param {Record<string, object|string>} specs
 * @param {string} name
 * @param {string} listTool  name of the listing tool to mention in the error
 */
function specResponse(specs, name, listTool) {
  const spec = specs[name];
  if (!spec) {
    return {
      content: [
        {
          type: "text",
          text: `Unknown spec "${name}". Use ${listTool} to see available names.\nAvailable: ${Object.keys(specs).join(", ")}`,
        },
      ],
      isError: true,
    };
  }
  const text = typeof spec === "string" ? spec : JSON.stringify(spec, null, 2);
  return { content: [{ type: "text", text }] };
}

/**
 * Search lines for a query and return snippets with context.
 * @param {string[]} lines
 * @param {string} lowerQuery
 * @param {number} ctx
 * @param {string} source
 * @returns {{ text: string }[]}
 */
function searchLines(lines, lowerQuery, ctx, source) {
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].toLowerCase().includes(lowerQuery)) continue;
    const start = Math.max(0, i - ctx);
    const end = Math.min(lines.length - 1, i + ctx);
    matches.push({ text: `[${source}:${i + 1}]\n${lines.slice(start, end + 1).join("\n")}` });
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
