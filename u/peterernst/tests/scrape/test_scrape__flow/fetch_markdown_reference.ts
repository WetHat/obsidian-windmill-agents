import * as wmill from "windmill-client"

export async function main(id: number): Promise<string | null> {
  const
    sql = wmill.datatable('test'),
    record = await sql`SELECT markdown from web_scrape_test where id=${id}`.fetchOne();
  if (!record) {
    throw new Error(`No reference data for scrape test ${id} found`)
  }
  return record.markdown ?? null;
}
