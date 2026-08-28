/**
 * Scrapes a web page with the self-hosted Browserless service and stores the
 * full rendered HTML in Redis, keyed by the scraped URL.
 *
 * The doc comment on `main` documents its parameters and shows how to read the
 * content back out of Redis; `IScrapeResult` documents what `main` returns.
 */
import { createClient } from "redis";

/**
 * Result of a scrape run, as returned by `scrape_web_content`.
 */
export interface IScrapeResult {
  /** Whether the Browserless scrape succeeded (HTTP 2xx). */
  ok: boolean;
  /** HTTP status code returned by Browserless. */
  status: number;
  /** The scraped URL — also the Redis key the rendered HTML is stored under. */
  source: string;
}

/**
 * The shape of the scraped data saved to redis
 */
export interface IScrapedData {
  head: string,
  body: string
}

function build_browserless_request(url: string) {
  const browserlessURL = new URL('http://browserless:3000/scrape');
  browserlessURL.searchParams.append('token', "6R0W53R135510");
  browserlessURL.searchParams.append('launch', '{"stealth":true,"headless":false}');

  const
    body = {
      url,
      elements: [
        // { "selector": "html" }
        { "selector": "head" },
        { "selector": "body" }
      ],
      rejectRequestPattern: [
        "googlesyndication.com",
        "doubleclick.net",
        "adservice.google.com",
        "taboola.com",
        "outbrain.com",
        "facebook.net",
        "adnxs.com",
        "adform.net"
      ],
      gotoOptions: {
        "waitUntil": "domcontentloaded",
        "timeout": 10000
      },
    },
    headers = {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      'sec-ch-ua-platform': 'Windows',
      'sec-ch-ua': '"Chromium";v="123", "Google Chrome";v="123", "Not(A:Brand";v="24"'
    };
  return {
    browserlessURL: browserlessURL.toString(),
    headers,
    body
  };
}


/**
 * Scrapes a web page via Browserless and caches the full rendered HTML in Redis,
 * with the scraped URL itself as the key.
 *
 * Parameters:
 *   url - Absolute URL of the page to scrape, e.g. "https://example.com/page".
 *         Doubles as the Redis key the HTML is stored under, so make sure it is
 *         the canonical URL you want to read the content back with.
 *
 * Returns:
 *   IScrapeResult — see the interface above for field documentation
 *   (ok: scrape succeeded, status: Browserless HTTP status, source: the
 *   scraped URL, which is also the Redis key the HTML is stored under).
 *
 * Example — retrieve the scraped web content via client.get:
 *
 *   import { createClient } from "redis";
 *
 *   const client = createClient({ url: "redis://redis:6379" });
 *   await client.connect();
 *   const scrapedHtml = await client.get(scraped.source);
 */
export async function scrape_web_content(url: string): Promise<IScrapeResult> {
  const
    request = build_browserless_request(url),
    resp = await fetch(request.browserlessURL, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
    });

  // Extract the scraped data

  const
    text = await resp.text(),
    json = JSON.parse(text);

  let head, body;

  for (const d of json.data) {
    switch (d.selector) {
      case "head":
        head = d.results[0].html;
        break;
      case "body":
        body = d.results[0].html;
    }
  }

  const client = createClient({ url: "redis://redis:6379" });
  await client.connect();

  await client.json.set(url, "$", { head, body });

  return {
    ok: resp.ok,
    status: resp.status,
    source: url
  };
}

export async function main(url: string): Promise<IScrapeResult> {
  return scrape_web_content(url);
}