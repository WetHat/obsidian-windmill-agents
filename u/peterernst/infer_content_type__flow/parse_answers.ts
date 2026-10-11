// import * as wmill from "windmill-client"
import { type JSONObject } from "/f/lib/extract_markdown_table_data"

interface IResponse {
  ok: boolean,
  status: number,
  text: string
}

export interface IChoiceDecision {
  ok: boolean,
  status: number,
  answer: JSONObject
}

export async function main(x: IResponse): Promise<IChoiceDecision> {
  const answers = JSON.parse(x.text);
  if (answers?.answers?.length !== 1) {
    throw new Error("No usable choice returned")
  }
  const answer = answers.answers[0];
  delete answer.type;
  delete answer.probabilities;
  return {
    ok: x.ok,
    status: x.status,
    answer
  };
}
