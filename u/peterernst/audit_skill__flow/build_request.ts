import * as wmill from "windmill-client"
import { type JSONObject } from "/f/lib/extract_markdown_table_data"

export interface IScoringRequest {
  url: string,
  headers: Record<string, string>,
  body: JSONObject
}

interface IQuestion extends JSONObject {
  type: string,
  name: string,
  instructions: string
}

function predicates_to_questions(predicates: JSONObject[]): IQuestion[] {
  return predicates.map(p => {
    return {
      "type": "predicate",
      "name": String(p.name),
      "instructions": String(p.predicate)
    }
  })
}


export async function main(skill: string, inventory: string, tables: JSONObject[][]) {
  if (tables.length < 3) {
    throw new Error(`Insufficient number of tables: ${tables?.length}`);
  }

  const questions: IQuestion[] = [
    ...predicates_to_questions(tables[1]),
    ...predicates_to_questions(tables[2]),
  ];

  const
    api_key = await wmill.getVariable('u/peterernst/openai_api_key'),
    headers = {
      "Authorization": `Bearer ${api_key}`,
      "Content-Type": "application/json"
    },
    body: JSONObject = {
      model: "gpt-6-luna",
      input: [
        {
          "role": "user",
          "content": [
            {
              "type": "input_text",
              "text": "==Tool and Skill Inventory=="
            },
            {
              "type": "input_json",
              "data": JSON.parse(inventory)
            },
            {
              "type": "input_text",
              "text": "==Agent Skill=="
            },
            {
              "type": "input_text",
              "text": skill
            },
            {
              "type": "input_text",
              "text": "Evaluate the operational quality of the provided agent skill; Use the Tool and Skill Inventory (JSON) to determine which tools and skills are available to the skill"
            }
          ]
        },
      ],
      questions
    };

  return {
    url: (await wmill.getVariable('f/lib/decisions_url')),
    headers,
    body
  }
}
