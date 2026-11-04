// import * as wmill from "windmill-client"

interface IAIQuestion {
  location: {
    type: string,
    instructions: string,
    criteria: Record<string, string>
  }
}

const
  NO_FIT_KEY = "_unfiled";

export async function main(folders: string): Promise<IAIQuestion> {
  const
    lines = folders.split(/[\r\n]+/), // strip fencces
    paths: string[][] = [];

  for (const line of lines) {
    const line_trimmed = line.trim();
    if (line_trimmed === "" || line_trimmed === '~~~') {
      continue;
    }
    const level = line.match(/├|│|└| {4}/g)?.length ?? 0; // must not loose indents
    if (level === 0) {
      paths.push([line_trimmed])
    } else {
      const
        folder = line_trimmed.replace(/^[\s─├└│]+/, ''),
        last_path = paths.at(-1),
        this_path = last_path.slice(0, level);
      console.log(`${folder} - ${level}`);
      this_path.push(folder);
      paths.push(this_path)
    }
  }

  const criteria: Record<string, string> = {};
  for (const path of paths) {
    const
      relpath = path.join('/'),
      leaf = path[path.length - 1],
      parent = path.length > 1 ? path.slice(0, -1).join('/') : 'the vault root';

    if (relpath === NO_FIT_KEY) {
      continue;
    }

    criteria[relpath] = [
      `${leaf} (under ${parent}).`,
      `Belongs: content whose primary subject is ${leaf} - that explains, evaluates, compares, reviews or teaches ${leaf}.`,
      `Does not belong: content that only mentions, references, uses, demonstrates or is adjacent to ${leaf}.`
    ].join(' ');
  };
  criteria[NO_FIT_KEY] = "No taxonomy path is the primary subject of the content. Select this rather than forcing a weak match.";

  return {
    location: {
      type: "choice",
      instructions: [
        "Which taxonomy path represents the primary long-term knowledge home of the content?",
        "",
        "Taxonomy Interpretation",
        "Treat each taxonomy path as a category definition rather than a folder.",
        "Each option's description states what belongs in that category and what does not; match the content against those definitions.",
        "Classify according to what the content contributes knowledge about.",
        "The goal is to maximize future discoverability and taxonomy consistency.",
        "",
        "Primary Subject",
        "Identify the primary subject of the content.",
        "The primary subject is the concept, technology, tool, method, framework, or theory receiving the most explanatory coverage.",
        "The primary subject is not necessarily the intended audience, use case, ecosystem, or application domain.",
        "Classify according to the primary subject.",
        "",
        "Subject vs Context",
        "Distinguish between subject and context.",
        "Subject = what is being explained, evaluated, compared, analyzed, reviewed, or taught.",
        "Context = where, why, or how the subject is used.",
        "Always prefer subject over context when choosing a taxonomy path.",
        "",
        "Evidence Hierarchy",
        "Weigh evidence in this order:",
        "1. Title and frontmatter (title, aliases, tags, description): states the subject explicitly. Strongest evidence.",
        "2. Body coverage: the share of the body that explains, evaluates, compares or teaches a subject.",
        "3. Links, backlinks, and passing mentions: shows association, not subject. Weakest evidence.",
        "Discussion of a topic is stronger evidence than mention of a topic.",
        "Evaluation of a topic is stronger evidence than usage of a topic.",
        "Explanatory coverage is stronger evidence than keyword frequency.",
        "Do not classify based on keyword counts.",
        "",
        "Specificity",
        "Prefer the most specific valid taxonomy path.",
        "Prefer leaf categories over parent categories whenever the content is primarily about that leaf.",
        "Select a parent category only when:",
        "- no single child dominates and the content covers two or more of that parent's children with comparable weight, or",
        "- no child represents the content and the parent does.",
        "Intermediate taxonomy paths are selectable under the same test as any other path.",
        "",
        "Do not classify:",
        "- by audience.",
        "- by profession or role.",
        "- by ecosystem membership.",
        "- by technologies that are merely referenced, used, or demonstrated.",
        "- solely because a technology belongs to a larger domain.",
        "",
        "Tie Breaking",
        "When multiple paths appear valid:",
        "1. Determine the primary subject.",
        "2. Determine which candidate path most directly represents that subject.",
        "3. Apply the Specificity rule to decide between a parent and its children.",
        "4. Select that path.",
        "5. If uncertainty remains, select the more specific path.",
        "",
        "No Fit",
        `If no taxonomy path satisfies both Validation statements below, select "${NO_FIT_KEY}".`,
        "Do not select a weak match.",
        "",
        "Validation",
        "Before choosing, verify:",
        "- 'This content is primarily about X.'",
        "- 'This path is the most specific category representing X.'",
        `Select the path only if both statements are true. If either statement is false for every path, select "${NO_FIT_KEY}".`
      ].join("\n"),
      criteria
    }
  }
}
