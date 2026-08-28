export type TokenKind =
  | "identifier"
  | "variable"
  | "temp"
  | "string"
  | "number"
  | "symbol"
  | "batchSeparator";
export interface SqlToken {
  readonly kind: TokenKind;
  readonly text: string;
  readonly normalized: string;
  readonly start: number;
  readonly end: number;
  readonly delimited?: boolean;
}

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  const add = (
    kind: TokenKind,
    start: number,
    end: number,
    text = sql.slice(start, end),
    delimited = false,
  ): void => {
    tokens.push({
      kind,
      text,
      normalized: text.toLowerCase(),
      start,
      end,
      ...(delimited ? { delimited: true } : {}),
    });
  };
  const isStandaloneGo = (start: number, end: number): boolean => {
    const lineStart = sql.lastIndexOf("\n", start - 1) + 1;
    const nextLine = sql.indexOf("\n", end);
    const lineEnd = nextLine < 0 ? sql.length : nextLine;
    const line = sql.slice(lineStart, lineEnd);
    const comment = line.indexOf("--");
    const code = (comment < 0 ? line : line.slice(0, comment)).trim();
    return code.toLocaleLowerCase("en-US") === "go";
  };
  while (index < sql.length) {
    const char = sql[index];
    if (char === undefined) break;
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === "-" && sql[index + 1] === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index++;
      continue;
    }
    if (char === "/" && sql[index + 1] === "*") {
      const end = sql.indexOf("*/", index + 2);
      index = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (char === "'") {
      const start = index++;
      while (index < sql.length) {
        if (sql[index++] === "'" && sql[index] !== "'") break;
        if (sql[index - 1] === "'" && sql[index] === "'") index++;
      }
      add("string", start, index);
      continue;
    }
    if (char === "[") {
      const start = index++;
      let text = "";
      while (index < sql.length) {
        if (sql[index] === "]" && sql[index + 1] === "]") {
          text += "]";
          index += 2;
          continue;
        }
        if (sql[index] === "]") {
          index++;
          break;
        }
        text += sql[index] ?? "";
        index++;
      }
      add("identifier", start, index, text, true);
      continue;
    }
    if (char === '"') {
      const start = index++;
      let text = "";
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          text += '"';
          index += 2;
          continue;
        }
        if (sql[index] === '"') {
          index++;
          break;
        }
        text += sql[index] ?? "";
        index++;
      }
      add("identifier", start, index, text, true);
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index++;
      while (index < sql.length && /[A-Za-z0-9_@$#]/.test(sql[index] ?? ""))
        index++;
      add(
        isStandaloneGo(start, index) ? "batchSeparator" : "identifier",
        start,
        index,
      );
      continue;
    }
    if (char === "@") {
      const start = index++;
      while (index < sql.length && /[A-Za-z0-9_@$#]/.test(sql[index] ?? ""))
        index++;
      add("variable", start, index);
      continue;
    }
    if (char === "#") {
      const start = index++;
      if (sql[index] === "#") index++;
      while (index < sql.length && /[A-Za-z0-9_@$#]/.test(sql[index] ?? ""))
        index++;
      add("temp", start, index);
      continue;
    }
    if (/\d/.test(char)) {
      const start = index++;
      while (index < sql.length && /[\d.]/.test(sql[index] ?? "")) index++;
      add("number", start, index);
      continue;
    }
    add("symbol", index, ++index);
  }
  return tokens;
}

export const unquoteIdentifier = (text: string): string =>
  text.startsWith("[") && text.endsWith("]")
    ? text.slice(1, -1).replaceAll("]]", "]")
    : text.startsWith('"') && text.endsWith('"')
      ? text.slice(1, -1).replaceAll('""', '"')
      : text;
