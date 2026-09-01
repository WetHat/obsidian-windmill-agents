import {
  convert,
  ListIndentType,
  LinkStyle,
  NodeContext,
  ConversionOptions,
  VisitorHandle,
} from "@xberg-io/html-to-markdown";


/**
 * Resolves relative links against an optional source URL.
 *
 * When initialized with a URL, the resolver derives the URL origin and the
 * containing path. Absolute links and links without a configured origin are
 * returned unchanged. Root-relative links are resolved against the origin,
 * while other relative links are resolved against the containing path.
 */
class LinkResolver {
  origin?: string;
  location?: string;

  constructor(url?: string) {
    if (url) {
      const u = new URL(url);
      this.origin = u.origin;

      const i = u.pathname.lastIndexOf("/");
      this.location = i <= 0 ? this.origin : u.pathname.slice(0, i)
    }
  }

  /**
   * Resolves a link against the source URL configured for this instance.
   *
   * Links are returned unchanged when no source origin is available or when
   * they already contain a protocol separator. Root-relative links are
   * resolved against the source origin; other relative links are resolved
   * against the source URL's containing path.
   *
   * @param link - The link to resolve, which may be absolute, root-relative,
   *   or relative to the source URL's containing path.
   * @returns The original link or the link resolved against the configured
   *   source URL.
   */
  resolve(link: string): string {
    if (!this.origin || link.includes('://')) {
      return link;
    }

    if (link.startsWith('/')) {
      return `${this.origin}${link}}`;
    }

    return `${this.location}/${link}`
  }
}

function createVisitor(url?: string): VisitorHandle {
  let inPre = false;
  const link_resolver = new LinkResolver(url);

  return {
    visitElementStart(ctx: NodeContext) {
      switch (ctx.tagName) {
        case "pre":
          inPre = true;
          break;
      }
      return "continue";
    },

    visitElementEnd(ctx: NodeContext) {
      switch (ctx.tagName) {
        case "pre":
          inPre = false;
          break;
      }
      return "continue";
    },
    visitVideo(ctx: NodeContext, src: string) {
      // Obsidian hack for videos
      const url = link_resolver.resolve(src);
      return `![video](${url})`
    },
    visitLineBreak() {
      return inPre ? { custom: "⏎" } : "continue";
    },
  };
}

const OPTIONS: Omit<ConversionOptions, "visitor"> = {
  listIndentType: ListIndentType.Tabs,
  listIndentWidth: 1,
  compactTables: true,
  defaultTitle: true,
  extractMetadata: false,
  includeDocumentStructure: false,
  linkStyle: LinkStyle.Inline,
  brInTables: false,
  captureSvg: true,
  inferDimensions: true,
  excludeSelectors: [
    // Tier 1 — non-content
    "style", "script", "noscript", "template", "meta",
    "link[rel='stylesheet']", "link[rel='preload']", "link[rel='prefetch']",

    // Tier 2 — layout chrome
    "header", "footer", "nav", "aside",
    "[role='navigation']", "[role='banner']", "[role='complementary']",
    "[aria-hidden='true']",

    // Tier 3 — ads & tracking
    "[class*='advert']", //"[class*='ad']", "[id*='ad']",
    "[class*='promo']", "[class*='banner']",
    "[class*='cookie']", "[class*='tracking']", "[class*='analytics']",
    "iframe",

    // Tier 4 — interactive junk
    "button", "input", "select", "textarea",
    "[role='button']", "[role='dialog']", "[role='tooltip']",
    "[role='tablist']", "[role='tab']", "[role='switch']",

    // Tier 5 — CMS chrome
    "[class*='sidebar']", "[class*='toolbar']", "[class*='breadcrumb']",
    "[class*='pagination']", "[class*='social']",
    "[class*='login']", "[class*='signup']",
  ]

};

/**
 * Converts HTML to Markdown using configured conversion options and custom
 * visitors.
 *
 * The conversion is configured for tab-indented lists, compact tables, inline
 * links, SVG capture, inferred dimensions, and exclusion of `<style>` and
 * `<script>` elements. `<video>` elements are rendered as Obsidian-compatible
 * Markdown image links, and line breaks inside `<pre>` elements are normalized
 * before the result is returned.
 *
 * @param html - The HTML source to convert. At runtime, a nullish value falls
 *   back to `"-"` before conversion.
 * @param url - Optional url used to determine base url link resolition
 * @returns The converted Markdown content, or `"-"` if the converter returns
 *   no content.
 */
export function convert_to_markdown(html: string, url?: string): string {
  const
    options = {
      ...OPTIONS,
      visitor: createVisitor(url),
    };
  const result = convert(html ?? "-", options);

  return (result.content ?? "-")
    .replaceAll(/⏎\n\n/g, "\n")
    .replaceAll(/⏎/g, "");
}

export async function main(html: string, url?: string): Promise<string> {
  return convert_to_markdown(html, url);
}
