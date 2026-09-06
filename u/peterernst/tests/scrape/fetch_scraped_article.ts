import * as wmill from "windmill-client"
import { IArticle, extract_markdown_article } from "/f/lib/extract_markdown_article"

export async function main(id: number): Promise<IArticle> {
  const
    sql = wmill.datatable('test'),
    record = await sql`SELECT * from web_scrape_test where id = ${id}`.fetchOne();

  if (!record) {
    throw new Error(`No record for scraped content with id ${id} in the database`);
  }
  
  return extract_markdown_article(record.url,record.head,record.body);
}