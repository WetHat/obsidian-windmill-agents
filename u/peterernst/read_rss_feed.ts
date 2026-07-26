import * as wmill from "windmill-client"
import { extract, FeedData, ReaderOptions, FeedEntry } from "@extractus/feed-extractor";

type TAssetType = '?' | 'audio' | 'video' | 'image'; // type of asset

interface IRssAsset {
  src: string; // hyperlink to object
  type: TAssetType;
  width?: string; // optional embedding width
  height?: string; // optional embedding height
}

interface IFeed extends FeedData {
  image?: IRssAsset;
  tags: string[]; // a list of tags describing the feed.
  items: IItem[];
  scanned: string; // ISO date of item retrieval
}

interface IItem extends FeedEntry {
  tags: string[]; // a list of tags describing the item.
  published: string; // publish date
  authors: string[]; // one or more authors
  image?: IRssAsset; // The items image
  media: IRssAsset[]; // A list of assets associated with the articles
  content?: string; // Optional item content (in most cases a HTML fragment)
}

//=====================

/**
 * Get the _signature_ image associated with a feed or item
 * @param elem
 * @returns Image medium object, if available.
 */
function assembleImage(elem: Record<string, unknown>): IRssAsset | null {
  let { image } = elem as any;

  if (typeof image === 'string') {
    return { src: image, type: 'image' };
  }

  if (image && image.url) {
    const
      { url, width, height } = image as any,
      img: IRssAsset = { src: url, type: 'image' };
    if (width) {
      img.width = width;
    }
    if (height) {
      img.height = height;
    }
    return img;
  }

  let thumb = elem["media:thumbnail"] as any;
  if (!thumb) {
    const group = elem["media:group"] as any;
    if (group) {
      thumb = group["media:thumbnail"] as any;
    }
  }

  if (thumb) {
    const
      [width, height] = [thumb["@_width"], thumb["@_height"]],
      img: IRssAsset = { src: thumb["@_url"], type: 'image' };
    if (width) {
      img.width = width;
    }
    if (height) {
      img.height = height;
    }
    return img;
  }

  const enc = elem.enclosure as any;
  if (enc?.["@_type"]?.includes("image")) {
    return { src: enc["@_url"], type: 'image' };
  }

  let media = elem["media:content"] as any;
  if (media && media["@_type"]?.includes("image")) {
    const
      [width, height] = [media["@_width"], media["@_height"]],
      img: IRssAsset = { src: media["@_url"], type: 'image' };
    if (width) {
      img.width = width;
    }
    if (height) {
      img.height = height;
    }
    return img;
  }
  return null;
}

function assembleDescription(elem: Record<string, any>): string | null {

  let description = elem?.description["#text"] || elem.description || elem["media:description"] as string;
  if (!description) {
    let group = elem["media:group"];
    if (group) {
      description = group["media:description"];
    }
  }

  return description;
}

/**
 * Normalizes and extracts tag/category information from a feed element.
 *
 * This utility handles the inconsistent ways RSS/Atom feeds encode tags:
 * - Some feeds expose a single `category` field as a string.
 * - Others provide an array of category objects.
 * - Some use custom structures such as `{ term: string }` or `{ name: string }`.
 * - Some embed tags inside nested metadata objects.
 *
 * `assembleTags` unifies all of these into a clean `string[]` of tag names.
 *
 * @param elem - A feed element or parsed RSS/Atom item. The function inspects
 *               known tag-related fields such as `category`, `categories`,
 *               `tags`, or nested objects like `{ category: { term } }`.
 *
 * @returns A normalized array of tag strings. Returns an empty array when no
 *          tag-like fields are present or when all extracted values are invalid.
 *
 * @remarks
 * - The function is defensive: it ignores non-string values.
 * - Duplicate tags are removed.
 * - Leading/trailing whitespace is trimmed.
 * - Nested objects are inspected for common tag keys (`term`, `name`, `label`).
 *
 * @see
 * - `assembleImage` — similar normalization helper for image assets.
 * - RSS 2.0 Specification: https://www.rssboard.org/rss-specification
 * - Atom Format: https://datatracker.ietf.org/doc/html/rfc4287
 */
function assembleTags(elem: Record<string, unknown>): string[] {
  if (elem.category === null) {
    elem.category = [];
  } else if (elem.category === 'string') {
    elem.category = [elem.category];
  }

  if (Array.isArray(elem.category)) {
    const tags: string[] = (elem.category as Array<string | object> ?? [])
      .map((c: string | object) => {
        let tag: string | object;
        if (typeof c === "string") {
          tag = c;
        } else if (typeof c === "object") {
          const cObj = c as { [key: string]: string };
          tag = cObj["#text"] || cObj["@_term"] || cObj["@_label"] || c.toString();
        } else {
          tag = '?'
        }
        tag = tag?.replace(/[-+&/]/g, " ");
        tag = tag.replace(/\b\w/g, c => c.toUpperCase());
        return tag.replace(/\s+/, '');

      })
      .join(",") // turn everything into a comma separated list to catch internal commas
      .split(",") // abd pull it apart again
      .map(c => {
        // return one cleaned up category
        return c.trim()
          .replace(/^#|\s*[;"\]\}\)\{\[\(]+\s*/g, "")
          .replaceAll("#", "＃")
          .replaceAll("\s*:\s*", "꞉")
          .replaceAll(".", "۔")
          .replace(/"'/g, "ʹ")
          .replace(/\s*\\+\s*/g, "/")
          .replace(/\s+/g, "_");
      })
      .filter(c => !!c) // remove empty strings;

    // make unique and sort
    return Array.from(new Set<string>(tags)).sort();
  }
  return [];
}

/**
 * Collect author information for the article described by
 * an RSS item.
 * @param elem - The parsed RSS item.
 * @returns Author(s), if available.
 */
function assembleAuthors(elem: Record<string, unknown>): string[] {

  const creator: any = elem.creator || elem["dc:creator"];
  if (creator) {
    return typeof creator === "string" ? [creator] : [creator["#text"] as string];
  }

  const author = elem.author as any;
  if (author) {
    if (typeof author === "string") {
      return [author as string];
    }

    if (author.name === 'string') {
      return [author.name];
    }

    if (Array.isArray(author)) {
      return author.map((a: any) => a.name as string);
    }
  }
  return [];
}

function assembleLink(elem: Record<string, unknown>): string | null {
  let link = elem.link as any;

  if (Array.isArray(link)) {
    for (let l of link) {
      if (l["@_rel"] !== 'self') {
        return l["@_href"];
      }
    }
  }

  if (link === null) {
    return null
  }

  return link["@_href"] || link.toString();
}

// ====================

const READER_OPTIONS: ReaderOptions = {
  normalization: true,
  useISODateFormat: true,
  getExtraFeedFields: (feed_data: Record<string, unknown>): Record<string, unknown> => {

    const image = assembleImage(feed_data);
    if (image) {
      feed_data.image = image;
    }

    feed_data.tags = assembleTags(feed_data);

    const link = assembleLink(feed_data);
    if (link) {
      feed_data.link = link;
    }

    return feed_data;
  },

  getExtraEntryFields: (entry_data: Record<string, unknown>): Record<string, unknown> => {

    let { id, guid } = entry_data as any;
    id = id || guid?.["#text"] || entry_data.link


    const link = assembleLink(entry_data);
    if (link) {
      entry_data.link = link;
    }

    const description = assembleDescription(entry_data)
    if (description) {
      entry_data.description = description;
    }

    entry_data.published = entry_data.published || entry_data.pubDate || new Date().toISOString();
    entry_data.tags = assembleTags(entry_data);
    entry_data.authors = assembleAuthors(entry_data);

    const image = assembleImage(entry_data);
    if (image) {
      entry_data.image = image;
    }

    const content: any = entry_data["content:encoded"] || entry_data.content || entry_data["dc:content"];
    entry_data.content = typeof content === "string" ? content : content["#text"] as string;

    let title = entry_data.title as any;
    if (!title) {
      // a title is mandatory - synthesize one
      title = entry_data.published;
    }
    // remove linefeeds and extra spaces
    entry_data.title = (title["#text"] ?? title).toString().replace(/[\s\r\n]+/g, " ");

    return entry_data;
  },
};

/**
 * Ingests an RSS/Atom feed, normalizes its entries, and returns a list of
 * structured `IItem` objects suitable for downstream processing in Windmill.
 *
 * @param {number} id
 *   Database identifier of the RSS feed from the `rss_feeds` table.
 *
 * @param {string} feed_url
 *   URL of the RSS/Atom feed to fetch. Used both for retrieval and as the
 *   `baseUrl` for resolving relative links inside feed entries.
 *
 * @param {number} item_limit
 *   Maximum number of normalized feed items to return.
 *
 * @param {string} last_scan
 *   ISO timestamp of the previous scan. Included to filter new items.
 *
 * @returns 
 *   A promise resolving to an dataase descriptor for the RSS feed.
 *
 * @description
 * The function performs four main tasks:
 *
 * 1. **Configure Reader Options**  
 *    Sets `READER_OPTIONS.baseUrl = feed_url` so relative URLs inside the feed
 *    resolve correctly.
 *
 * 2. **Fetch & Parse Feed**  
 *    Uses `extract(feed_url, READER_OPTIONS)` to retrieve and parse the feed
 *    into an `IFeed` structure.
 *
 * 3. **Normalize Entries**  
 *    Ensures `feed_data.entries` is an array and maps each raw entry through a
 *    normalization pipeline.
 * 
 * 4. **Apply Item Limit**  
 *    Slices the normalized entries to `item_limit` and returns them.
 */
export async function main(id: number, feed_url: string, item_limit: number, last_scan: string | null) {
  // 1. Fetch + parse RSS feed
  READER_OPTIONS.baseUrl = feed_url;
  const feed_data = await extract(feed_url, READER_OPTIONS) as IFeed;

  // 2. Normalize items
  let entries = Array.isArray(feed_data.entries) ? feed_data.entries : [];

  // 3. Apply item_limit
  entries = entries.slice(0, item_limit);

  let items: IItem[] = entries
    .map((x: FeedEntry) => {
      const i = x as IItem;
      const item: IItem = {
        id: i.id,
        title: i.title,
        link: i.link,
        authors: i.authors,
        published: i.published,
        media: [],
        tags: i.tags
      };
      if (i.description) { item.description = i.description }
      if (i.content) { item.content = i.content }
      return item;
    }) ?? [];

  // 4. keep new items only
  let cutoff;
  if (!last_scan) {
    cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 300);
  } else {
    cutoff = new Date(last_scan)
  }
  items = items.filter(i => {
    const pubdate = new Date(i.published);
    return pubdate >= cutoff;
  });

  // 5. build the return object
  const feed: IFeed = {
    title: feed_data.title || feed_data.description || '',
    tags: feed_data.tags,
    items,
    scanned: new Date().toISOString()
  }
  if (feed_data.image) { feed.image = feed_data.image };
  if (feed_data.link) { feed.link = feed_data.link };

  const sql = wmill.datatable('rss');
  await sql`
    UPDATE rss_feeds
    SET feed_data = ${feed},
        last_scan = CAST(${feed.scanned} AS timestamptz)
    WHERE id = ${id}`.execute();
  // Usually too big for Windmill - must return as asset
  return {
    "table": "rss_feeds",
    "id": id,
    "item_count": feed.items.length,
    "title": feed.title
  };
}
