// import * as wmill from "windmill-client"
import { IScrapedData, scrape_web_content } from "/f/lib/scrape_web_content_browserless"
import { IArticle, extract_article } from "/f/lib/extract_markdown_article"
import { IItem } from "/f/lib/read_rss_feed"
export async function main(item: IItem): Promise<IItem> {
  const scraped: IScrapedData = await scrape_web_content(item.link);

  if (!scraped.ok) {
    throw new Error(`Scraping web page '${item.link}' failed with status ${scraped.status}`)
  }

  const article: IArticle = await extract_article(item.link, scraped.head, scraped.head);
  if (!article.article) {
    throw new Error(`Article extraction from ${item.link} failed`)
  }

  item.ttr = article.ttr;
  item.content = article.article;

  return item;
}
