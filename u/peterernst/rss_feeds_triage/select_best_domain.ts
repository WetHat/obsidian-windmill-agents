// import * as wmill from "windmill-client"

export interface IDomain {
  domain: string,
  relevance: number
}

export async function main(domains: IDomain[]): Promise<IDomain> {
  const best = domains.reduce((max, cur) => (cur.relevance > max.relevance ? cur : max), domains[0]);

  if (best.relevance <= 50) {
    best.domain = 'Et Cetera';
    best.relevance = 100 - best.relevance
  }
  return best;
}
