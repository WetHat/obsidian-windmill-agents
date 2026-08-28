import { ArticleData, Transformation, addTransformations, extractFromHtml } from "@extractus/article-extractor";
import { IScrapedData, IScrapeResult } from "/f/lib/scrape_web_content_browserless"
import { createClient } from "redis"
import { convert_to_markdown } from "/f/lib/html_to_markdown"

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

export async function main(scraped: IScrapeResult) {
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

  const markdown = convert_to_markdown(articleData.content ?? "-", scraped.source);

  return {
    source: scraped.source,
    ttr: articleData.ttr,
    article: markdown
  };
}