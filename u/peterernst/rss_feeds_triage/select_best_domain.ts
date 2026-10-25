// import * as wmill from "windmill-client"

export interface IDomain {
  domain: string,
  relevance: number
}

export async function main(output: { domain: { choice: string, confidence: number } }): Promise<IDomain> {
  let
    { choice, confidence } = output.domain,
    relevance = confidence * 100;

  if (relevance < 50) {
    choice = "Et Cetera"
    relevance = 100 - relevance;
  }
  return {
    domain: choice,
    relevance
  };
}
