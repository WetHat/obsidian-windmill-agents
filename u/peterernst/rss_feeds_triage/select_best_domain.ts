// import * as wmill from "windmill-client"

export interface IDomain {
  domain: string,
  relevance: number
}

export async function main(domains: IDomain[]): Promise<IDomain> {
  const
    best = domains.reduce((max, cur) => (cur.relevance > max.relevance ? cur : max), domains[0]);
  return best;
}
