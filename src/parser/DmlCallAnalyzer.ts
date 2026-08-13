import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import {
  isWritableColumn,
  normalizeName,
  type ColumnMetadata,
  type DatabaseObject,
  type ParameterMetadata,
} from "../metadata/MetadataModels.js";
import type { RowSource } from "./DocumentSemanticAnalyzer.js";
import { tokenizeSql, type SqlToken } from "./SqlTokenizer.js";
import { formatSqlType } from "../metadata/SqlTypeFormatter.js";

export interface DmlCatalog {
  readonly activeDatabase: string;
  readonly indexes: ReadonlyMap<string, DatabaseIndex>;
}
export type DmlCompletion =
  | { readonly kind: "columns"; readonly columns: readonly ColumnMetadata[] }
  | {
      readonly kind: "parameters";
      readonly parameters: readonly ParameterMetadata[];
    }
  | { readonly kind: "pseudo"; readonly source: RowSource }
  | { readonly kind: "none" };

const statementTokens = (sql: string, cursor: number): readonly SqlToken[] => {
  const tokens = tokenizeSql(sql);
  let start = 0;
  let end = tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const boundary = token.text === ";" || token.normalized === "go";
    if (boundary && token.end <= cursor) start = i + 1;
    if (boundary && token.start >= cursor) {
      end = i;
      break;
    }
  }
  return tokens.slice(start, end);
};

const reference = (
  tokens: readonly SqlToken[],
  start: number,
): { parts: string[]; end: number } => {
  const parts: string[] = [];
  let i = start;
  if (!["identifier", "temp", "variable"].includes(tokens[i]?.kind ?? ""))
    return { parts, end: i };
  parts.push(tokens[i]?.text ?? "");
  while (tokens[i + 1]?.text === "." && tokens[i + 2]?.kind === "identifier") {
    parts.push(tokens[i + 2]?.text ?? "");
    i += 2;
  }
  return { parts, end: i };
};
export function resolveCatalogObject(
  parts: readonly string[],
  catalog: DmlCatalog,
  kinds?: readonly DatabaseObject["kind"][],
): DatabaseObject | undefined {
  const database =
    parts.length === 3
      ? (parts[0] ?? catalog.activeDatabase)
      : catalog.activeDatabase;
  const schema = parts.length >= 2 ? parts.at(-2) : undefined;
  const name = parts.at(-1) ?? "";
  const index = catalog.indexes.get(normalizeName(database));
  if (!index) return undefined;
  const objects = schema
    ? ([index.findObject(schema, name)].filter(Boolean) as DatabaseObject[])
    : index.objects.filter(
        (o) => normalizeName(o.name) === normalizeName(name),
      );
  const filtered = kinds
    ? objects.filter((o) => kinds.includes(o.kind))
    : objects;
  return filtered.length === 1 ? filtered[0] : undefined;
}
const usedNames = (
  tokens: readonly SqlToken[],
  start: number,
  end: number,
  assignmentOnly = false,
): Set<string> => {
  const used = new Set<string>();
  let depth = 0;
  for (let i = start; i < end; i++) {
    if (tokens[i]?.text === "(") depth++;
    if (tokens[i]?.text === ")") depth--;
    const token = tokens[i];
    if (
      depth === 0 &&
      token &&
      ["identifier", "variable"].includes(token.kind)
    ) {
      if (!assignmentOnly || tokens[i + 1]?.text === "=")
        used.add(normalizeName(token.text));
    }
  }
  return used;
};
function dmlTarget(
  tokens: readonly SqlToken[],
  catalog: DmlCatalog,
  aliases: ReadonlyMap<string, RowSource>,
):
  | { verb: "insert" | "update" | "delete"; object?: DatabaseObject }
  | undefined {
  const verbToken = tokens.find((t) =>
    ["insert", "update", "delete"].includes(t.normalized),
  );
  if (!verbToken) return undefined;
  const verb = verbToken.normalized as "insert" | "update" | "delete";
  const v = tokens.indexOf(verbToken);
  let start = v + 1;
  if (verb === "insert" && tokens[start]?.normalized === "into") start++;
  if (verb === "delete" && tokens[start]?.normalized === "from") start++;
  const ref = reference(tokens, start);
  if (verb === "update" || (verb === "delete" && ref.parts.length === 1)) {
    const alias = aliases.get(normalizeName(ref.parts[0] ?? ""));
    if (alias || ref.parts.length === 1) {
      const from = tokens.findIndex((t) => t.normalized === "from");
      if (from >= 0) {
        for (let i = from + 1; i < tokens.length; i++) {
          const candidate = reference(tokens, i);
          const next =
            tokens[candidate.end + 1]?.normalized === "as"
              ? candidate.end + 2
              : candidate.end + 1;
          if (
            normalizeName(
              tokens[next]?.text ?? candidate.parts.at(-1) ?? "",
            ) === normalizeName(ref.parts[0] ?? "")
          ) {
            const object = resolveCatalogObject(candidate.parts, catalog, [
              "table",
              "view",
            ]);
            return { verb, ...(object ? { object } : {}) };
          }
        }
      }
    }
  }
  const object = resolveCatalogObject(ref.parts, catalog, ["table", "view"]);
  return { verb, ...(object ? { object } : {}) };
}
export function analyzeDmlCompletion(
  sql: string,
  cursor: number,
  catalog: DmlCatalog,
  aliases: ReadonlyMap<string, RowSource>,
): DmlCompletion | undefined {
  const all = statementTokens(sql, cursor);
  const tokens = all.filter((t) => t.start < cursor);
  const target = dmlTarget(all, catalog, aliases);
  const lastDot =
    tokens.at(-1)?.text === "."
      ? tokens.at(-2)?.normalized
      : tokens.at(-2)?.text === "."
        ? tokens.at(-3)?.normalized
        : undefined;
  if (target?.object && (lastDot === "inserted" || lastDot === "deleted")) {
    const valid =
      target.verb === "update" ||
      (target.verb === "insert"
        ? lastDot === "inserted"
        : lastDot === "deleted");
    if (valid)
      return {
        kind: "pseudo",
        source: {
          sourceId: `dml-${lastDot}`,
          name: lastDot,
          sourceKind: lastDot,
          columns: target.object.columns,
          origin: { start: 0, end: cursor },
        },
      };
    return { kind: "none" };
  }
  const exec = tokens.findIndex(
    (t) => t.normalized === "exec" || t.normalized === "execute",
  );
  if (exec >= 0) {
    const ref = reference(tokens, exec + 1);
    const proc = resolveCatalogObject(ref.parts, catalog, ["procedure"]);
    if (proc && tokens.at(-1)?.kind === "variable") {
      const used = usedNames(tokens, ref.end + 1, tokens.length - 1, true);
      return {
        kind: "parameters",
        parameters: proc.parameters.filter(
          (p) => !used.has(normalizeName(p.name)),
        ),
      };
    }
  }
  if (!target?.object) return undefined;
  const writable = target.object.columns.filter(isWritableColumn);
  if (target.verb === "insert") {
    const into = tokens.findIndex((t) => t.normalized === "into");
    const ref = reference(tokens, into + 1);
    const open = ref.end + 1;
    let depth = 0;
    for (let i = open; i < tokens.length; i++) {
      if (tokens[i]?.text === "(") depth++;
      if (tokens[i]?.text === ")") depth--;
    }
    if (
      tokens[open]?.text === "(" &&
      depth > 0 &&
      !tokens.slice(open + 1).some((t) => t.normalized === "select")
    ) {
      const used = usedNames(tokens, open + 1, tokens.length - 1);
      return {
        kind: "columns",
        columns: writable.filter((c) => !used.has(c.normalizedName)),
      };
    }
  }
  if (target.verb === "update") {
    const set = tokens.findIndex((t) => t.normalized === "set");
    if (set < 0) return undefined;
    let comma = set,
      depth = 0;
    for (let i = set + 1; i < tokens.length; i++) {
      if (tokens[i]?.text === "(") depth++;
      if (tokens[i]?.text === ")") depth--;
      if (depth === 0 && tokens[i]?.text === ",") comma = i;
    }
    const current = tokens.slice(comma + 1);
    if (current.some((t) => t.text === "=")) return undefined;
    const used = usedNames(tokens, set + 1, comma + 1, true);
    return {
      kind: "columns",
      columns: writable.filter((c) => !used.has(c.normalizedName)),
    };
  }
  return undefined;
}

export interface SignatureResolution {
  readonly object: DatabaseObject;
  readonly activeParameter: number;
}
export function functionSignatureLabel(object: DatabaseObject): string {
  const parameters = object.parameters
    .map(
      (parameter) =>
        `${parameter.name} ${formatSqlType(parameter.type)}${parameter.output ? " OUTPUT" : ""}`,
    )
    .join(", ");
  const returns =
    object.kind === "tableValuedFunction"
      ? " → table"
      : object.returnType
        ? ` → ${formatSqlType(object.returnType)}`
        : "";
  return `${object.schema}.${object.name}(${parameters})${returns}`;
}
export function resolveFunctionSignature(
  sql: string,
  cursor: number,
  catalog: DmlCatalog,
): SignatureResolution | undefined {
  const tokens = tokenizeSql(sql.slice(0, cursor));
  let depth = 0,
    open = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i]?.text === ")") depth++;
    if (tokens[i]?.text === "(") {
      if (depth === 0) {
        open = i;
        break;
      }
      depth--;
    }
  }
  if (open < 0) return undefined;
  let start = open - 1;
  while (start >= 2 && tokens[start - 1]?.text === ".") start -= 2;
  const ref = reference(tokens, start);
  const object = resolveCatalogObject(ref.parts, catalog, [
    "scalarFunction",
    "tableValuedFunction",
  ]);
  if (!object) return undefined;
  let active = 0;
  depth = 0;
  for (let i = open + 1; i < tokens.length; i++) {
    if (tokens[i]?.text === "(") depth++;
    if (tokens[i]?.text === ")") depth--;
    if (depth === 0 && tokens[i]?.text === ",") active++;
  }
  return {
    object,
    activeParameter: Math.min(
      active,
      Math.max(0, object.parameters.length - 1),
    ),
  };
}

export function functionInvocationDatabase(
  sql: string,
  cursor: number,
): string | undefined {
  const tokens = tokenizeSql(sql.slice(0, cursor));
  let depth = 0;
  for (let open = tokens.length - 1; open >= 0; open--) {
    if (tokens[open]?.text === ")") depth++;
    if (tokens[open]?.text !== "(") continue;
    if (depth > 0) {
      depth--;
      continue;
    }
    const name = open - 1;
    if (
      tokens[name]?.kind === "identifier" &&
      tokens[name - 1]?.text === "." &&
      tokens[name - 2]?.kind === "identifier" &&
      tokens[name - 3]?.text === "." &&
      tokens[name - 4]?.kind === "identifier"
    )
      return tokens[name - 4]?.text;
    return undefined;
  }
  return undefined;
}
