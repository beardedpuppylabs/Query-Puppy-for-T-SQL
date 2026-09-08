export type FormattingTokenKind =
  | "whitespace"
  | "word"
  | "number"
  | "string"
  | "quotedIdentifier"
  | "variable"
  | "tempIdentifier"
  | "positionalParameter"
  | "lineComment"
  | "blockComment"
  | "operator"
  | "punctuation";

export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

export interface FormattingToken extends SourceSpan {
  readonly kind: FormattingTokenKind;
  readonly text: string;
  readonly trivia: boolean;
  readonly protected: boolean;
}

export interface FormattingScanError {
  readonly offset: number;
  readonly reason: string;
}

export type FormattingScanResult =
  | {
      readonly ok: true;
      readonly tokens: readonly FormattingToken[];
    }
  | {
      readonly ok: false;
      readonly tokens: readonly FormattingToken[];
      readonly error: FormattingScanError;
    };

const compoundOperators = new Set([
  "!=",
  "!<",
  "!>",
  "%=",
  "&=",
  "*=",
  "+=",
  "-=",
  "/=",
  "::",
  "<=",
  "<>",
  ">=",
  "^=",
  "|=",
]);

const singleOperators = new Set([
  "!",
  "%",
  "&",
  "*",
  "+",
  "-",
  "/",
  "<",
  "=",
  ">",
  "^",
  "|",
  "~",
]);

const punctuation = new Set(["(", ")", ",", ".", ";", ":", "$"]);
const identifierStart = /^[_\p{L}\p{Nl}]$/u;
const identifierPart = /^[_$#@\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}\p{Cf}]$/u;

const codePointAt = (
  source: string,
  offset: number,
): { readonly text: string; readonly width: number } => {
  const value = source.codePointAt(offset);
  if (value === undefined) return { text: "", width: 0 };
  const text = String.fromCodePoint(value);
  return { text, width: text.length };
};

const isIdentifierStart = (text: string): boolean => identifierStart.test(text);
const isIdentifierPart = (text: string): boolean => identifierPart.test(text);
const isDigit = (text: string | undefined): boolean =>
  /^[0-9]$/.test(text ?? "");
const isHexDigit = (text: string | undefined): boolean =>
  /^[0-9A-Fa-f]$/.test(text ?? "");

/**
 * Scans formatting source without normalizing or discarding any text. Offsets are
 * JavaScript/VS Code UTF-16 offsets and every successful token sequence reconstructs
 * the input byte-for-code-unit.
 */
export function scanFormattingSql(source: string): FormattingScanResult {
  const tokens: FormattingToken[] = [];
  let offset = 0;

  const add = (
    kind: FormattingTokenKind,
    start: number,
    end: number,
    trivia = false,
    protectedText = false,
  ): void => {
    tokens.push({
      kind,
      text: source.slice(start, end),
      start,
      end,
      trivia,
      protected: protectedText,
    });
  };

  const fail = (start: number, reason: string): FormattingScanResult => ({
    ok: false,
    tokens,
    error: { offset: start, reason },
  });

  while (offset < source.length) {
    const start = offset;
    const current = codePointAt(source, offset);
    const char = current.text;

    if (/^\s$/u.test(char)) {
      offset += current.width;
      while (offset < source.length) {
        const next = codePointAt(source, offset);
        if (!/^\s$/u.test(next.text)) break;
        offset += next.width;
      }
      add("whitespace", start, offset, true);
      continue;
    }

    if (char === "-" && source[offset + 1] === "-") {
      offset += 2;
      while (
        offset < source.length &&
        source[offset] !== "\r" &&
        source[offset] !== "\n"
      )
        offset++;
      add("lineComment", start, offset, true, true);
      continue;
    }

    if (char === "/" && source[offset + 1] === "*") {
      offset += 2;
      let depth = 1;
      while (offset < source.length && depth > 0) {
        if (source[offset] === "/" && source[offset + 1] === "*") {
          depth++;
          offset += 2;
        } else if (source[offset] === "*" && source[offset + 1] === "/") {
          depth--;
          offset += 2;
        } else {
          offset += codePointAt(source, offset).width;
        }
      }
      if (depth > 0) return fail(start, "unterminated block comment");
      add("blockComment", start, offset, true, true);
      continue;
    }

    const unicodeString =
      (char === "N" || char === "n") && source[offset + 1] === "'";
    if (char === "'" || unicodeString) {
      if (unicodeString) offset++;
      offset++;
      let closed = false;
      while (offset < source.length) {
        if (source[offset] !== "'") {
          offset += codePointAt(source, offset).width;
          continue;
        }
        if (source[offset + 1] === "'") {
          offset += 2;
          continue;
        }
        offset++;
        closed = true;
        break;
      }
      if (!closed) return fail(start, "unterminated string literal");
      add("string", start, offset, false, true);
      continue;
    }

    if (char === "[") {
      offset++;
      let closed = false;
      while (offset < source.length) {
        if (source[offset] === "]" && source[offset + 1] === "]") {
          offset += 2;
        } else if (source[offset] === "]") {
          offset++;
          closed = true;
          break;
        } else {
          offset += codePointAt(source, offset).width;
        }
      }
      if (!closed) return fail(start, "unterminated bracketed identifier");
      add("quotedIdentifier", start, offset, false, true);
      continue;
    }

    if (char === '"') {
      offset++;
      let closed = false;
      while (offset < source.length) {
        if (source[offset] === '"' && source[offset + 1] === '"') {
          offset += 2;
        } else if (source[offset] === '"') {
          offset++;
          closed = true;
          break;
        } else {
          offset += codePointAt(source, offset).width;
        }
      }
      if (!closed) return fail(start, "unterminated double-quoted identifier");
      add("quotedIdentifier", start, offset, false, true);
      continue;
    }

    if (char === "@") {
      offset++;
      if (source[offset] === "@") offset++;
      while (offset < source.length) {
        const next = codePointAt(source, offset);
        if (!isIdentifierPart(next.text)) break;
        offset += next.width;
      }
      if (offset === start + 1) return fail(start, "empty variable name");
      add("variable", start, offset);
      continue;
    }

    if (char === "#") {
      offset++;
      if (source[offset] === "#") offset++;
      const nameStart = offset;
      while (offset < source.length) {
        const next = codePointAt(source, offset);
        if (!isIdentifierPart(next.text)) break;
        offset += next.width;
      }
      if (offset === nameStart)
        return fail(start, "empty temporary identifier");
      add("tempIdentifier", start, offset);
      continue;
    }

    if (char === "?") {
      offset++;
      add("positionalParameter", start, offset);
      continue;
    }

    if (isIdentifierStart(char)) {
      offset += current.width;
      while (offset < source.length) {
        const next = codePointAt(source, offset);
        if (!isIdentifierPart(next.text)) break;
        offset += next.width;
      }
      add("word", start, offset);
      continue;
    }

    if (isDigit(char) || (char === "." && isDigit(source[offset + 1]))) {
      if (
        char === "0" &&
        (source[offset + 1] === "x" || source[offset + 1] === "X")
      ) {
        offset += 2;
        const digitsStart = offset;
        while (isHexDigit(source[offset])) offset++;
        if (offset === digitsStart)
          return fail(start, "malformed hexadecimal literal");
      } else {
        if (char === ".") offset++;
        while (isDigit(source[offset])) offset++;
        if (source[offset] === ".") {
          offset++;
          while (isDigit(source[offset])) offset++;
        }
        if (source[offset] === "e" || source[offset] === "E") {
          const exponentStart = offset;
          offset++;
          if (source[offset] === "+" || source[offset] === "-") offset++;
          const digitsStart = offset;
          while (isDigit(source[offset])) offset++;
          if (offset === digitsStart)
            return fail(exponentStart, "malformed numeric exponent");
        }
      }
      add("number", start, offset);
      continue;
    }

    const pair = source.slice(offset, offset + 2);
    if (compoundOperators.has(pair)) {
      offset += 2;
      add("operator", start, offset);
      continue;
    }

    if (singleOperators.has(char)) {
      offset++;
      add("operator", start, offset);
      continue;
    }

    if (punctuation.has(char)) {
      offset++;
      add("punctuation", start, offset);
      continue;
    }

    return fail(start, `unsupported lexical character ${JSON.stringify(char)}`);
  }

  return { ok: true, tokens };
}

export const isFormattingTrivia = (token: FormattingToken): boolean =>
  token.trivia;
