import * as wmill from "windmill-client"

export async function main(id: number, markdown: string) {
  const sql = wmill.datatable('test');
  await sql`UPDATE web_scrape_test SET markdown = ${markdown} WHERE id = ${id}`.execute();
  return markdown;
}