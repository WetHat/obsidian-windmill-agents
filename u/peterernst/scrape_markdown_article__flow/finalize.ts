import { IMarkdownArticle } from "/f/lib/extract_markdown_article"
import { createClient } from "redis"

export async function main(md_article: IMarkdownArticle): Promise<IMarkdownArticle> {
  const client = createClient({ url: "redis://redis:6379" });
  await client.connect();
  await client.del(md_article.source);
  return md_article;
}