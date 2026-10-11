// import * as wmill from "windmill-client"

export interface IDomain {
  domain: string,
  relevance: number
}

export async function main(response: { ok: boolean, text: string }): Promise<IDomain> {
  const
    json = JSON.parse(response.text),
    answers = json.answers,
    best_score = answers.reduce((max, cur) => (cur.score > max.score ? cur : max), answers[0]),
    best_domain = {
      domain: best_score.name,
      relevance: Math.round(best_score.score * 20)
    };

  if (best_domain.relevance <= 20) {
    best_domain.domain = 'Et Cetera';
    best_domain.relevance = 100 - best_domain.relevance
  }
  return best_domain;
}
