import * as wmill from "windmill-client"
import { extract_table_data, type JSONObject } from '/f/lib/extract_markdown_table_data'

export interface IDecisionRequest {
  url: string,
  headers: Record<string, string>,
  body: JSONObject
}

export async function main(domains: string, content: string): Promise<IDecisionRequest> {
  const domain_data = extract_table_data(domains);
  if (domain_data?.length !== 2 || !Array.isArray(domain_data[0]) || !Array.isArray(domain_data[1])) {
    throw new Error(`Subject matter domains could not be extracted from '${domains.slice(0, 10)}...'`)
  }

  const
    levels: JSONObject[] = domain_data[0].map(l => {
      return {
        label: l.Label,
        description: l.Description
      }
    }),
    questions: JSONObject[] = domain_data[1].map(d => {
      return {
        type: "score",
        name: d.Domain,
        instructions: `Score relevance using tags: ${d.Tags}`,
        levels
      }
    }),
    api_key = await wmill.getVariable('u/peterernst/openai_api_key'),
    headers = {
      "Authorization": `Bearer ${api_key}`,
      "Content-Type": "application/json"
    },
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
