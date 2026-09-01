
import { ArticleData, Transformation, addTransformations, extractFromHtml } from "@extractus/article-extractor";
import { IScrapedData, IScrapeResult } from "/f/lib/scrape_web_content_browserless"
import { createClient } from "redis"
import * as wmill from "windmill-client";
import { convert_to_markdown } from "/f/lib/html_to_markdown"
import { DOMParser } from "linkedom";

type TElementVisitor = (element: Element) => void;
/**
 * A Regular Expression to test for valid HTML attribute and class names.
 */
const VALIDATTR = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;
const BADATTR = /style|-on:/;
const TRIGGERVALUES = /code|lang|main|article|hljs/;

const allowedTags: string[] = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "u",
  "b",
  "i",
  "em",
  "strong",
  "mark",
  "small",
  "sup",
  "sub",
  "div",
  "span",
  "p",
  "article",
  "blockquote",
  "section",
  "details",
  "summary",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "dd",
  "dl",
  "table",
  "th",
  "tr",
  "td",
  "thead",
  "tbody",
  "tfoot",
  "fieldset",
  "legend",
  "figure",
  "figcaption",
  "img",
  "picture",
  "video",
  "audio",
  "source",
  "iframe",
  "progress",
  "br",
  "hr",
  "label",
  "abbr",
  "a",
  "svg",
];

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
  pre: ["class", "data-syntax-language", "data-lang"],
  div: ["class", "data-syntax-language", "data-lang"],
  code: ["class", "data-syntax-language", "data-lang"]
};

function scanElements(element: Element, visitor: TElementVisitor) {
  visitor(element);
  const children = element.children;
  for (let i = 0; i < element.childElementCount; i++) {
    scanElements(children[i], visitor);
  }
}

/**
 * Strips disallowed attributes from every element under `body` in place:
 *
 * - Removes attributes whose names fail {@link VALIDATTR} or match {@link BADATTR}
 *   (inline styles and event handlers).
 * - Rewrites `class` attributes containing multiple tokens down to only the tokens
 *   matching {@link TRIGGERVALUES}; if none remain, the attribute is removed.
 *
 * @param body - Root element to clean; modified in place.
 */
function cleanAttributes(body: HTMLElement): void {
  scanElements(body, (e: Element) => {
    const
      illegalNames: string[] = [],
      attribs = e.attributes,
      attCount = attribs.length;

    for (let i = 0; i < attCount; i++) {
      const
        att = attribs[i],
        name = att.name;
      if (!VALIDATTR.test(name) || BADATTR.test(name)) {
        illegalNames.push(name);
      } else if (name === 'class') {
        const
          parts = att.value.split(/[\s\r\n]+/),
          keep = parts.filter(p => TRIGGERVALUES.test(p));
        if (keep.length === 0) {
          illegalNames.push(name);
        } else {
          att.value = keep.join(' ')
          console.log(`keeping attribute values: ${att.value}`)
        }
      }
    }
    for (const name of illegalNames) {
      e.removeAttribute(name);
    }
  })
}

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
  console.log(`cleanupFakeCode: body ${body.outerHTML.length}`)
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
    console.log(`HTML pre-processing started: body ${body.outerHTML.length}`);

    cleanAttributes(body);
    console.log(`Attributes clean: body=${body.outerHTML.length}`)
    cleanupFakeCode(body);
    detectCode(body);
    console.log(`preprocessed Body ${body.outerHTML.length}`);
    return document;
  },
  post: document => {
    const body = document.documentElement;
    console.log(`HTML post-processing started: content ${body.outerHTML.length}`);
    flattenTables(document.body);
    console.log(`postprocessed content ${body.outerHTML.length}`);
    return document;
  }
};

addTransformations(tm);

/** =========== */
/** Frontmatter */
/** =========== */

/**
 * Page metadata rendered as Markdown frontmatter, collected from the page's `<head>`
 * meta tags (standard, OpenGraph, article, and Twitter) with fallback resolution
 * between the tag families.
 */
export interface IFrontmatter {
  /** Article type */
  type?: string,
  /** Page title. */
  title?: string;
  /** Author name(s). */
  authors?: string[],
  /** Short page description. */
  description?: string,
  /** Tags/keywords, normalized to lowercase hyphenated form and comma-joined. */
  keywords?: string[],
  /** Primary preview/social image URL. */
  image?: string,
  /** Publishing site name (e.g. from `og:site_name`). */
  site?: string,
  /** Publisher name. */
  publisher?: string,
  /** Publish timestamp, as given by `article:published_time`. */
  published?: string,
  /** article expiration date */
  expires?: string,
  /** Any further meta key/value pairs picked up verbatim. */
  [key: string]: string | string[] | undefined;
}

function getMeta(head: HTMLHeadElement, key: string): string[] {
  const
    selector = `meta[name='${key}'][content],meta[property='${key}'][content]`,
    metas = [...head.querySelectorAll(selector)];
  return metas.map(meta => meta.getAttribute("content")?.trim() ?? '');
}

const standard = [
  "title", // page title
  "author", // page author
  "description", // page description
  "keywords", // page keywords
  "image" // page image
];

/** OpenGraph (Facebook) */
const og = [
  'og:site_name', // publishing site name
  'og:title', // OpenGraph page title
  'og:description', // OpenGraph description
  'og:type', // page content type
  'og:image', // preview image URL
  'og:locale', // content locale
];

const article = [
  'article:publisher', // article publisher
  'article:author', // article author
  'article:published_time', // publish timestamp
  'article:modified_time', // modification timestamp
  'article:tag', // article tag
  'article:expiration_time' // content expiration timestamp
];

/** Dublin Core - academic/archival*/
const dc = [
  "dc.title", // Dublin Core title
  "dc.creator", // Dublin Core creator
  "dc.subject", // subject/topic
  "dc.description", // Dublin Core description
  "dc.publisher", // Dublin Core publisher
  "dc.date", // creation date
  "dc.type", // content type
  "dc.language", // content language
  "dc.coverage", // spatiotemporal coverage
  "dc.rights", // usage rights
]

const twitter = [
  "twitter:site", // site Twitter handle
  "twitter:creator", // author Twitter handle
  "twitter:title", // Twitter card title
  "twitter:description", // Twitter card description
  "twitter:image" // Twitter card image
];

/** Marfeel */
const mrf = [
  'mrf:tags', // Marfeel tags
  'mrf:authors' // Marfeel authors
];

type TBackfill = { keys: string[], join: boolean };

const backfill: Record<string, TBackfill> = {
  "title": { keys: ['title', "og:title", "dc:title", "twitter:title"], join: false },
  "authors": { keys: ['author', 'mrf:authors', 'article:author', 'creator', 'dc:creator', "twitter:creator"], join: true },
  "site": { keys: ['og:site_name', 'twitter:site'], join: false },
  "description": { keys: ['description', 'og:description', "twitter:description"], join: false },
  "keywords": { keys: ['article:tag', 'keywords', 'mrf:tags', 'dc.subject'], join: true },
  "image": { keys: ['image', 'og:image', "twitter:image"], join: false },
  "publisher": { keys: ['article:publisher', 'dc:publisher', "twitter:site"], join: false },
  "published": { keys: ['article:published_time', 'article:modified_time'], join: false },
  "type": { keys: ['og:type', `dc:type`], join: false },
  "expires": { keys: ['article:expiration_time'], join: false },
};

function extract_metadata(head: string): IFrontmatter {
  const
    parser = new DOMParser(),
    dom = parser.parseFromString(`<html><head>${head}</head><body></body></html>`, "text/html"),
    headElement: HTMLHeadElement = dom.head,
    title = dom.title?.innerText;

  // populate open graph property
  const ograph: Record<string, string | string[]> = {};

  // 1. Special case for `title`
  if (title) {
    ograph['title'] = title;
  }
  // 2. extract all configured metadata in order
  for (const metagroup of [standard, og, article, dc, mrf, twitter]) {
    // extract content for this group
    for (const key of metagroup) {
      const content = getMeta(headElement, key);
      if (content.length > 0) {
        ograph[key] = content;
      }
    }
  }

  // 3. normalize metadata
  for (let key in ograph) {
    const value = ograph[key];
    if (value.length === 1) {
      ograph[key] = value[0]
    }
  }

  // 4. backfill properties
  for (let key in backfill) {
    const metas = backfill[key];
    if (metas.join) {
      // join all meta content
      const joined = new Set<string>();
      for (const source of backfill[key].keys) {
        const value = ograph[source];
        if (value) {
          const values = Array.isArray(value) ? value : [value];

          for (const v of values) {
            v.split(/[;,]/).forEach(x => joined.add(x.trim()))
          }
        }
      }
      if (joined.size > 0) {
        ograph[key] = [...joined];
      }
    } else if (!(key in ograph)) {
      // pick first awailable metadata
      for (const source of backfill[key].keys) {
        const value = ograph[source];
        if (value) {
          ograph[key] = value;
          break;
        }
      }
    }
  }
  return ograph;
}

/**
 * A web article extracted from scraped HTML and rendered as Markdown.
 */
export interface IMarkdownArticle {
  /** Source URL the article was extracted from. */
  source: string,
  /** Estimated reading time of the article in minutes. */
  ttr: number,
  /** The main article content, rendered as Markdown. */
  article: string,
  /** Metadata from the page's `<head>` (title, author, description, keywords, image, etc.). */
  frontmatter: IFrontmatter
}

/**
 * Extracts the main article from raw HTML and renders it as Markdown with metadata frontmatter.
 *
 * 1. Locates the main article content via `extractFromHtml` (with code-block detection/fixes applied).
 * 2. Converts the extracted HTML to Markdown via `convert_to_markdown`.
 * 3. Builds an {@link IFrontmatter} object from `<head>` metadata (standard, OpenGraph, article, and Twitter tags).
 *
 * @param source - Source URL of the page; used for article extraction and Markdown link resolution.
 * @param head - The page's `<head>` HTML; the source of the metadata.
 * @param body - The page's `<body>` HTML; the source of the article content.
 * @returns The article Markdown, its estimated time-to-read, and the frontmatter metadata.
 * @throws If article extraction fails for the given source.
 */
export async function extract_markdown_article_from_html(source: string, head: string, body: string): Promise<IMarkdownArticle> {
  console.log(`Attempt Article Extraction: head: ${head.length}; body ${body.length}`)
  // 1. extract main article 
  const articleData: ArticleData | null = await extractFromHtml(`<html><head><title>Scraped</title></head><body>${body.replace(/<!--[\s\S]*?-->/g, "")}</body></html>`, source, {
    allowedAttributes,
    allowedTags
  });

  if (!articleData) {
    throw new Error(`Article extraction for "${source}" failed: Head ${head.length}; Body ${body.length}`);
  }

  // 2. Create frontmatter data
  const og = extract_metadata(head);

  // 3. Create Markdown body
  const markdown = convert_to_markdown(`<html><head>${head}</head><body>${articleData.content ?? "-"}</body></html>`, source);

  return {
    source: source,
    ttr: articleData.ttr ?? 0,
    frontmatter: og,
    article: markdown,
  };
}

/**
 * Extracts the main article as Markdown from previously scraped page content.
 *
 * Looks up the scraped page (its `<head>` and `<body>` HTML) in Redis under `scraped.source`,
 * then delegates to {@link extract_markdown_article_from_html}.
 *
 * @param scraped - Scrape result whose `source` URL is the Redis key holding the scraped HTML.
 * @returns The article Markdown, its estimated time-to-read, and the frontmatter metadata.
 * @throws If no Redis record exists for the given source.
 */
export async function extract_markdown_article(scraped: IScrapeResult): Promise<IMarkdownArticle> {
  // 0. fetch the scraped content from Redis.
  const
    url = await wmill.getVariable("f/lib/redis_client_url"),
    client = createClient({ url });
  await client.connect();

  const data: IScrapedData = await client.json.get(scraped.source);

  if (!data) {
    throw new Error(`No Redis record for ${scraped.source}`)
  }

  return extract_markdown_article_from_html(scraped.source, data.head, data.body);
}

export async function main(scraped: IScrapeResult): Promise<IMarkdownArticle> {
  return extract_markdown_article(scraped);
}