// import * as wmill from "windmill-client"
import { type JSONObject } from "/f/lib/extract_markdown_table_data"

export interface IAIQuestions {
  "domain": {
    "type": string,
    "instructions": string,
    "criteria": JSONObject
  }
}

export async function main(domains: JSONObject[]): Promise<IAIQuestions> {
  const
    questions: IAIQuestions = {
      "domain": {
        type: "choice",
        instructions: "Which subject matter domain, described by its tag list, best matches the provided Markdown content?\nMatch tags to content based on semantic relevance, coverage, and absence of contradictions.",
        criteria: {}
      }
    },
    criteria = questions.domain.criteria;

  for (const d of domains) {
    criteria[d.Domain as string] = d.Tags;
  }
  return questions;
}

