import * as wmill from "windmill-client";
import sharp from "sharp";

const OPENROUTER_RESOURCE = "u/peterernst/openrouter_api_key";
const MODEL = "google/gemini-3.1-flash-image";
const KEY_PREFIX = "image_factory";
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

type Turn = {
  turn_index: number;
  user_message: string;
  image_key: string;
};

function toBase64(dataUrl: string): string {
  return dataUrl.startsWith("data:") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
}

function conversationPrefix(conversation_id: string): string {
  return `${KEY_PREFIX}/${encodeURIComponent(conversation_id)}`;
}

function historyKey(conversation_id: string): string {
  return `${conversationPrefix(conversation_id)}/history.json`;
}

function imageKey(conversation_id: string, turn_index: number): string {
  return `${conversationPrefix(conversation_id)}/turn_${turn_index}.jpg`;
}

function isMissingObject(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /404|NoSuchKey|not found|does not exist/i.test(message);
}

// The whole turn history of a conversation lives in one JSON object in the workspace's primary S3 storage.
async function readHistory(conversation_id: string): Promise<Turn[]> {
  let bytes: Uint8Array | undefined;
  try {
    bytes = await wmill.loadS3File({ s3: historyKey(conversation_id) });
  } catch (error) {
    if (isMissingObject(error)) {
      return [];
    }
    throw error;
  }
  if (!bytes || bytes.length === 0) {
    return [];
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  return Array.isArray(parsed?.turns) ? (parsed.turns as Turn[]) : [];
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

  const history = await readHistory(conversation_id);
  const latest = history.length > 0 ? history[history.length - 1] : undefined;

  const turn_index = history.length;
  const earlier = history
    .slice(Math.max(0, history.length - HISTORY_LIMIT))
    .map((t) => t.user_message);

  const content: any[] = [];
  if (latest?.image_key) {
    const previous = await wmill.loadS3File({ s3: latest.image_key });
    if (previous && previous.length > 0) {
      content.push({ type: "text", text: "Current image:" });
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${Buffer.from(previous).toString("base64")}` },
      });
    }
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

  // Stored version: written to the primary S3 storage and re-sent to the model on later turns.
  const stored = await sharp(raw)
    .resize({ width: STORED_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: STORED_QUALITY })
    .toBuffer();

  const written = await wmill.writeS3File(
    { s3: imageKey(conversation_id, turn_index) },
    new Blob([stored], { type: "image/jpeg" }),
    undefined,
    "image/jpeg",
  );

  const turns: Turn[] = [
    ...history,
    { turn_index, user_message, image_key: written.s3 },
  ];

  await wmill.writeS3File(
    { s3: historyKey(conversation_id) },
    JSON.stringify({ conversation_id, turns }),
    undefined,
    "application/json",
  );

  // Returned version: rendered in the chat, so it is kept under the result size limit.
  const shown = await encodeForChat(raw);

  return { jpeg: shown.toString("base64") };
}