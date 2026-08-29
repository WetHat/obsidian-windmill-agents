import { ArticleData, Transformation, addTransformations, extractFromHtml } from "@extractus/article-extractor";
import { IScrapedData, IScrapeResult } from "/f/lib/scrape_web_content_browserless"
import { createClient } from "redis"
import { convert_to_markdown } from "/f/lib/html_to_markdown"
import { DOMParser } from "linkedom";

const allowedAttributes: Record<string, string[]> = {
  h1: ["id"],
  h2: ["id"],
  h3: ["id"],
  h4: ["id"],
  h5: ["id"],
  h6: ["id"],
  a: ["href", "target", "title"],
  abbr: ["title"],
  progress: ["value", "max"],
  img: ["src", "srcset", "alt", "title"],
  picture: ["media", "srcset"],
  video: ["controls", "width", "height", "autoplay", "muted", "loop", "src"],
  audio: ["controls", "width", "height", "autoplay", "muted", "loop", "src"],
  source: ["src", "srcset", "data-srcset", "type", "media", "sizes"],
  iframe: ["src", "frameborder", "height", "width", "scrolling", "allow"],
  svg: ["width", "height"],
  div: ["class"],
  code: ["class"]
};

/**
 * Detect elements which are most likely code.
 *
 * @returns instance of this class for method chaining.
 */
function detectCode(body: HTMLElement): void {
  // custom code block handling for custom tags typically originating from static site generators.
  body.querySelectorAll("code-block").forEach(block => {
    const pre_code = block.querySelector("pre,code");
    if (pre_code) {
      // rescue the attributes
      for (const { name, value } of Array.from(block.attributes)) {
        pre_code.setAttribute(name, value);
      }
      block.replaceWith(pre_code);
    }
  });
  body.querySelectorAll("[data-syntax-language],[class*=code]")
    .forEach(e => {
      // identify the <code> element
      let code = e.localName === "code"
        ? e
        : e.querySelectorAll("pre > code");
      if (!code) {
        // must make a `<code>` element
        const codeTxt = e.textContent?.trim() ?? "";
        code = e.ownerDocument.createElement("code");
        let pre = e.localName === "pre"
          ? e
          : e.querySelector("pre");
        if (pre) {
          pre.append(code);
        } else {
          // must make a `<pre>` element too.
          pre = e.ownerDocument.createElement("pre");
          pre.append(code);
          e.replaceChildren(pre);
        }
        code.textContent = codeTxt;
      }
      const lang = e.getAttribute("data-syntax-language");
      if (lang) {
        const langClass = "language-" + lang;
        if (code instanceof HTMLElement) {
          code.className = langClass;
        } else {
          (code as NodeListOf<HTMLElement>).forEach(c => {
            c.className = langClass;
          });
        }
      }
    });
}
/**
  * Cleanup incorrectly used '<code>' elements.
  *
  * Cleanup Criteria: If there are nested `<code>` or `<pre>` elements inside a `<code>` element,
  * the outer `<code>` element is converted to a `<div>`.
  *
  * @returns instance of this class for method chaining.
  */
function cleanupFakeCode(body: HTMLElement): void {
  const fakeCode = body.querySelectorAll("code:has(code),code:has(pre)");
  fakeCode.forEach(code => {
    const parent = code.parentElement;
    if (parent) {
      const div = code.ownerDocument.createElement("div");
      parent.insertBefore(div, code);
      while (code.firstChild) {
        div.append(code.firstChild);
      }
      code.remove();
    }
  });
  // remove all elements that should not be there.
  body.querySelectorAll("code button, code style").forEach(el => { el.remove(); });
}

function flattenSingleRowTable(table: HTMLTableElement): boolean {
  let trs = table.querySelectorAll(":scope > tbody > tr"); // this is static
  if (trs.length == 0) {
    trs = table.querySelectorAll(":scope > tr");
  }
  if (trs.length == 1) {
    trs[0].querySelectorAll(":scope > td").forEach(td => {
      // hoist each td before the table
      const section = table.ownerDocument.createElement("section");
      table.parentElement?.insertBefore(section, table);
      // move all children of td into the section
      while (td.firstChild) {
        section.appendChild(td.firstChild);
      }
    });
    table.remove();
    return true;
  }
  return false;
}

function flattenTables(body: HTMLElement): void {
  const tables = Array.from<HTMLTableElement>(body.getElementsByTagName("table"));
  tables.forEach(table => flattenSingleRowTable(table));
}

const tm: Transformation = {
  patterns: [
    /.*/ // apply to all websites
  ],
  pre: document => {
    const body = document.body;
    cleanupFakeCode(body);
    detectCode(body);
    return document;
  },
  post: document => {
    flattenTables(document.body);
    return document;
  }
};

addTransformations(tm);

/**
 * @param head - The `<head>` element to search within.
 * @param {string} name - Value of the `name` attribute of the `<META>` tags to look for.
 * @returns  A list of strings containing all the values of all matching `<META>` elements.
 */
function getMetaByName(head: HTMLHeadElement, name: string): string[] {
  const metas = [...head.querySelectorAll(`meta[name='${name}'][content]`)];
  return metas.map(meta => meta.getAttribute("content")?.trim() ?? '');
}

/**
 *
 * @param {Element} head - The `<head>` element to search within.
 * @param {string} property - Value of the `property` attribute of the `<META>` tags to look for.
  * @returns  A list of strings containing all the values of all matching `<META>` elements.
 */
function getMetaByProperty(head: HTMLHeadElement, property: string): string[] {
  const metas = [...head.querySelectorAll(`meta[property='${property}'][content]`)];
  return metas.map(meta => meta.getAttribute("content")?.trim() ?? '');
}

export interface IFrontmatter {
  title?: string;
  author?: string | string[],
  description?: string,
  keywords?: string | string[],
  image?: string,
  site?: string,
  publisher?: string,
  published?: string,
  [key: string]: string | string[] | undefined;   // ← allows additional KV pairs
}

function extract_metadata(head: string): IFrontmatter {
  const
    parser = new DOMParser(),
    dom = parser.parseFromString(`<html><head>${head}</head><body></body></html>`, "text/html");

  const standard = [
    "title",
    "author",
    "description",
    "keywords",
    "image"
  ];

  const og = [
    'og:site_name',
    'og:title',
    'og:description',
    'og:type',
    'og:image',
    'og:locale'
  ];

  const article = [
    'article:publisher',
    'article:author',
    'article:published_time',
    'article:tag'
  ];

  const twitter = [
    "twitter:site",
    "twitter:creator",
    "twitter:title",
    "twitter:description",
    "twitter:image"
  ];

  const backfill: Record<string, string[]> = {
    "title": ["og:title", "twitter:title"],
    "author": ['article:author', 'creator', 'dc:creator', "twitter:creator"],
    "site": ['og:site_name', 'twitter:site'],
    "description": ['og:description', "twitter:description"],
    "keywords": ['article:tag'],
    "image": ['og:image', "twitter:image"],
    "publisher": ['article:publisher', "twitter:site"],
    "published": ['article:published_time'],
  };

  // populate open graph property
  const ograph: Record<string, string | string[]> = {};

  // extract the standard porperties
  for (let name of standard) {
    const content = getMetaByName(dom.head, name);
    if (content) {
      ograph[name] = content;
    }
  }

  // extract other OpenGraph metadata
  for (let propgroup of [og, article, twitter]) {
    // extract content for this property group
    for (const property of propgroup) {
      const content = getMetaByProperty(dom.head, property);
      if (content) {
        ograph[property] = content;
      }
    }
  }

  // normalize metadata
  for (let key in ograph) {
    const value = ograph[key];
    if (Array.isArray(value)) {
      switch (value.length) {
        case 0:
          delete ograph[key];
          break;
        case 1:
          ograph[key] = value[0];
          break;
      }
    }
  }

  // backfill missing properties
  for (let key in backfill) {
    if (!(key in ograph)) {
      for (const source of backfill[key]) {
        const content = ograph[source];
        if (content) {
          ograph[key] = content;
          break;
        }
      }
    }
  }

  // special handling for title
  if (!("title" in ograph)) {
    ograph["title"] = dom.title.innerText;
  }

  // cleanup keywords for Obsidian
  const keywords = ograph["keywords"];
  if ("keywords" in ograph && keywords) {
    ograph["keywords"] = (Array.isArray(keywords) ? keywords : [keywords])
      .map(k => typeof k === 'string' ? k.trim().toLowerCase().replace(/\s+/g, '-') : k)
      .join(",");
  }

  return ograph;
}

export interface IMarkdownArticle {
  source: string,
  ttr: number,
  article: string,
  frontmatter: IFrontmatter
}

export async function extract_markdown_article(scraped: IScrapeResult): Promise<IMarkdownArticle> {
  // 0. fetch the scraped content from Redis.
  const client = createClient({ url: "redis://redis:6379" });
  await client.connect();

  const data: IScrapedData = await client.json.get(scraped.source);

  // 1. extract main article 
  const articleData: ArticleData | null = await extractFromHtml(data.body, scraped.source, {
    allowedAttributes
  });

  if (!articleData) {
    throw new Error(`Article extraction for "${scraped.source}" failed`);
  }

  // 2. Create Markdown body
  const markdown = convert_to_markdown(articleData.content ?? "-", scraped.source);

  // 3. Create Opengraph data
  const og = extract_metadata(data.head);

  return {
    source: scraped.source,
    ttr: articleData.ttr ?? 0,
    frontmatter: og,
    article: markdown
  };
}

export async function main(scraped: IScrapeResult): Promise<IMarkdownArticle> {
  return extract_markdown_article(scraped);
}