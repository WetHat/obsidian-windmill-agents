import * as wmill from "windmill-client"
import { type JSONObject } from "/f/lib/extract_markdown_table_data"

export interface IDecisionRequest {
  url: string,
  headers: Record<string, string>,
  body: JSONObject
}
export async function main(content: string, table_data: JSONObject[][]): Promise<IDecisionRequest> {
  if (table_data?.length !== 1 || !Array.isArray(table_data[0])) {
    throw new Error("Type definitions unavailable!")
  }
  const
    typedefs = table_data[0],
    api_key = await wmill.getVariable('u/peterernst/openai_api_key'),
    headers = {
      "Authorization": `Bearer ${api_key}`,
      "Content-Type": "application/json"
    },
    choices = typedefs.map(d => {
      return {
        value: d.Type,
        description: d.Definition
      }
    }),
    questions = [
      {
        "type": "choice",
        "name": "type",
        "instructions": "Which type best describes the provided Markdown content?",
        choices
      }
    ],
    body: JSONObject = {
      model: "gpt-6-luna",
      input: content,
      questions
    };

  return {
    url: (await wmill.getVariable('f/lib/decisions_url')),
    headers,
    body
  }
}
