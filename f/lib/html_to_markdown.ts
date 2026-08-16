import {
  convert,
  ListIndentType,
  ConversionOptions,
  LinkStyle,
  VisitorHandle,
  VisitResult
} from "@xberg-io/html-to-markdown"


let inPre = false;

const visitor: VisitorHandle = {
  inPre: false,

  visitElementStart(ctx) {
    if (ctx.tagName === "pre") {
      inPre = true;
    }
    return VisitResult.Continue;
  },

  visitElementEnd(ctx) {
    if (ctx.tagName === "pre") {
      inPre = false;
    }
    return VisitResult.Continue;
  },

  visitLineBreak(ctx) {
    return inPre ? "⏎" : VisitResult.Continue;
  }
};


/**
 * html -> Markdown conversion options
 */
const OPTIONS: ConversionOptions = {
  listIndentType: ListIndentType.Tabs,
  listIndentWidth: 1,
  compactTables: true,
  defaultTitle: true,
  extractMetadata: false,
  includeDocumentStructure: false,
  linkStyle: LinkStyle.Inline,
  captureSvg: true,
  inferDimensions: true,
  excludeSelectors: [
    "style",
    "script"
  ],
  visitor,
};


export async function main(html: string): Promise<string> {
  let markdown = convert(html ?? "-", OPTIONS).content ?? "-";
  // pstprocess the markdown
  markdown = markdown
    .replaceAll(/⏎\n\n/g, '\n')
    .replaceAll(/⏎/g, '');

  return markdown;
}
