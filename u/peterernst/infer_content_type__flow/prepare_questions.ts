// import * as wmill from "windmill-client"
import { type JSONObject } from "/f/lib/extract_markdown_table_data"

/**
 * The question set handed to the flow's AI decision step.
 *
 * @remarks
 * A single choice question named `content_type`, whose `criteria` maps each
 * candidate note type name to the definition the model matches against.
 */
export interface IAIQuestions {
  "content_type": {
    "type": string,
    "instructions": string,
    "criteria": JSONObject
  }
}

/**
 * Builds the AI decision question used to infer the content type of a note.
 *
 * @remarks
 * Only `criteria` varies between runs: every type row becomes one answer, keyed
 * by its `Type` column and described by its `Definition` column. The model
 * therefore chooses among the types declared in the vault's type definitions
 * rather than among free-form labels.
 *
 * @param types - Rows of the note type definitions table, in document order.
 * Each row must carry a `Type` column (the answer value) and a `Definition`
 * column (its description). A later row with the same `Type` overwrites the
 * earlier one.
 * @returns A question set keyed by question name, to be passed to the AI
 * decision step's `questions` input. Empty `criteria` means no types were
 * found and the step has nothing to choose from.
 *
 * @example
 * ```ts
 * const questions = await main([
 *   { Type: "meeting", Definition: "Notes from a meeting" },
 * ]);
 * // { content_type: { type: "choice", instructions: "...",
 * //                   criteria: { meeting: "Notes from a meeting" } } }
 * ```
 */
export async function main(types: JSONObject[]): Promise<IAIQuestions> {
  const
    questions: IAIQuestions = {
      "content_type": {
        type: "choice",
        instructions: "Which type best describes the provided Markdown content?",
        criteria: {}
      }
    },
    criteria = questions.content_type.criteria;

  for (const t of types) {
    criteria[t.Type as string] = t.Definition;
  }
  return questions;
}
