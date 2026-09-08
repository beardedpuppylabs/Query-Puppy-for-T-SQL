import {
  scanFormattingSql,
  type FormattingToken,
} from "./LosslessSqlScanner.js";

export type FormattingGuardResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

interface CommentAttachment {
  readonly tokenIndex: number;
  readonly sameLineAsPrevious: boolean;
  readonly nextStartsAfterLineBreak: boolean;
}

const nonWhitespaceTokens = (
  tokens: readonly FormattingToken[],
): readonly FormattingToken[] =>
  tokens.filter((token) => token.kind !== "whitespace");

const commentAttachments = (
  source: string,
  tokens: readonly FormattingToken[],
): readonly CommentAttachment[] => {
  const significant = nonWhitespaceTokens(tokens);
  const attachments: CommentAttachment[] = [];
  for (let index = 0; index < significant.length; index++) {
    const token = significant[index];
    if (token?.kind !== "lineComment" && token?.kind !== "blockComment")
      continue;
    const previous = significant[index - 1];
    const next = significant[index + 1];
    attachments.push({
      tokenIndex: index,
      sameLineAsPrevious: previous
        ? !/[\r\n]/.test(source.slice(previous.end, token.start))
        : false,
      nextStartsAfterLineBreak: next
        ? /[\r\n]/.test(source.slice(token.end, next.start))
        : true,
    });
  }
  return attachments;
};

/**
 * Validates one candidate unit output. Only whitespace may change; token spelling,
 * kind, order, comments, and comment line attachment must remain exact.
 */
export function validateFormattingOutput(
  originalUnitText: string,
  candidateText: string,
): FormattingGuardResult {
  const leadingWhitespace = (text: string): string =>
    /^\s*/u.exec(text)?.[0] ?? "";
  const trailingWhitespace = (text: string): string =>
    /\s*$/u.exec(text)?.[0] ?? "";
  if (
    leadingWhitespace(originalUnitText) !== leadingWhitespace(candidateText) ||
    trailingWhitespace(originalUnitText) !== trailingWhitespace(candidateText)
  )
    return { ok: false, reason: "unit boundary whitespace changed" };

  const original = scanFormattingSql(originalUnitText);
  if (!original.ok)
    return { ok: false, reason: `original ${original.error.reason}` };
  const candidate = scanFormattingSql(candidateText);
  if (!candidate.ok)
    return { ok: false, reason: `candidate ${candidate.error.reason}` };

  const before = nonWhitespaceTokens(original.tokens);
  const after = nonWhitespaceTokens(candidate.tokens);
  if (before.length !== after.length)
    return {
      ok: false,
      reason: `non-whitespace token count changed (${String(before.length)} -> ${String(after.length)})`,
    };

  for (let index = 0; index < before.length; index++) {
    const left = before[index];
    const right = after[index];
    if (left && right && left.kind === right.kind && left.text === right.text)
      continue;
    return {
      ok: false,
      reason: `non-whitespace token ${String(index)} changed (${JSON.stringify(
        left && { kind: left.kind, text: left.text },
      )} -> ${JSON.stringify(
        right && { kind: right.kind, text: right.text },
      )})`,
    };
  }

  const beforeAttachments = commentAttachments(
    originalUnitText,
    original.tokens,
  );
  const afterAttachments = commentAttachments(candidateText, candidate.tokens);
  if (
    beforeAttachments.length !== afterAttachments.length ||
    beforeAttachments.some((attachment, index) => {
      const candidateAttachment = afterAttachments[index];
      return (
        attachment.tokenIndex !== candidateAttachment?.tokenIndex ||
        attachment.sameLineAsPrevious !==
          candidateAttachment.sameLineAsPrevious ||
        attachment.nextStartsAfterLineBreak !==
          candidateAttachment.nextStartsAfterLineBreak
      );
    })
  )
    return { ok: false, reason: "comment line attachment changed" };

  return { ok: true };
}
