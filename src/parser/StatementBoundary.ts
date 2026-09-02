import type { SqlToken } from "./SqlTokenizer.js";
import { batchTokenRangeAtCursor, isBatchSeparator } from "./BatchBoundary.js";

export interface StatementTokenRange {
  readonly start: number;
  readonly end: number;
}

const isExplicitBoundary = (token: SqlToken): boolean =>
  token.text === ";" || isBatchSeparator(token);

const tokenDepths = (
  tokens: readonly SqlToken[],
  start: number,
  end: number,
): readonly number[] => {
  let depth = 0;
  const depths: number[] = [];
  for (let index = start; index < end; index++) {
    const token = tokens[index];
    const current = depth;
    if (token?.text === "(") depth++;
    else if (token?.text === ")") depth = Math.max(0, depth - 1);
    depths[index] = current;
  }
  return depths;
};

const continuesSetExpression = (
  tokens: readonly SqlToken[],
  select: number,
): boolean => {
  const previous = tokens[select - 1]?.normalized;
  if (["union", "intersect", "except"].includes(previous ?? "")) return true;
  return previous === "all" && tokens[select - 2]?.normalized === "union";
};

const statementStarter = (token: SqlToken | undefined): string | undefined => {
  if (!token || token.kind !== "identifier" || token.delimited)
    return undefined;
  return [
    "select",
    "insert",
    "update",
    "delete",
    "exec",
    "execute",
    "merge",
    "declare",
    "set",
  ].includes(token.normalized)
    ? token.normalized
    : undefined;
};

const implicitStatementStarts = (
  tokens: readonly SqlToken[],
  start: number,
  end: number,
): readonly number[] => {
  const depths = tokenDepths(tokens, start, end);
  const starts: number[] = [];
  const first = tokens[start];
  let currentKind =
    first?.kind === "identifier" && !first.delimited
      ? first.normalized
      : undefined;
  if (currentKind === "with") starts.push(start);
  let insertSourceConsumed = false;
  for (let index = start; index < end; index++) {
    if (depths[index] !== 0) continue;
    const token = tokens[index];
    const starter = statementStarter(token);
    if (
      currentKind === "insert" &&
      token?.kind === "identifier" &&
      !token.delimited &&
      token.normalized === "values"
    )
      insertSourceConsumed = true;
    if (!starter) continue;
    if (!currentKind) {
      starts.push(index);
      currentKind = starter;
      insertSourceConsumed = false;
      continue;
    }
    if (starter === "select") {
      if (continuesSetExpression(tokens, index)) continue;
      if (currentKind === "with") {
        currentKind = "select";
        continue;
      }
      if (currentKind === "insert" && !insertSourceConsumed) {
        insertSourceConsumed = true;
        continue;
      }
    }
    if (
      currentKind === "insert" &&
      !insertSourceConsumed &&
      ["exec", "execute"].includes(starter)
    ) {
      insertSourceConsumed = true;
      continue;
    }
    if (starter === "set" && currentKind === "update") continue;
    if (
      currentKind === "merge" &&
      ["select", "insert", "update", "delete", "set"].includes(starter)
    )
      continue;
    starts.push(index);
    currentKind = starter;
    insertSourceConsumed = false;
  }
  return starts;
};

/** Enumerates semantic statements across every client batch in source order. */
export function documentStatementTokenRanges(
  tokens: readonly SqlToken[],
): readonly StatementTokenRange[] {
  const ranges: StatementTokenRange[] = [];
  const appendSegment = (start: number, end: number): void => {
    if (start >= end) return;
    const implicitStarts = implicitStatementStarts(tokens, start, end);
    const starts =
      implicitStarts[0] === start ? implicitStarts : [start, ...implicitStarts];
    for (let index = 0; index < starts.length; index++) {
      const statementStart = starts[index];
      const statementEnd = starts[index + 1] ?? end;
      if (statementStart !== undefined && statementStart < statementEnd)
        ranges.push({ start: statementStart, end: statementEnd });
    }
  };

  let segmentStart = 0;
  for (let index = 0; index <= tokens.length; index++) {
    const token = tokens[index];
    if (index < tokens.length && token && !isExplicitBoundary(token)) continue;
    appendSegment(segmentStart, index);
    segmentStart = index + 1;
  }
  return ranges;
}

/**
 * Resolves the semantic statement containing the cursor. Besides explicit `;` and
 * tokenizer-validated `GO` boundaries, supported independent top-level query, DML,
 * declaration, and execution starts form implicit statement boundaries. Nested
 * SELECTs, INSERT SELECT sources, CTE consumers, set branches, and MERGE actions
 * remain part of their containing statement.
 */
export function statementTokenRangeAtCursor(
  tokens: readonly SqlToken[],
  cursor: number,
): StatementTokenRange {
  const batch = batchTokenRangeAtCursor(tokens, cursor);
  let explicitStart = batch.start;
  let explicitEnd = batch.end;
  for (let index = batch.start; index < batch.end; index++) {
    const token = tokens[index];
    if (!token || !isExplicitBoundary(token)) continue;
    if (token.end <= cursor) explicitStart = index + 1;
    else if (token.start >= cursor) {
      explicitEnd = index;
      break;
    }
  }

  const starts = implicitStatementStarts(tokens, explicitStart, explicitEnd);
  let active = -1;
  for (let index = 0; index < starts.length; index++) {
    const statement = starts[index];
    if (statement === undefined || (tokens[statement]?.start ?? 0) >= cursor)
      break;
    active = index;
  }
  if (active < 0) return { start: explicitStart, end: explicitEnd };

  return {
    start: starts[active] ?? explicitStart,
    end: starts[active + 1] ?? explicitEnd,
  };
}
