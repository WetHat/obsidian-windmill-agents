import { convert, ListIndentType, ConversionResult, ConversionOptions } from "@xberg-io/html-to-markdown"

export async function main(html: string): Promise<ConversionResult> {
  const options: ConversionOptions = {
    listIndentType: ListIndentType.Tabs,
    listIndentWidth: 1,
    compactTables: true,
    defaultTitle: true,
  };

  return convert(html, options);

}
