import { type JSONObject } from "/f/lib/extract_markdown_table_data"

interface IResponse {
  ok: boolean;
  status: number;
  text: string;
}

type TSeverity = "Critical" | "High" | "Medium" | "Low";

interface IPredicate {
  name: string,
  predicate: string
}

interface ISeverity {
  severity: TSeverity,
  weight: number
}

interface IWeightedPredicate extends IPredicate, ISeverity {
}

interface IScoredPredicate extends IPredicate {
  score: number;
}

/**
 * Operational-quality scores compiled from the decision API's predicate answers.
 *
 * @remarks
 * Inherits `ok` and `status` from the HTTP response unchanged; the response body
 * is replaced with enriched answers and aggregate scores.
 *
 * Negative answers use negated severity weights and are grouped by severity.
 * Positive answers have weight 1 and no severity. Each answer's score is its
 * weight multiplied by its probability. All buckets are sorted by score ascending.
 *
 * Aggregate totals and maximum scores include only answers actually returned
 * by the API, not every configured predicate. With positive severity-table
 * weights, negative totals and their maximum are non-positive. Their ratio is
 * a rounded percentage indicating bad-pattern presence: higher is worse.
 * The positive ratio is a rounded percentage indicating good-pattern presence:
 * higher is better. Either normalized score is 0 when its denominator is 0.
 */
interface IScores extends Omit<IResponse, "text"> {
  /** Enriched predicate answers and aggregates, separated by pattern polarity. */
  answers: {
    /** bad-pattern scores and answer buckets. Sorted by score descending */
    negative: IScoredPredicate[],

    /** good-pattern scores and answers. Sorted by score ascending. */
    positive: IScoredPredicate[]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireSeverity(value: unknown, label: string): TSeverity {
  switch (value) {
    case "Critical":
    case "High":
    case "Medium":
    case "Low":
      return value;
    default:
      throw new Error(`${label} has an unknown severity: ${String(value)}`);
  }
}

/**
 * Compile decision API answers into weighted operational-quality scores.
 *
 * @param x - HTTP response whose `text` is JSON containing a non-empty `answers`
 * array. Each answer must have a configured predicate `name`, a non-empty `type`,
 * and a finite numeric `probability` between 0 and 1 inclusive. The HTTP `ok` and
 * `status` fields are passed through, not used to gate scoring.
 * @param tables - Markdown table data in positional order: table 0 maps
 * `Severity` (Critical, High, Medium, Low) to numeric-convertible finite `Weight`;
 * table 1 defines negative predicates with `name`, `severity`, and `predicate`;
 * table 2 defines positive predicates with `name` and `predicate`. Additional
 * tables are ignored. Severity weights are negated; positive weights are 1.
 * @returns HTTP status metadata plus enriched answers, ascending-score buckets,
 * raw totals, maximum scores, and rounded normalized percentages. A zero
 * denominator produces a normalized score of 0.
 *
 * @throws {@link SyntaxError}
 * If `x.text` is not valid JSON.
 * @throws {@link Error}
 * If the response has no usable answers, the first three tables are missing or
 * not arrays, a required string or severity is invalid, a weight is non-finite
 * or missing for a negative predicate, or an answer has an invalid probability
 * or references an unknown predicate name.
 *
 * @remarks
 * Predicate metadata comes from the tables, not from the API answer's `type`.
 * Scores and maxima cover returned answers only; missing answers are not filled
 * in, and duplicates are counted separately. Duplicate predicate names use the
 * last definition encountered, with positive definitions processed last.
 */
export async function main(x: IResponse, tables: JSONObject[][]): Promise<IScores> {
  const response: JSONObject = JSON.parse(x.text);
  // check that the decision API returned a good response
  if (!isRecord(response) || !Array.isArray(response.answers) || response.answers.length === 0) {
    throw new Error("No usable score returned");
  }
  // check we have the predicate tables
  if (!Array.isArray(tables)
    || tables.length < 3
    || ![tables[0], tables[1], tables[2]].every(Array.isArray)) {
    throw new Error("Expected severity, negative-predicate, and positive-predicate tables");
  }

  // map severities from table 0 to weights
  const severity_to_weight = new Map<TSeverity, number>();
  for (const row of tables[0]) {
    const severity = requireSeverity(row.Severity, "Severity table row");

    const weight = Number(row.Weight);
    if (!Number.isFinite(weight)) {
      throw new Error(`Weight for ${severity} must be a finite number`);
    }
    severity_to_weight.set(severity, weight);
  }


  // map names to weighted (bad)  predicate records
  const name_to_bad_predicate = new Map<string, IWeightedPredicate>();
  // negative predicates
  for (const row of tables[1]) {
    const
      name = requireString(row.name, "Negative predicate name"),
      severity = requireSeverity(row.severity, `Predicate ${name}`),
      weight = severity_to_weight.get(severity);
    if (weight === undefined) {
      throw new Error(`No weight configured for severity ${severity} (predicate ${name})`);
    }
    name_to_bad_predicate.set(name, {
      name,
      predicate: requireString(row.predicate, `Predicate text for ${name}`),
      severity,
      weight,
    });
  }

  // positive predicates
  const name_to_good_predicate = new Map<string, IPredicate>();
  for (const row of tables[2]) {
    const name = requireString(row.name, "Positive predicate name");
    name_to_good_predicate.set(name, {
      name,
      predicate: requireString(row.predicate, `Predicate text for ${name}`),
    });
  }

  // Assemble scores.
  const
    good_scores: IScoredPredicate[] = [],
    bad_scores: IScoredPredicate[] = [];

  for (const answer of response.answers) {
    const name = String(answer.name);
    let probability = Number(answer.probability);
    if (!isFinite(probability)) {
      probability = 0.0;
    }

    const good_predicate = name_to_good_predicate.get(name);
    if (good_predicate) {
      good_scores.push({
        name,
        predicate: String(good_predicate.predicate),
        score: probability
      });
    } else {
      const bad_predicate = name_to_bad_predicate.get(name);
      if (bad_predicate) {
        const
          weight = severity_to_weight.get(bad_predicate.severity) ?? 1.0,
          score = weight * probability;

        bad_scores.push({
          name,
          predicate: bad_predicate.predicate,
          score
        });
      }
    }
  }
  // Sort fully populated good scores answer bucket by score ascending.
  good_scores.sort((a, b) => a.score - b.score);
  // Sort fully populated bad scores answer bucket by score descending.
  bad_scores.sort((a, b) => b.score - a.score);

  return {
    ok: x.ok,
    status: x.status,
    answers: {
      negative: bad_scores,
      positive: good_scores,
    },
  };
}