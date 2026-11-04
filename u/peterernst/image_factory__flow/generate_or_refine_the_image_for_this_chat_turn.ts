import * as wmill from "windmill-client";
import sharp from "sharp";

const OPENROUTER_RESOURCE = "u/peterernst/openrouter_api_key";
const MODEL = "google/gemini-3.1-flash-image";
const DATATABLE = "image_cache";
const STORED_WIDTH = 768;
const STORED_QUALITY = 80;
const CHAT_MAX_BASE64_CHARS = 60000;
const HISTORY_LIMIT = 20;

const SYSTEM_PROMPT =
  "You generate and edit one single image across a multi-turn conversation. " +
  "Turn 1: create the image described by the user. " +
  "Every later turn: apply only the change the user asks for to the image attached in the message, " +
  "and keep every other element unchanged. Keep subject, composition and style consistent unless the user changes them. " +
  "Always return an image.";

function toBase64(dataUrl: string): string {
  return dataUrl.startsWith("data:") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
}

// The chat rejects oversized results, so the returned image is compressed until it fits.
async function encodeForChat(input: Buffer): Promise<Buffer> {
  const sizes: [number, number][] = [
    [768, 80],
    [640, 78],
    [512, 74],
    [448, 70],
    [384, 66],
    [320, 62],
  ];
  let last: Buffer | null = null;
  for (const [width, quality] of sizes) {
    last = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (last.toString("base64").length <= CHAT_MAX_BASE64_CHARS) {
      return last;
    }
  }
  return last as Buffer;
}

export async function main(user_message: string, memory_id?: string) {
  const conversation_id = (memory_id ?? "").trim();
  if (!conversation_id) {
    throw new Error("memory_id is missing: this flow must run from the chat interface");
  }

  const sql = wmill.datatable(DATATABLE);

  const previous: any = await sql`
    SELECT image_data_url
    FROM public.image_factory_turns
    WHERE conversation_id = ${conversation_id}
    ORDER BY turn_index DESC
    LIMIT 1
  `.fetchOne();

  const recent: { user_message: string }[] = await sql`
    SELECT user_message
    FROM public.image_factory_turns
    WHERE conversation_id = ${conversation_id}
    ORDER BY turn_index DESC
    LIMIT ${HISTORY_LIMIT}
  `.fetch();

  const turn_index = recent.length;
  const earlier = recent.map((r) => r.user_message).reverse();

  const content: any[] = [];
  if (previous?.image_data_url) {
    content.push({ type: "text", text: "Current image:" });
    content.push({ type: "image_url", image_url: { url: previous.image_data_url } });
  }
  content.push({ type: "text", text: user_message });

  const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
  if (earlier.length > 0) {
    messages.push({
      role: "user",
      content: `Earlier requests in this conversation: ${earlier
        .map((m, i) => `${i + 1}. ${m}`)
        .join(" | ")}`,
    });
  }
  messages.push({ role: "user", content });

  const resource: any = await wmill.getResource(OPENROUTER_RESOURCE);
  const base = resource.base_url || "https://openrouter.ai/api/v1";

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resource.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, modalities: ["image", "text"], messages }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${(await response.text()).slice(0, 1000)}`);
  }

  const json: any = await response.json();
  const returned: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!returned) {
    throw new Error(`OpenRouter returned no image: ${JSON.stringify(json).slice(0, 1000)}`);
  }

  const raw = Buffer.from(toBase64(returned), "base64");

  // Stored version: re-sent to the model on later turns as the image to edit.
  const stored = await sharp(raw)
    .resize({ width: STORED_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: STORED_QUALITY })
    .toBuffer();
  const dataUrl = `data:image/jpeg;base64,${stored.toString("base64")}`;

  await sql`
    INSERT INTO public.image_factory_turns (conversation_id, turn_index, user_message, image_data_url)
    VALUES (${conversation_id}, ${turn_index}, ${user_message}, ${dataUrl})
  `.execute();

  // Returned version: rendered in the chat, so it is kept under the result size limit.
  const shown = await encodeForChat(raw);

  return { jpeg: shown.toString("base64") };
}
