import type { SqlToken } from "./SqlTokenizer.js";

export interface StatementTokenRange {
  readonly start: number;
  readonly end: number;
}

const isExplicitBoundary = (token: SqlToken): boolean =>
  token.text === ";" || token.normalized === "go";

const tokenDepths = (tokens: readonly SqlToken[]): readonly number[] => {
  let depth = 0;
  return tokens.map((token) => {
    const current = depth;
    if (token.text === "(") depth++;
    else if (token.text === ")") depth--;
    return current;
  });
};

const continuesSetExpression = (
  tokens: readonly SqlToken[],
  select: number,
): boolean => {
  const previous = tokens[select - 1]?.normalized;
  if (["union", "intersect", "except"].includes(previous ?? "")) return true;
  return previous === "all" && tokens[select - 2]?.normalized === "union";
};

/**
 * Resolves the semantic statement containing the cursor. Besides explicit `;` and
 * `GO` boundaries, a later independent top-level SELECT starts a new statement.
 * SELECTs nested in parentheses and set-operation branches remain part of their
 * containing query expression.
 */
export function statementTokenRangeAtCursor(
  tokens: readonly SqlToken[],
  cursor: number,
): StatementTokenRange {
  let explicitStart = 0;
  let explicitEnd = tokens.length;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token || !isExplicitBoundary(token)) continue;
    if (token.end <= cursor) explicitStart = index + 1;
    else if (token.start >= cursor) {
      explicitEnd = index;
      break;
    }
  }

  const depths = tokenDepths(tokens);
  const topLevelSelects: number[] = [];
  for (let index = explicitStart; index < explicitEnd; index++) {
    if (
      tokens[index]?.normalized === "select" &&
      depths[index] === 0 &&
      !continuesSetExpression(tokens, index)
    )
      topLevelSelects.push(index);
  }

  let activeSelect = -1;
  for (let index = 0; index < topLevelSelects.length; index++) {
    const select = topLevelSelects[index];
    if (select === undefined || (tokens[select]?.start ?? 0) >= cursor) break;
    activeSelect = index;
  }
  if (activeSelect < 0) return { start: explicitStart, end: explicitEnd };

  return {
    start:
      activeSelect === 0
        ? explicitStart
        : (topLevelSelects[activeSelect] ?? explicitStart),
    end: topLevelSelects[activeSelect + 1] ?? explicitEnd,
  };
}
