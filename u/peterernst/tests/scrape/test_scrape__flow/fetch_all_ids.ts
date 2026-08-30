import * as wmill from "windmill-client"

export async function main() : Promise<number[]>{

  const
    sql = wmill.datatable('test'),
    records = await sql`SELECT id from web_scrape_test`.fetch();
  return records.map(r => r.id);
}
