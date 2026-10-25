// import * as wmill from "windmill-client"
import { type JSONObject } from "/f/lib/extract_markdown_table_data"

/**
 * Shapes the flow's result from the AI decision step's output.
 *
 * @remarks
 * The flow returns the decision step's `output` as-is, so callers get the chosen
 * content type instead of the step's own envelope. This is the single place to
 * normalise that value (unwrap a wrapper, add fields, coerce types) without
 * touching the decision step itself.
 *
 * @param output - The `output` of the AI decision step, i.e. the answer to the
 * `content_type` question.
 * @returns The value the flow returns to its caller; currently `output`
 * unchanged.
 */
export async function main(output: JSONObject): Promise<JSONObject> {
  return output;
}
