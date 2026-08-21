// import * as wmill from "windmill-client"
import { createClient } from "redis";
import { IItem } from "/f/lib/read_rss_feed"
export async function main(handle: string): Promise<IItem> {

  const client = createClient({ url: "redis://redis:6379" });
  await client.connect();
  const item = await client.json.get(handle) as IItem;
  return item;
}
