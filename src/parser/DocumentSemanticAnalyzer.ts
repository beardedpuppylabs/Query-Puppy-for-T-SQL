import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import { quoteIdentifier } from "../metadata/SqlTypeFormatter.js";
import {
  normalizeName,
  type ColumnMetadata,
  type SqlType,
} from "../metadata/MetadataModels.js";
import type { SqlToken } from "./SqlTokenizer.js";
import { tokenizeSql } from "./SqlTokenizer.js";

export interface RowSource {
  readonly sourceId: string;
  readonly name: string;
  readonly alias?: string;
  readonly sourceKind:
    | "cte"
    | "tempTable"
    | "tableVariable"
    | "derivedTable"
    | "values"
    | "inserted"
    | "deleted";
  readonly columns: readonly ColumnMetadata[];
  readonly origin: { readonly start: number; readonly end: number };
}
export interface DocumentSemanticModel {
  readonly rowSources: readonly RowSource[];
  readonly aliases: ReadonlyMap<string, RowSource>;
  readonly orderByColumns: readonly ColumnMetadata[];
}
export interface SemanticCatalog {
  readonly activeDatabase: string;
  readonly indexes: ReadonlyMap<string, DatabaseIndex>;
}
export function documentDatabaseReferences(
  sql: string,
  cursor: number,
): readonly string[] {
  const tokens = tokenizeSql(sql).filter((token) => token.start < cursor);
  const references = new Map<string, string>();
  for (let i = 0; i < tokens.length; i++) {
    const keyword = tokens[i]?.normalized ?? "";
    const offset =
      keyword === "insert" && tokens[i + 1]?.normalized === "into" ? 2 : 1;
    if (
      ![
        "from",
        "join",
        "apply",
        "update",
        "delete",
        "exec",
        "execute",
        "insert",
      ].includes(keyword)
    )
      continue;
    const database = tokens[i + offset];
    const schema = tokens[i + offset + 2];
    const object = tokens[i + offset + 4];
    if (
      ident(database) &&
      tokens[i + offset + 1]?.text === "." &&
      ident(schema) &&
      tokens[i + offset + 3]?.text === "." &&
      ident(object)
    )
      references.set(normalizeName(database.text), database.text);
  }
  return [...references.values()];
}
const unknownType: SqlType = { name: "unknown" };
const reserved = new Set([
  "where",
  "join",
  "on",
  "group",
  "order",
  "having",
  "cross",
  "outer",
  "left",
  "right",
  "inner",
  "full",
  "union",
  "into",
  "from",
  "apply",
]);
const ident = (t: SqlToken | undefined): t is SqlToken =>
  t?.kind === "identifier" || t?.kind === "temp" || t?.kind === "variable";
const col = (
  name: string,
  ordinal: number,
  base?: ColumnMetadata,
): ColumnMetadata => ({
  name,
  normalizedName: normalizeName(name),
  type: base?.type ?? unknownType,
  nullable: base?.nullable ?? true,
  ordinal,
});
let nextSourceId = 0;
const rowSource = (
  source: Omit<RowSource, "sourceId" | "columns"> & {
    readonly columns: readonly ColumnMetadata[];
  },
): RowSource =>
  Object.freeze({
    ...source,
    sourceId: `local-${String(++nextSourceId)}`,
    columns: Object.freeze([...source.columns]),
  });
const matching = (tokens: readonly SqlToken[], open: number): number => {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i]?.text === "(") depth++;
    if (tokens[i]?.text === ")" && --depth === 0) return i;
  }
  return tokens.length - 1;
};
const segments = (
  tokens: readonly SqlToken[],
  start: number,
  end: number,
): SqlToken[][] => {
  const result: SqlToken[][] = [];
  let depth = 0,
    begin = start;
  for (let i = start; i < end; i++) {
    if (tokens[i]?.text === "(") depth++;
    if (tokens[i]?.text === ")") depth--;
    if (tokens[i]?.text === "," && depth === 0) {
      result.push(tokens.slice(begin, i));
      begin = i + 1;
    }
  }
  if (begin < end) result.push(tokens.slice(begin, end));
  return result;
};
const statementStart = (
  tokens: readonly SqlToken[],
  cursor: number,
): number => {
  let start = 0;
  for (let i = 0; i < tokens.length && (tokens[i]?.start ?? 0) < cursor; i++)
    if (tokens[i]?.text === ";" || tokens[i]?.normalized === "go")
      start = i + 1;
  return start;
};
const batchStart = (tokens: readonly SqlToken[], cursor: number): number => {
  let start = 0;
  for (let i = 0; i < tokens.length && (tokens[i]?.start ?? 0) < cursor; i++)
    if (tokens[i]?.normalized === "go") start = i + 1;
  return start;
};
function catalogColumns(
  parts: readonly string[],
  catalog?: SemanticCatalog,
): readonly ColumnMetadata[] {
  if (!catalog || parts.length === 0) return [];
  const db =
    parts.length === 3
      ? (parts[0] ?? catalog.activeDatabase)
      : catalog.activeDatabase;
  const schema = parts.length >= 2 ? (parts.at(-2) ?? "dbo") : undefined;
  const name = parts.at(-1) ?? "";
  const index = catalog.indexes.get(normalizeName(db));
  if (!index) return [];
  if (schema) return index.findObject(schema, name)?.columns ?? [];
  const found = index.objects.filter(
    (o) => normalizeName(o.name) === normalizeName(name),
  );
  return found.length === 1 ? (found[0]?.columns ?? []) : [];
}
function definitionColumns(
  tokens: readonly SqlToken[],
  open: number,
  close: number,
): ColumnMetadata[] {
  return segments(tokens, open + 1, close).flatMap((part, ordinal) =>
    columnFromDefinition(part, ordinal + 1),
  );
}
function columnFromDefinition(
  part: readonly SqlToken[],
  ordinal: number,
): ColumnMetadata[] {
  const name = part[0];
  const type = part[1];
  if (!ident(name) || !ident(type)) return [];
  let sqlType: SqlType = { name: type.text };
  if (part[2]?.text === "(") {
    const nums = part.slice(
      3,
      part.findIndex((t, i) => i > 2 && t.text === ")"),
    );
    const values = nums
      .filter((t) => t.kind === "number")
      .map((t) => Number(t.text));
    if (
      ["decimal", "numeric"].includes(type.normalized) &&
      values[0] !== undefined &&
      values[1] !== undefined
    )
      sqlType = {
        ...sqlType,
        precision: values[0],
        scale: values[1],
      };
    else if (values[0] !== undefined)
      sqlType = {
        ...sqlType,
        maxLength: ["nchar", "nvarchar"].includes(type.normalized)
          ? values[0] * 2
          : values[0],
      };
  }
  const not = part.some(
    (t, i) => t.normalized === "not" && part[i + 1]?.normalized === "null",
  );
  return [
    {
      name: name.text,
      normalizedName: normalizeName(name.text),
      type: sqlType,
      nullable: !not,
      ordinal,
    },
  ];
}
interface SelectSources {
  readonly ordered: readonly (readonly ColumnMetadata[])[];
  readonly bindings: ReadonlyMap<string, readonly ColumnMetadata[]>;
}

export interface SelectWildcardExpansion {
  readonly start: number;
  readonly end: number;
  readonly qualification: "unqualified" | "qualified";
  readonly sources: readonly {
    readonly qualifier: string;
    readonly columns: readonly ColumnMetadata[];
  }[];
}

export function wildcardColumnExpressions(
  expansion: SelectWildcardExpansion,
): readonly string[] {
  return expansion.sources.flatMap((source) =>
    source.columns.map((column) => {
      const columnName = quoteIdentifier(column.name);
      return expansion.qualification === "qualified"
        ? `${quoteIdentifier(source.qualifier)}.${columnName}`
        : columnName;
    }),
  );
}
function selectSources(
  tokens: readonly SqlToken[],
  start: number,
  end: number,
  known: readonly RowSource[],
  catalog?: SemanticCatalog,
  targetDepth = 0,
): SelectSources {
  const bindings = new Map<string, readonly ColumnMetadata[]>();
  const ordered: (readonly ColumnMetadata[])[] = [];
  let depth = 0;
  for (let i = start; i < end; i++) {
    if (tokens[i]?.text === "(") depth++;
    if (tokens[i]?.text === ")") depth--;
    if (!["from", "join", "apply"].includes(tokens[i]?.normalized ?? ""))
      continue;
    if (depth !== targetDepth) continue;
    let p = i + 1;
    if (tokens[p]?.text === "(") {
      const derived = known.find(
        (source) => source.origin.start === tokens[i]?.start,
      );
      if (!derived) continue;
      ordered.push(derived.columns);
      bindings.set(
        normalizeName(derived.alias ?? derived.name),
        derived.columns,
      );
      continue;
    }
    if (!ident(tokens[p])) continue;
    const parts = [tokens[p]?.text ?? ""];
    while (tokens[p + 1]?.text === "." && ident(tokens[p + 2])) {
      parts.push(tokens[p + 2]?.text ?? "");
      p += 2;
    }
    if (tokens[p + 1]?.text === "(") p = matching(tokens, p + 1);
    if (tokens[p + 1]?.normalized === "as") p++;
    const alias =
      ident(tokens[p + 1]) && !reserved.has(tokens[p + 1]?.normalized ?? "")
        ? tokens[++p]?.text
        : parts.at(-1);
    const local = known.find(
      (s) => normalizeName(s.name) === normalizeName(parts.at(-1) ?? ""),
    );
    const columns = local?.columns ?? catalogColumns(parts, catalog);
    ordered.push(columns);
    if (alias) bindings.set(normalizeName(alias), columns);
    bindings.set(normalizeName(parts.at(-1) ?? ""), columns);
  }
  return { ordered, bindings };
}
function projection(
  tokens: readonly SqlToken[],
  start: number,
  end: number,
  known: readonly RowSource[],
  catalog?: SemanticCatalog,
  inherited?: ReadonlyMap<string, readonly ColumnMetadata[]>,
): ColumnMetadata[] {
  let select = -1,
    from = end,
    depth = 0;
  for (let i = start; i < end; i++) {
    if (tokens[i]?.text === "(") depth++;
    if (tokens[i]?.text === ")") depth--;
    if (depth === 0 && tokens[i]?.normalized === "select" && select < 0)
      select = i;
    if (depth === 0 && tokens[i]?.normalized === "from") {
      from = i;
      break;
    }
  }
  if (select < 0) return [];
  let projectionEnd = from;
  for (let i = select + 1; i < from; i++)
    if (tokens[i]?.normalized === "into") {
      projectionEnd = i;
      break;
    }
  const sources = selectSources(tokens, from, end, known, catalog);
  const bindings = new Map(sources.bindings);
  for (const [name, columns] of inherited ?? [])
    if (!bindings.has(name)) bindings.set(name, columns);
  return segments(tokens, select + 1, projectionEnd).flatMap((part, index) => {
    if (!part.length) return [];
    let alias: SqlToken | undefined;
    const as = part.findIndex((t) => t.normalized === "as");
    if (as >= 0 && ident(part[as + 1])) alias = part[as + 1];
    else if (part.length > 1 && ident(part.at(-1)) && part.at(-2)?.text !== ".")
      alias = part.at(-1);
    if (part.at(-1)?.text === "*") {
      const qualifier =
        part.length >= 3 && part.at(-2)?.text === "."
          ? part.at(-3)?.text
          : undefined;
      const expanded = qualifier
        ? (bindings.get(normalizeName(qualifier)) ?? [])
        : sources.ordered.flat();
      return expanded.map((c, i) => ({ ...c, ordinal: index + i + 1 }));
    }
    let base: ColumnMetadata | undefined;
    const directName =
      ident(part[0]) &&
      (part.length === 1 ||
        part[1]?.normalized === "as" ||
        (part.length === 2 && ident(part[1])))
        ? part[0].text
        : part.length >= 3 && part[1]?.text === "." && ident(part[2])
          ? part[2].text
          : undefined;
    const qualifier =
      part.length >= 3 && part[1]?.text === "." ? part[0]?.text : undefined;
    if (directName) {
      const pools = qualifier
        ? [bindings.get(normalizeName(qualifier)) ?? []]
        : sources.ordered;
      const matches = pools
        .flat()
        .filter((c) => normalizeName(c.name) === normalizeName(directName));
      if (matches.length) base = matches[0];
    }
    const name = alias?.text ?? directName;
    return name ? [col(name, index + 1, base)] : [];
  });
}
function derivedSources(
  tokens: readonly SqlToken[],
  start: number,
  end: number,
  known: readonly RowSource[],
  catalog?: SemanticCatalog,
): RowSource[] {
  const out: RowSource[] = [];
  for (let i = start; i < end; i++) {
    if (
      !["from", "join", "apply"].includes(tokens[i]?.normalized ?? "") ||
      tokens[i + 1]?.text !== "("
    )
      continue;
    const close = matching(tokens, i + 1);
    let p = close + 1;
    if (tokens[p]?.normalized === "as") p++;
    const alias = tokens[p];
    if (!ident(alias)) continue;
    let columns: ColumnMetadata[];
    let kind: RowSource["sourceKind"] = "derivedTable";
    if (tokens[i + 2]?.normalized === "values") {
      kind = "values";
      const open = tokens[p + 1]?.text === "(" ? p + 1 : -1;
      columns =
        open >= 0
          ? segments(tokens, open + 1, matching(tokens, open)).flatMap(
              (x, n) => (ident(x[0]) ? [col(x[0].text, n + 1)] : []),
            )
          : [];
    } else {
      const nested = derivedSources(
        tokens,
        i + 2,
        close,
        [...known, ...out],
        catalog,
      );
      const inherited = selectSources(
        tokens,
        start,
        i,
        [...known, ...out],
        catalog,
      ).bindings;
      columns = projection(
        tokens,
        i + 2,
        close,
        [...known, ...out, ...nested],
        catalog,
        inherited,
      );
    }
    out.push(
      rowSource({
        name: alias.text,
        alias: alias.text,
        sourceKind: kind,
        columns,
        origin: { start: tokens[i]?.start ?? 0, end: alias.end },
      }),
    );
    i = close;
  }
  return out;
}
export function analyzeDocumentSemantics(
  sql: string,
  cursor: number,
  catalog?: SemanticCatalog,
): DocumentSemanticModel {
  const tokens = tokenizeSql(sql);
  const before = tokens.filter((t) => t.start < cursor);
  const batch = statementStart(before, cursor);
  const currentBatch = batchStart(before, cursor);
  const rowSources: RowSource[] = [];
  let statementEnd = tokens.findIndex(
    (token, index) =>
      index >= batch && token.start >= cursor && token.text === ";",
  );
  if (statementEnd < 0) statementEnd = tokens.length;
  for (let i = 0; i < before.length; i++) {
    const create =
      before[i]?.normalized === "create" &&
      before[i + 1]?.normalized === "table" &&
      before[i + 2]?.kind === "temp";
    const declare =
      i >= currentBatch &&
      before[i]?.normalized === "declare" &&
      before[i + 1]?.kind === "variable" &&
      before[i + 2]?.normalized === "table";
    if (create || declare) {
      const name = before[i + (create ? 2 : 1)];
      const open = i + 3;
      if (!name || before[open]?.text !== "(") continue;
      const close = matching(before, open);
      rowSources.push(
        rowSource({
          name: name.text,
          sourceKind: create ? "tempTable" : "tableVariable",
          columns: definitionColumns(before, open, close),
          origin: {
            start: before[i]?.start ?? 0,
            end: before[close]?.end ?? name.end,
          },
        }),
      );
    }
    if (before[i]?.normalized === "into" && before[i + 1]?.kind === "temp") {
      let select = i;
      while (
        select >= 0 &&
        before[select]?.normalized !== "select" &&
        before[select]?.text !== ";"
      )
        select--;
      const end = before.findIndex((t, n) => n > i && t.text === ";");
      const name = before[i + 1];
      if (name)
        rowSources.push(
          rowSource({
            name: name.text,
            sourceKind: "tempTable",
            columns: projection(
              before,
              select,
              end < 0 ? before.length : end,
              rowSources,
              catalog,
            ),
            origin: { start: before[select]?.start ?? 0, end: name.end },
          }),
        );
    }
  }
  for (let i = 0; i < before.length; i++) {
    if (
      before[i]?.normalized !== "alter" ||
      before[i + 1]?.normalized !== "table" ||
      before[i + 2]?.kind !== "temp" ||
      before[i + 3]?.normalized !== "add"
    )
      continue;
    const target = rowSources.find(
      (source) =>
        source.sourceKind === "tempTable" &&
        normalizeName(source.name) === normalizeName(before[i + 2]?.text ?? ""),
    );
    if (!target) continue;
    let end = i + 4;
    while (end < before.length && before[end]?.text !== ";") end++;
    const additions = segments(before, i + 4, end).flatMap((part, ordinal) =>
      columnFromDefinition(part, target.columns.length + ordinal + 1),
    );
    const position = rowSources.indexOf(target);
    rowSources[position] = rowSource({
      ...target,
      columns: [...target.columns, ...additions],
    });
  }
  // CTEs are visible only in the current statement and are analyzed in declaration order.
  if (before[batch]?.normalized === "with") {
    let i = batch + 1;
    while (ident(before[i])) {
      const name = before[i];
      if (!name) break;
      i++;
      let explicit: string[] = [];
      if (before[i]?.text === "(") {
        const close = matching(before, i);
        explicit = segments(before, i + 1, close).flatMap((x) =>
          ident(x[0]) ? [x[0].text] : [],
        );
        i = close + 1;
      }
      if (before[i]?.normalized !== "as" || before[i + 1]?.text !== "(") break;
      const open = i + 1,
        close = matching(before, open);
      let columns = projection(before, open + 1, close, rowSources, catalog);
      if (explicit.length)
        columns = explicit.map((n, k) => col(n, k + 1, columns[k]));
      rowSources.push(
        rowSource({
          name: name.text,
          sourceKind: "cte",
          columns,
          origin: { start: name.start, end: before[close]?.end ?? name.end },
        }),
      );
      i = close + 1;
      if (before[i]?.text !== ",") break;
      i++;
    }
  }
  const derived = derivedSources(
    tokens,
    batch,
    statementEnd,
    rowSources,
    catalog,
  );
  rowSources.push(...derived);
  const aliases = new Map<string, RowSource>();
  for (const source of rowSources)
    aliases.set(normalizeName(source.alias ?? source.name), source);
  let cursorDepth = 0;
  for (
    let i = batch;
    i < tokens.length && (tokens[i]?.start ?? 0) < cursor;
    i++
  ) {
    if (tokens[i]?.text === "(") cursorDepth++;
    if (tokens[i]?.text === ")") cursorDepth--;
  }
  const maps = selectSources(
    tokens,
    batch,
    statementEnd,
    rowSources,
    catalog,
    cursorDepth,
  ).bindings;
  for (const [alias, columns] of maps) {
    const local = rowSources.find(
      (s) =>
        s.columns === columns ||
        normalizeName(s.name) === alias ||
        normalizeName(s.alias ?? "") === alias,
    );
    if (local) aliases.set(alias, local);
  }
  const currentProjection = projection(
    tokens,
    batch,
    statementEnd,
    rowSources,
    catalog,
  );
  const inOrderBy = before.some(
    (t, i) =>
      i >= batch &&
      t.normalized === "order" &&
      before[i + 1]?.normalized === "by",
  );
  return {
    rowSources,
    aliases,
    orderByColumns: inOrderBy ? currentProjection : [],
  };
}

/** Resolves only an exact projection wildcard and never performs catalog I/O. */
export function resolveSelectWildcard(
  sql: string,
  cursor: number,
  catalog?: SemanticCatalog,
): SelectWildcardExpansion | undefined {
  const tokens = tokenizeSql(sql);
  const starIndex = tokens.findIndex(
    (token) => token.text === "*" && token.end === cursor,
  );
  if (starIndex < 0) return undefined;
  let depth = 0;
  const depths = tokens.map((token) => {
    const current = depth;
    if (token.text === "(") depth++;
    if (token.text === ")") depth--;
    return current;
  });
  const starDepth = depths[starIndex];
  let select = -1;
  for (let i = starIndex - 1; i >= 0; i--) {
    if (depths[i] !== starDepth) continue;
    if (tokens[i]?.text === ";" || tokens[i]?.normalized === "go") break;
    if (tokens[i]?.normalized === "from") return undefined;
    if (tokens[i]?.normalized === "select") {
      select = i;
      break;
    }
  }
  if (select < 0) return undefined;
  const previous = tokens[starIndex - 1];
  const qualifierToken =
    previous?.text === "." && ident(tokens[starIndex - 2])
      ? tokens[starIndex - 2]
      : undefined;
  const itemStart = qualifierToken ? starIndex - 2 : starIndex;
  const before = tokens[itemStart - 1];
  const after = tokens[starIndex + 1];
  if (
    (before &&
      depths[itemStart - 1] === starDepth &&
      before.text !== "," &&
      before.normalized !== "select") ||
    (after &&
      depths[starIndex + 1] === starDepth &&
      after.text !== "," &&
      after.normalized !== "into" &&
      after.normalized !== "from")
  )
    return undefined;
  let end = tokens.length;
  for (let i = starIndex + 1; i < tokens.length; i++) {
    if (depths[i] !== starDepth) continue;
    if (tokens[i]?.text === ";" || tokens[i]?.normalized === "go") {
      end = i;
      break;
    }
  }
  const from = tokens.findIndex(
    (token, index) =>
      index > starIndex &&
      index < end &&
      depths[index] === starDepth &&
      token.normalized === "from",
  );
  if (from < 0) return undefined;
  const semantics = analyzeDocumentSemantics(sql, cursor, catalog);
  const bindings = selectSources(
    tokens,
    from,
    end,
    semantics.rowSources,
    catalog,
  ).bindings;
  if (qualifierToken) {
    const columns = bindings.get(normalizeName(qualifierToken.text)) ?? [];
    if (!columns.length) return undefined;
    return {
      start: qualifierToken.start,
      end: tokens[starIndex]?.end ?? cursor,
      qualification: "qualified",
      sources: [{ qualifier: qualifierToken.text, columns }],
    };
  }
  const sources: {
    qualifier: string;
    columns: readonly ColumnMetadata[];
    explicitAlias: boolean;
  }[] = [];
  let localDepth = 0;
  for (let i = from; i < end; i++) {
    if (tokens[i]?.text === "(") localDepth++;
    if (tokens[i]?.text === ")") localDepth--;
    if (
      localDepth !== 0 ||
      !["from", "join", "apply"].includes(tokens[i]?.normalized ?? "")
    )
      continue;
    let p = i + 1;
    let objectName = "";
    if (tokens[p]?.text === "(") {
      const close = matching(tokens, p);
      p = close;
    } else {
      if (!ident(tokens[p])) continue;
      objectName = tokens[p]?.text ?? "";
      while (tokens[p + 1]?.text === "." && ident(tokens[p + 2])) p += 2;
      objectName = tokens[p]?.text ?? objectName;
      if (tokens[p + 1]?.text === "(") p = matching(tokens, p + 1);
    }
    if (tokens[p + 1]?.normalized === "as") p++;
    const aliasToken =
      ident(tokens[p + 1]) && !reserved.has(tokens[p + 1]?.normalized ?? "")
        ? tokens[p + 1]
        : undefined;
    const alias = aliasToken?.text ?? objectName;
    const columns = bindings.get(normalizeName(alias)) ?? [];
    if (!columns.length) return undefined;
    sources.push({
      qualifier: alias,
      columns,
      explicitAlias: Boolean(aliasToken),
    });
  }
  if (!sources.length) return undefined;
  return {
    start: tokens[starIndex]?.start ?? cursor - 1,
    end: cursor,
    qualification:
      sources.length > 1 || sources[0]?.explicitAlias
        ? "qualified"
        : "unqualified",
    sources: sources.map(({ qualifier, columns }) => ({ qualifier, columns })),
  };
}
