import { IScrapeResult } from "/f/lib/scrape_web_content_browserless"
import { createClient } from "redis"

export async function main(scraped: IScrapeResult, markdown: string): Promise<string> {
  const client = createClient({ url: "redis://redis:6379" });
  await client.connect();
  await client.del(scraped.source);
  return markdown;
}