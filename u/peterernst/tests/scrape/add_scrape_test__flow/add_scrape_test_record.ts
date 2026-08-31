import * as wmill from "windmill-client"
import { IScrapedData, IScrapeResult } from "/f/lib/scrape_web_content_browserless"
import { createClient } from "redis";

export async function main(scraped: IScrapeResult) {
  const client = createClient({ url: "redis://redis:6379" });
  await client.connect();

  const
    data: IScrapedData = await client.json.get(scraped.source),
    sql = wmill.datatable('test');
    await sql`
      INSERT into web_scrape_test (url, head, body)
      VALUES (${scraped.source},${data.head},${data.body})`.execute();
  await client.del(scraped.source);
  return scraped;
}
