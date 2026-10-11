import { marked, type Token, type Tokens } from "marked";

export type JSONObject = { [key: string]: JSONObject | JSONObject[] | string | number | boolean | null };

/**
 * Extracts GitHub Flavored Markdown (GFM) tables as arrays of data objects.
 *
 * @remarks
 * Tables are returned in document order, including those nested in lists and
 * blockquotes. Each table produces one array of one KV object per row where:
 * - K = Trimmed column headers
 * - V = Cell values as trimmed strings that preserve inline
 *   Markdown without rendering it or converting values to other types.
 *   Missing cells become empty strings.
 * Header uniqueness is checked after trimming and is case-sensitive.
 *
 * @param markdown - The Markdown document to parse.
 * @returns One array of row KV-objects per table, or an empty array if no tables
 * are found. Each row maps column headers to string cell values.
 * @throws {@link Error}
 * If a table has an empty or duplicate column header after trimming. The error
 * message identifies the table using its one-based position in document order.
 *
 * @example
 * ```ts
 * const tables = extract_table_data(
 *   "| Name | Count |\n| --- | --- |\n| **Alice** | 2 |"
 * );
 * // [[{ Name: "**Alice**", Count: "2" }]]
 * ```
 */
export function extract_table_data(markdown: string): JSONObject[][] {
  const data: JSONObject[][] = [];
  const tokens = marked.lexer(markdown, { gfm: true });

  function visit(nodes: Token[]): void {
    for (const node of nodes) {
      if (node.type === "table") {
        const table = node as Tokens.Table;
        const headers = table.header.map((cell) => cell.text.trim());
        if (headers.some((header) => header.length === 0)) {
          throw new Error(`Table ${data.length + 1} has an empty column header`);
        }
        if (new Set(headers).size !== headers.length) {
          throw new Error(`Table ${data.length + 1} has duplicate column headers`);
        }
        data.push(table.rows.map(row => Object.fromEntries(
          headers.map((header, index) => [header, row[index]?.text.trim() ?? ""])
        )));
      } else if (node.type === "list") {
        for (const item of (node as Tokens.List).items) visit(item.tokens);
      } else if (node.type === "blockquote") {
        visit((node as Tokens.Blockquote).tokens);
      }
    }
  }

  visit(tokens);
  return data;
}

/** Returns one array of row objects per GFM table, in document order.
 * Cell values remain strings, preserving inline Markdown.
 * Empty or duplicate headers are rejected to avoid silently losing cells.
 */
export async function main(markdown: string): Promise<JSONObject[][]> {
  return extract_table_data(markdown);
}
