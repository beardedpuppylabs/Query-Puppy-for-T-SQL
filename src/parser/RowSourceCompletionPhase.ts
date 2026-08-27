import { tokenizeSql, type SqlToken } from "./SqlTokenizer.js";

export type RowSourceCompletionPhaseKind =
  "completedObject" | "explicitAs" | "completedAlias";

export interface RowSourceCompletionPhase {
  readonly kind: RowSourceCompletionPhaseKind;
  readonly keyword: "from" | "join" | "apply";
  readonly parts: readonly string[];
  readonly joinAllowsOn: boolean;
}

const identifier = (token: SqlToken | undefined): token is SqlToken =>
  token?.kind === "identifier" ||
  token?.kind === "temp" ||
  token?.kind === "variable";

const endsSourceContinuation = new Set([
  "on",
  "join",
  "apply",
  "where",
  "group",
  "having",
  "order",
  "union",
  "intersect",
  "except",
]);

/**
 * Resolves only the whitespace-delimited phase after a RowSource. Identifier
 * discovery while the cursor still touches the source name remains owned by
 * SqlContextResolver.
 */
export function resolveRowSourceCompletionPhase(
  sql: string,
  cursor: number,
): RowSourceCompletionPhase | undefined {
  if (!/\s/.test(sql[cursor - 1] ?? "")) return undefined;
  const tokens = tokenizeSql(sql.slice(0, cursor));
  let statementStart = 0;
  for (let index = tokens.length - 1; index >= 0; index--) {
    if (tokens[index]?.text === ";" || tokens[index]?.normalized === "go") {
      statementStart = index + 1;
      break;
    }
  }
  let keywordIndex = -1;
  for (let index = tokens.length - 1; index >= statementStart; index--) {
    if (["from", "join", "apply"].includes(tokens[index]?.normalized ?? "")) {
      keywordIndex = index;
      break;
    }
  }
  if (keywordIndex < 0) return undefined;
  const keyword = tokens[keywordIndex]?.normalized as "from" | "join" | "apply";
  const trailing = tokens.slice(keywordIndex + 1);
  if (!identifier(trailing[0])) return undefined;

  const parts = [trailing[0].text];
  let index = 1;
  while (trailing[index]?.text === ".") {
    const part = trailing[index + 1];
    if (!identifier(part)) break;
    parts.push(part.text);
    index += 2;
  }
  if (trailing[index]?.text === "(") {
    let depth = 0;
    do {
      if (trailing[index]?.text === "(") depth++;
      else if (trailing[index]?.text === ")") depth--;
      index++;
    } while (index < trailing.length && depth > 0);
    if (depth !== 0) return undefined;
  }

  const remainder = trailing.slice(index);
  if (remainder.some((token) => endsSourceContinuation.has(token.normalized)))
    return undefined;
  let kind: RowSourceCompletionPhaseKind;
  let boundary: number | undefined;
  if (remainder.length === 0) {
    kind = "completedObject";
    boundary = trailing[index - 1]?.end;
  } else if (remainder.length === 1 && remainder[0]?.normalized === "as") {
    kind = "explicitAs";
    boundary = remainder[0].end;
  } else if (
    (remainder.length === 1 && identifier(remainder[0])) ||
    (remainder.length === 2 &&
      remainder[0]?.normalized === "as" &&
      identifier(remainder[1]))
  ) {
    kind = "completedAlias";
    boundary = remainder.at(-1)?.end;
  } else return undefined;
  if (
    boundary === undefined ||
    boundary >= cursor ||
    !/^\s+$/.test(sql.slice(boundary, cursor))
  )
    return undefined;

  return {
    kind,
    keyword,
    parts,
    joinAllowsOn:
      keyword === "join" && tokens[keywordIndex - 1]?.normalized !== "cross",
  };
}
