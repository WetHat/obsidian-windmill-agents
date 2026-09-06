// import * as wmill from "windmill-client"
import { IItem } from "/f/lib/read_rss_feed"
import { convert_to_markdown } from "/f/lib/html_to_markdown"

export interface IMarkdownItem extends IItem {
  ttr: number;
}

export async function main(item: IMarkdownItem): Promise<IMarkdownItem> {
  item.content = convert_to_markdown(item.content, item.link);

  if (!item.ttr) {
    item.ttr = Math.round((item.content.match(/\p{L}{2,}\p{M}*|\p{N}+/gu)?.length ?? 0) / 150);
  }
  return item;
}
