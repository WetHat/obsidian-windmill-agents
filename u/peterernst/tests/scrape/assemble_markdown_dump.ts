import { IMarkdownArticle } from "/f/lib/extract_markdown_article"

export async function main(article: IMarkdownArticle): Promise<string> {
  // let x = await wmill.getVariable('u/user/foo')
  return `# Metadata
  
|Property| Value |
| --- | --- |
| ttr | ${article.ttr}|
| link| ${article.source} |
${Object.entries(article.frontmatter).map(([k,v]) => `|${k}|${v}|`).join('\n')}

# Article

${article.article}
`;
}
