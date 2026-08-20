import {
  convert,
  ListIndentType,
  LinkStyle,
  type ConversionOptions,
  type VisitorHandle,
} from "@xberg-io/html-to-markdown";

function createVisitor(): VisitorHandle {
  let inPre = false;

  return {
    visitElementStart(ctx) {
      switch (ctx.tagName) {
        case "pre":
          inPre = true;
          break;
      }
      return "continue";
    },

    visitElementEnd(ctx) {
      switch (ctx.tagName) {
        case "pre":
          inPre = false;
          break;
      }
      return "continue";
    },
    visitVideo(ctx, src) {
      // Obsidian hack for videos
      return `![video](${src})`
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
  captureSvg: true,
  inferDimensions: true,
  excludeSelectors: ["style", "script"],
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
 * @returns The converted Markdown content, or `"-"` if the converter returns
 *   no content.
 */
export function convert_to_markdown(html: string): string {
  const result = convert(html ?? "-", {
    ...OPTIONS,
    visitor: createVisitor(),
  });

  return (result.content ?? "-")
    .replaceAll(/⏎\n\n/g, "\n")
    .replaceAll(/⏎/g, "");
}

export async function main(html: string): Promise<string> {
  return convert_to_markdown(html);
}
