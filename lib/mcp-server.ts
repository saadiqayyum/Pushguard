import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { scopedReaders } from "@/lib/review-readers"
import { reviewTools } from "@/lib/review-tools"

// Tool calls one MCP request may make. Each request is a fresh, stateless server.
export const MCP_TOOL_CALLS_PER_REQUEST = 20

// The review tools for one repository at its default branch head, read-only.
// read_file is left out: file content reaches a client only through read_lines.
export async function serveMcp(request: Request, body: unknown, installationId: number, repo: string): Promise<Response> {
  const server = new McpServer({ name: "pushguard", version: "1.0.0" })
  const { specs } = reviewTools(
    { installationId, repo, sha: "HEAD", budget: MCP_TOOL_CALLS_PER_REQUEST },
    scopedReaders(installationId, repo, "HEAD"),
    { withFiles: false },
  )
  for (const spec of specs) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.schema.shape, annotations: { readOnlyHint: true, openWorldHint: false } },
      async (args: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: await spec.run(args) }] }),
    )
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request, { parsedBody: body })
  } finally {
    await server.close()
  }
}
