import * as wmill from "windmill-client"
import { type JSONObject } from "/f/lib/extract_markdown_table_data"

export async function main(ctx_tables: JSONObject[], content: string): Promise<{ headers: Record<string, string>, body: Record<string, any> }> {
  if (ctx_tables?.length !== 2) {
    throw new Error(`Domain definitions unavalialble`);
  }
  const
    api_key = await wmill.getVariable('u/peterernst/openai_api_key'),
    levels = ctx_tables[0].map(l => {
      return {
        label: l.Label,
        description: l.Description
      }
    }),
    questions = ctx_tables[1].map(d => {
      return {
        type: "score",
        name: d.Domain,
        instructions: `Score relevance using tags: ${d.Tags}`,
        levels
      }
    }),
    headers = {
      "Authorization": `Bearer ${api_key}`,
      "Content-Type": "application/json"
    },
    body = {
      model: "gpt-6-luna",
      input: content,
      questions
    }

  return {
    headers,
    body
  };
}
