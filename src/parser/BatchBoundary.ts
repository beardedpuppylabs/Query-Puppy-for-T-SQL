import type { SqlToken } from "./SqlTokenizer.js";

export interface BatchTokenRange {
  readonly start: number;
  readonly end: number;
}

export const isBatchSeparator = (token: SqlToken | undefined): boolean =>
  token?.kind === "batchSeparator";

/** Resolves the client batch containing the cursor from tokenizer-validated GO tokens. */
export function batchTokenRangeAtCursor(
  tokens: readonly SqlToken[],
  cursor: number,
): BatchTokenRange {
  let start = 0;
  let end = tokens.length;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!isBatchSeparator(token)) continue;
    if ((token?.end ?? 0) <= cursor) start = index + 1;
    else if ((token?.start ?? Number.POSITIVE_INFINITY) >= cursor) {
      end = index;
      break;
    }
  }
  return { start, end };
}
