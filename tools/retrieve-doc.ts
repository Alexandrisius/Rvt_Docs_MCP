import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractRvtDocsText, suggestInheritedMemberSlug } from "../lib/extractDocs.ts";
import {
  toolDescriptions,
  toolNames,
  toolTitles,
  toolValidators,
} from "../lib/toolsCommon.ts";

/**
 * Creates the extract documentation tool for the MCP server
 * @param server - The MCP server instance
 */
export function createRetrieveDoc(server: McpServer) {
  server.registerTool(
    toolNames.retrieveDoc,
    {
      title: toolTitles.retrieveDoc,
      description: toolDescriptions.retrieveDoc,
      inputSchema: {
        urlSlug: toolValidators.urlSlug,
        includeExamples: toolValidators.includeExamples,
      },
    },
    async ({ urlSlug, includeExamples }) => {
      const fullUrl = urlSlug.startsWith("/")
        ? `https://rvtdocs.com${urlSlug}`
        : `https://rvtdocs.com/${urlSlug}`;

      try {
        return {
          content: [{
            type: "text",
            text: await extractRvtDocsText(fullUrl, { includeExamples }),
          }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : "Unknown error occurred";

        // A 404 on "<Type>.<Member>" usually means the member is inherited and
        // therefore documented on its declaring type ("LocationPoint.Rotate" does
        // not exist, "Location.Rotate" does). Hand back a slug that works instead
        // of leaving the consumer to guess; if the lookup fails, say nothing.
        const inheritedSlug = errorMessage.includes("404")
          ? await suggestInheritedMemberSlug(fullUrl)
          : null;

        return {
          content: [{
            type: "text",
            text:
              `Error extracting documentation from ${fullUrl}: ${errorMessage}` +
              (inheritedSlug
                ? `\n\nThis member is likely declared on a base type. Try: ${inheritedSlug}`
                : ""),
          }],
        };
      }
    },
  );
}
