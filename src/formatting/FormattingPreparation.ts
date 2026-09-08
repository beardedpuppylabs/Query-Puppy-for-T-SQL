import {
  isFormattingTrivia,
  scanFormattingSql,
  type FormattingToken,
  type SourceSpan,
} from "./LosslessSqlScanner.js";

export type FormattingUnitKind =
  "select" | "cte" | "insert" | "update" | "delete";

export interface FormattingBatch {
  readonly range: SourceSpan;
}

export interface FormattingBatchSeparator {
  readonly range: SourceSpan;
  readonly text: string;
  readonly repeatCount: number;
}

export interface FormattingUnit {
  readonly kind: FormattingUnitKind;
  readonly range: SourceSpan;
  readonly text: string;
  readonly terminalSemicolon?: SourceSpan;
}

export interface DeclinedFormattingRegion {
  readonly range: SourceSpan;
  readonly text: string;
  readonly reason: string;
}

export interface FormattingPreparation {
  readonly ok: true;
  readonly source: string;
  readonly tokens: readonly FormattingToken[];
  readonly batches: readonly FormattingBatch[];
  readonly separators: readonly FormattingBatchSeparator[];
  readonly units: readonly FormattingUnit[];
  readonly declined: readonly DeclinedFormattingRegion[];
}

export interface FormattingPreparationFailure {
  readonly ok: false;
  readonly source: string;
  readonly offset: number;
  readonly reason: string;
}

export type FormattingPreparationResult =
  FormattingPreparation | FormattingPreparationFailure;

export type FormattingRangeSelection =
  | { readonly ok: true; readonly unit: FormattingUnit }
  | { readonly ok: false; readonly reason: string };

interface IndexedBatch extends FormattingBatch {
  readonly tokenStart: number;
  readonly tokenEnd: number;
}

interface IndexedLine extends SourceSpan {
  readonly tokenStart: number;
  readonly tokenEnd: number;
}

const supportedStarters = new Set([
  "select",
  "with",
  "insert",
  "update",
  "delete",
]);

const possibleStatementStarters = new Set([
  ...supportedStarters,
  "alter",
  "begin",
  "create",
  "declare",
  "exec",
  "execute",
  "if",
  "merge",
  "set",
  "while",
]);

const wholeBatchStarters = new Set(["alter", "begin", "create", "if", "while"]);

const unsafeEndingWords = new Set([
  "and",
  "as",
  "by",
  "case",
  "else",
  "from",
  "group",
  "having",
  "into",
  "join",
  "on",
  "or",
  "order",
  "output",
  "select",
  "set",
  "then",
  "when",
  "where",
  "with",
]);

const unsafeEndingSymbols = new Set([
  "(",
  ",",
  ".",
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
  "<",
  ">",
  "<=",
  ">=",
  "<>",
  "!=",
]);

const lower = (token: FormattingToken): string =>
  token.text.toLocaleLowerCase("en-US");

const meaningfulTokens = (
  tokens: readonly FormattingToken[],
): readonly FormattingToken[] =>
  tokens.filter((token) => !isFormattingTrivia(token));

const sourceLines = (
  source: string,
  tokens: readonly FormattingToken[],
): readonly IndexedLine[] => {
  const lines: IndexedLine[] = [];
  let start = 0;
  let tokenStart = 0;
  while (start < source.length) {
    const newline = source.indexOf("\n", start);
    const end = newline < 0 ? source.length : newline + 1;
    while (
      tokenStart < tokens.length &&
      (tokens[tokenStart]?.end ?? 0) <= start
    )
      tokenStart++;
    let tokenEnd = tokenStart;
    while (
      tokenEnd < tokens.length &&
      (tokens[tokenEnd]?.start ?? source.length) < end
    )
      tokenEnd++;
    lines.push({ start, end, tokenStart, tokenEnd });
    start = end;
  }
  return lines;
};

const syntaxDepths = (
  tokens: readonly FormattingToken[],
):
  | { readonly ok: true; readonly depths: Int32Array }
  | {
      readonly ok: false;
      readonly offset: number;
      readonly reason: string;
    } => {
  const depths = new Int32Array(tokens.length);
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    depths[index] = depth;
    const token = tokens[index];
    if (token?.kind !== "punctuation") continue;
    if (token.text === "(") depth++;
    else if (token.text === ")") {
      depth--;
      if (depth < 0)
        return {
          ok: false,
          offset: token.start,
          reason: "unbalanced closing parenthesis",
        };
    }
  }
  if (depth !== 0) {
    const opening = [...tokens]
      .reverse()
      .find((token) => token.kind === "punctuation" && token.text === "(");
    return {
      ok: false,
      offset: opening?.start ?? 0,
      reason: "unbalanced parenthesis",
    };
  }
  return { ok: true, depths };
};

const ambiguousSource = (
  source: string,
  tokens: readonly FormattingToken[],
): { readonly offset: number; readonly reason: string } | undefined => {
  for (let index = 0; index < tokens.length - 1; index++) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (
      token?.kind === "punctuation" &&
      token.text === "$" &&
      next?.kind === "punctuation" &&
      next.text === "(" &&
      token.end === next.start
    )
      return { offset: token.start, reason: "template placeholder region" };
  }

  for (const token of tokens) {
    if (!(
      (token.kind === "punctuation" && token.text === ":") ||
      (token.kind === "operator" && token.text === "!")
    ))
      continue;
    const lineStart = source.lastIndexOf("\n", token.start - 1) + 1;
    if (source.slice(lineStart, token.start).trim().length !== 0) continue;
    if (token.text === ":")
      return { offset: token.start, reason: "SQLCMD command region" };
    if (source[token.end] === "!")
      return { offset: token.start, reason: "SQLCMD shell command region" };
  }
  return undefined;
};

const batchSeparators = (
  source: string,
  tokens: readonly FormattingToken[],
  depths: Int32Array,
):
  | {
      readonly ok: true;
      readonly separators: readonly FormattingBatchSeparator[];
    }
  | {
      readonly ok: false;
      readonly offset: number;
      readonly reason: string;
    } => {
  const separators: FormattingBatchSeparator[] = [];
  for (const line of sourceLines(source, tokens)) {
    const firstToken = tokens[line.tokenStart];
    if (
      firstToken?.protected === true &&
      firstToken.start < line.start &&
      firstToken.end > line.start
    )
      continue;

    let index = line.tokenStart;
    while (index < line.tokenEnd && tokens[index]?.kind === "whitespace")
      index++;
    const go = tokens[index];
    if (go?.kind !== "word" || lower(go) !== "go" || depths[index] !== 0)
      continue;

    index++;
    while (index < line.tokenEnd && tokens[index]?.kind === "whitespace")
      index++;

    let repeatCount = 1;
    const repeat = tokens[index];
    if (repeat?.kind === "number") {
      if (!/^[1-9][0-9]*$/.test(repeat.text))
        return {
          ok: false,
          offset: repeat.start,
          reason: "unsupported GO repeat count",
        };
      repeatCount = Number(repeat.text);
      if (!Number.isSafeInteger(repeatCount))
        return {
          ok: false,
          offset: repeat.start,
          reason: "unsupported GO repeat count",
        };
      index++;
    }

    while (index < line.tokenEnd && tokens[index]?.kind === "whitespace")
      index++;
    while (
      index < line.tokenEnd &&
      (tokens[index]?.kind === "lineComment" ||
        tokens[index]?.kind === "blockComment" ||
        tokens[index]?.kind === "whitespace")
    ) {
      const trailing = tokens[index];
      if (trailing?.protected === true && trailing.end > line.end)
        return {
          ok: false,
          offset: trailing.start,
          reason: "unsupported multiline GO separator comment",
        };
      index++;
    }

    if (index !== line.tokenEnd)
      return {
        ok: false,
        offset: tokens[index]?.start ?? go.end,
        reason: "unsupported GO separator form",
      };

    separators.push({
      range: { start: line.start, end: line.end },
      text: source.slice(line.start, line.end),
      repeatCount,
    });
  }
  return { ok: true, separators };
};

const indexedBatches = (
  source: string,
  tokens: readonly FormattingToken[],
  separators: readonly FormattingBatchSeparator[],
): readonly IndexedBatch[] => {
  const ranges: SourceSpan[] = [];
  let start = 0;
  for (const separator of separators) {
    ranges.push({ start, end: separator.range.start });
    start = separator.range.end;
  }
  ranges.push({ start, end: source.length });

  const batches: IndexedBatch[] = [];
  let tokenIndex = 0;
  for (const range of ranges) {
    while (
      tokenIndex < tokens.length &&
      (tokens[tokenIndex]?.end ?? 0) <= range.start
    )
      tokenIndex++;
    const tokenStart = tokenIndex;
    while (
      tokenIndex < tokens.length &&
      (tokens[tokenIndex]?.start ?? source.length) < range.end
    )
      tokenIndex++;
    batches.push({ range, tokenStart, tokenEnd: tokenIndex });
  }
  return batches;
};

const followsSetOperator = (
  tokens: readonly FormattingToken[],
  index: number,
): boolean => {
  const previous = tokens[index - 1]?.text.toLocaleLowerCase("en-US");
  if (["union", "intersect", "except"].includes(previous ?? "")) return true;
  return (
    previous === "all" &&
    tokens[index - 2]?.text.toLocaleLowerCase("en-US") === "union"
  );
};

const additionalStatementReason = (
  tokens: readonly FormattingToken[],
  initial: string,
): string | undefined => {
  const topLevel: FormattingToken[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === "punctuation" && token.text === "(") {
      if (depth === 0) topLevel.push(token);
      depth++;
      continue;
    }
    if (token.kind === "punctuation" && token.text === ")") {
      depth--;
      if (depth === 0) topLevel.push(token);
      continue;
    }
    if (depth === 0) topLevel.push(token);
  }

  let current = initial;
  let cteConsumerConsumed = false;
  let insertSourceConsumed = false;
  for (let index = 1; index < topLevel.length; index++) {
    const token = topLevel[index];
    if (token?.kind !== "word") continue;
    const word = lower(token);
    if (current === "insert" && word === "values") insertSourceConsumed = true;
    if (!possibleStatementStarters.has(word)) continue;

    if (word === "select" && followsSetOperator(topLevel, index)) continue;
    if (current === "with" && !cteConsumerConsumed) {
      cteConsumerConsumed = true;
      current = word;
      continue;
    }
    if (current === "insert" && word === "select" && !insertSourceConsumed) {
      insertSourceConsumed = true;
      current = "select";
      continue;
    }
    if (current === "update" && word === "set") continue;
    if (word === "with" && topLevel[index + 1]?.text === "(") continue;
    return `ambiguous additional top-level ${token.text}`;
  }
  return undefined;
};

const classifyUnit = (
  tokens: readonly FormattingToken[],
):
  | { readonly supported: true; readonly kind: FormattingUnitKind }
  | { readonly supported: false; readonly reason: string } => {
  const body =
    tokens.at(-1)?.kind === "punctuation" && tokens.at(-1)?.text === ";"
      ? tokens.slice(0, -1)
      : tokens;
  const first = body[0];
  if (first?.kind !== "word")
    return { supported: false, reason: "unsupported top-level syntax" };
  const starter = lower(first);
  if (!supportedStarters.has(starter))
    return {
      supported: false,
      reason: `unsupported top-level ${first.text}`,
    };

  let caseDepth = 0;
  for (const token of body) {
    if (token.kind !== "word") continue;
    if (lower(token) === "case") caseDepth++;
    else if (lower(token) === "end" && caseDepth > 0) caseDepth--;
  }
  if (caseDepth !== 0)
    return { supported: false, reason: "incomplete CASE expression" };

  const additional = additionalStatementReason(body, starter);
  if (additional) return { supported: false, reason: additional };

  const last = body.at(-1);
  if (!last) return { supported: false, reason: "empty statement" };
  if (
    (last.kind === "word" && unsafeEndingWords.has(lower(last))) ||
    unsafeEndingSymbols.has(last.text)
  )
    return {
      supported: false,
      reason: `incomplete statement ending at ${last.text}`,
    };

  const topLevelWords: string[] = [];
  let depth = 0;
  for (const token of body) {
    if (token.kind === "punctuation" && token.text === "(") depth++;
    else if (token.kind === "punctuation" && token.text === ")") depth--;
    else if (depth === 0 && token.kind === "word")
      topLevelWords.push(lower(token));
  }

  if (starter === "with") {
    const consumer = topLevelWords
      .slice(1)
      .find((word) => ["select", "insert", "update", "delete"].includes(word));
    if (!consumer)
      return {
        supported: false,
        reason: "CTE has no complete top-level consumer",
      };
  }
  if (
    starter === "insert" &&
    !topLevelWords.some((word) => ["values", "select"].includes(word))
  )
    return { supported: false, reason: "INSERT has no complete source" };
  if (starter === "update" && !topLevelWords.includes("set"))
    return { supported: false, reason: "UPDATE has no SET clause" };

  return {
    supported: true,
    kind: starter === "with" ? "cte" : (starter as FormattingUnitKind),
  };
};

const appendRegion = (
  source: string,
  segmentTokens: readonly FormattingToken[],
  units: FormattingUnit[],
  declined: DeclinedFormattingRegion[],
): void => {
  const meaningful = meaningfulTokens(segmentTokens);
  if (meaningful.length === 0) return;
  const first = meaningful[0];
  const last = meaningful.at(-1);
  if (!first || !last) return;
  const range = { start: first.start, end: last.end };
  const classification = classifyUnit(meaningful);
  if (!classification.supported) {
    declined.push({
      range,
      text: source.slice(range.start, range.end),
      reason: classification.reason,
    });
    return;
  }
  const terminal =
    last.kind === "punctuation" && last.text === ";"
      ? { start: last.start, end: last.end }
      : undefined;
  units.push({
    kind: classification.kind,
    range,
    text: source.slice(range.start, range.end),
    ...(terminal ? { terminalSemicolon: terminal } : {}),
  });
};

const collectUnits = (
  source: string,
  tokens: readonly FormattingToken[],
  depths: Int32Array,
  batches: readonly IndexedBatch[],
): {
  readonly units: readonly FormattingUnit[];
  readonly declined: readonly DeclinedFormattingRegion[];
} => {
  const units: FormattingUnit[] = [];
  const declined: DeclinedFormattingRegion[] = [];
  for (const batch of batches) {
    const batchTokens = tokens.slice(batch.tokenStart, batch.tokenEnd);
    const batchMeaningful = meaningfulTokens(batchTokens);
    const first = batchMeaningful[0];
    const last = batchMeaningful.at(-1);
    if (!first || !last) continue;
    if (first.kind === "word" && wholeBatchStarters.has(lower(first))) {
      const range = { start: first.start, end: last.end };
      declined.push({
        range,
        text: source.slice(range.start, range.end),
        reason: `unsupported procedural or module batch starting with ${first.text}`,
      });
      continue;
    }

    let segmentStart = batch.tokenStart;
    let declinedRemainder = false;
    for (let index = batch.tokenStart; index < batch.tokenEnd; index++) {
      const token = tokens[index];
      if (
        token?.kind !== "punctuation" ||
        token.text !== ";" ||
        depths[index] !== 0
      )
        continue;
      const segment = tokens.slice(segmentStart, index + 1);
      const segmentFirst = meaningfulTokens(segment)[0];
      if (
        segmentFirst?.kind === "word" &&
        wholeBatchStarters.has(lower(segmentFirst))
      ) {
        const range = { start: segmentFirst.start, end: last.end };
        declined.push({
          range,
          text: source.slice(range.start, range.end),
          reason: `unsupported procedural or module batch starting with ${segmentFirst.text}`,
        });
        declinedRemainder = true;
        break;
      }
      appendRegion(source, segment, units, declined);
      segmentStart = index + 1;
    }
    if (declinedRemainder || segmentStart >= batch.tokenEnd) continue;
    const remainder = tokens.slice(segmentStart, batch.tokenEnd);
    const remainderFirst = meaningfulTokens(remainder)[0];
    if (
      remainderFirst?.kind === "word" &&
      wholeBatchStarters.has(lower(remainderFirst))
    ) {
      const range = { start: remainderFirst.start, end: last.end };
      declined.push({
        range,
        text: source.slice(range.start, range.end),
        reason: `unsupported procedural or module batch starting with ${remainderFirst.text}`,
      });
      continue;
    }
    appendRegion(source, remainder, units, declined);
  }
  return { units, declined };
};

/** Prepares exact original-source units without producing or applying edits. */
export function prepareFormattingDocument(
  source: string,
): FormattingPreparationResult {
  const scan = scanFormattingSql(source);
  if (!scan.ok)
    return {
      ok: false,
      source,
      offset: scan.error.offset,
      reason: scan.error.reason,
    };

  const ambiguous = ambiguousSource(source, scan.tokens);
  if (ambiguous) return { ok: false, source, ...ambiguous };

  const syntax = syntaxDepths(scan.tokens);
  if (!syntax.ok)
    return { ok: false, source, offset: syntax.offset, reason: syntax.reason };

  const separatorResult = batchSeparators(source, scan.tokens, syntax.depths);
  if (!separatorResult.ok)
    return {
      ok: false,
      source,
      offset: separatorResult.offset,
      reason: separatorResult.reason,
    };

  const batches = indexedBatches(
    source,
    scan.tokens,
    separatorResult.separators,
  );
  const collected = collectUnits(source, scan.tokens, syntax.depths, batches);
  return {
    ok: true,
    source,
    tokens: scan.tokens,
    batches: batches.map(({ range }) => ({ range })),
    separators: separatorResult.separators,
    units: collected.units,
    declined: collected.declined,
  };
}

/** Selects only a range that exactly equals one prepared supported unit. */
export function selectExactFormattingUnit(
  preparation: FormattingPreparationResult,
  range: SourceSpan,
): FormattingRangeSelection {
  if (!preparation.ok) return { ok: false, reason: preparation.reason };
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start ||
    range.end > preparation.source.length
  )
    return { ok: false, reason: "invalid formatting range" };

  const unit = preparation.units.find(
    (candidate) =>
      candidate.range.start === range.start &&
      candidate.range.end === range.end,
  );
  if (unit) return { ok: true, unit };

  const declined = preparation.declined.find(
    (candidate) =>
      candidate.range.start === range.start &&
      candidate.range.end === range.end,
  );
  return {
    ok: false,
    reason:
      declined?.reason ??
      "range is not exactly one complete supported top-level formatting unit",
  };
}
