export async function main(url: string, body: object = {}, headers: Record<string, string> = {}) {
  // 1. fetch raw page content
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body)
  }),
    html = await resp.text();

  // 2.  

  return {
    ok: resp.ok,
    status: resp.status,
    text: html.slice(0, 100),
  };
}