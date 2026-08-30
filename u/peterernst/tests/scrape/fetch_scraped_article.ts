import * as wmill from "windmill-client"
import { IMarkdownArticle, extract_markdown_article_from_html } from "/f/lib/extract_markdown_article"

export async function main(id: number): Promise<IMarkdownArticle> {
  const
    sql = wmill.datatable('test'),
    record = await sql`SELECT * from web_scrape_test where id = ${id}`.fetchOne();

  if (!record) {
    throw new Error(`No record for scraped content with id ${id} in the database`);
  }
  
  return extract_markdown_article_from_html(record.url,record.head,record.body);
}