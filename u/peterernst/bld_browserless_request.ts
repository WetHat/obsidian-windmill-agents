//import * as wmill from "windmill-client";

export async function main(url: string) {
  const browserlessURL = new URL('http://browserless:3000/scrape');
  browserlessURL.searchParams.append('token', "6R0W53R135510");
  browserlessURL.searchParams.append('launch', '{"stealth":true,"headless":false}');

  const
    body = {
      url,
      elements: [
        { "selector": "html" }
        //    { "selector": "head" },
        //    { "selector": "body" }
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
