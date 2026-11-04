import * as wmill from "windmill-client"
import { createClient } from "redis"
import { IItem } from '/f/lib/read_rss_feed'

export async function main(handle: string): Promise<IItem> {
  const client = createClient({ url: await wmill.getVariable('f/lib/redis_client_url')});
  await client.connect();

  return client.json.get(handle);
}
