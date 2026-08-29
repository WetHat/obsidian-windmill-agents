import { IMarkdownArticle, IFrontmatter } from "/f/lib/extract_markdown_article"
import { stringify } from "yaml"

export async function main(article: IMarkdownArticle): Promise<string> {
  const
    meta: IFrontmatter = article.frontmatter,
    frontmatter: Record<string, string | string[] | number> = {
      "type": "web-article",
      "link": article.source,
      "reading-time": article.ttr,
    };

  if (meta.author) {
    frontmatter.authors = Array.isArray(meta.author) ? meta.author : [meta.author]
  }

  if (meta.site) {
    frontmatter.site = meta.site
  }
  // add available metadata
  if (meta.title) {
    frontmatter.title = meta.title;
  }

  if (meta.image) {
    frontmatter.image = meta.image
  }

  if (meta.description) {
    frontmatter.description = meta.description
  }

  if (meta.published) {
    frontmatter.published = meta.published
  }

  // assemble frontmatter
  const note = `---
${stringify(frontmatter)}
---

> [!intro]+${frontmatter.title ? " " + frontmatter.title : ''}
> ${frontmatter.image ? ("![image|float:right|200](" + frontmatter.image + ")") : ''}${frontmatter.description ? frontmatter.description : ''}
${article.article} `;

  return note;
}
