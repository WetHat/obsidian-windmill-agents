// import * as wmill from "windmill-client"
import { IScrapedData, scrape_web_content } from "/f/lib/scrape_web_content_browserless"
import { IMarkdownArticle, extract_markdown_article } from "/f/lib/extract_markdown_article"
export async function main(url: string): Promise<string> {

  // 1. scrape the article
  const
    scraped: IScrapedData = await scrape_web_content(url),
    article: IMarkdownArticle = await extract_markdown_article(url, scraped.head, scraped.body);

  return article.article;
}
