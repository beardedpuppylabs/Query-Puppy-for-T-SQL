import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import { quoteIdentifier } from "../metadata/SqlTypeFormatter.js";
import {
  normalizeName,
  type ColumnMetadata,
  type DatabaseObject,
  type SqlType,
} from "../metadata/MetadataModels.js";
import type { SqlToken } from "./SqlTokenizer.js";
import { tokenizeSql } from "./SqlTokenizer.js";

export interface RowSource {
  readonly sourceId: string;
  readonly name: string;
  readonly alias?: string;
  readonly database?: string;
  readonly schema?: string;
  readonly sourceObject?: DatabaseObject;
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
export type QueryScopeKind =
  | "topLevelQuery"
  | "correlatedExpressionSubquery"
  | "derivedTable"
  | "applyRightQuery"
  | "cteDefinition";
export interface ScopedRowSource {
  readonly source: RowSource;
  readonly qualifier: string;
  readonly scopeDistance: number;
  readonly outer: boolean;
}
export interface QueryScope {
  readonly id: string;
  readonly kind: QueryScopeKind;
  readonly range: { readonly start: number; readonly end: number };
  readonly parentId?: string;
  readonly localRowSources: readonly ScopedRowSource[];
  readonly allowsOuterReferences: boolean;
}
export type SetOperator = "union" | "unionAll" | "intersect" | "except";
export type SetQueryExpression =
  | {
      readonly kind: "branch";
      readonly range: { readonly start: number; readonly end: number };
      readonly projection: readonly ColumnMetadata[];
    }
  | {
      readonly kind: "set";
      readonly operator: SetOperator;
      readonly left: SetQueryExpression;
      readonly right: SetQueryExpression;
      readonly range: { readonly start: number; readonly end: number };
      readonly projection: readonly ColumnMetadata[];
    };
export interface DocumentSemanticModel {
  readonly rowSources: readonly RowSource[];
  readonly aliases: ReadonlyMap<string, RowSource>;
  readonly queryScopes: readonly QueryScope[];
  readonly activeQueryScope?: QueryScope;
  readonly visibleRowSources: readonly ScopedRowSource[];
  readonly setQueryExpressions: readonly SetQueryExpression[];
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
function catalogObject(
  parts: readonly string[],
  catalog?: SemanticCatalog,
): DatabaseObject | undefined {
  if (!catalog || parts.length === 0) return undefined;
  const database =
    parts.length === 3
      ? (parts[0] ?? catalog.activeDatabase)
      : catalog.activeDatabase;
  const schema = parts.length >= 2 ? parts.at(-2) : undefined;
  const name = parts.at(-1) ?? "";
  const index = catalog.indexes.get(normalizeName(database));
  if (!index) return undefined;
  if (schema) return index.findObject(schema, name);
  const matches = index.objects.filter(
    (object) => normalizeName(object.name) === normalizeName(name),
  );
  return matches.length === 1 ? matches[0] : undefined;
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

/** Returns the first projection token after SELECT modifiers such as TOP. */
function projectionStart(
  tokens: readonly SqlToken[],
  select: number,
  end: number,
): number {
  let current = select + 1;
  if (["all", "distinct"].includes(tokens[current]?.normalized ?? ""))
    current++;
  if (tokens[current]?.normalized !== "top") return current;
  current++;
  if (tokens[current]?.text === "(") current = matching(tokens, current) + 1;
  else if (current < end) current++;
  if (tokens[current]?.normalized === "percent") current++;
  if (
    tokens[current]?.normalized === "with" &&
    tokens[current + 1]?.normalized === "ties"
  )
    current += 2;
  return Math.min(current, end);
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

interface SetOperandRange {
  readonly start: number;
  readonly end: number;
}
interface DirectSetParts {
  readonly operands: readonly SetOperandRange[];
  readonly operators: readonly SetOperator[];
}
function directSetParts(
  tokens: readonly SqlToken[],
  start: number,
  end: number,
): DirectSetParts | undefined {
  const operands: SetOperandRange[] = [];
  const operators: SetOperator[] = [];
  let depth = 0;
  let operandStart = start;
  for (let i = start; i < end; i++) {
    if (tokens[i]?.text === "(") depth++;
    else if (tokens[i]?.text === ")") depth--;
    if (depth !== 0) continue;
    const normalized = tokens[i]?.normalized;
    if (!["union", "intersect", "except"].includes(normalized ?? "")) continue;
    operands.push({ start: operandStart, end: i });
    if (normalized === "union" && tokens[i + 1]?.normalized === "all") {
      operators.push("unionAll");
      i++;
    } else operators.push(normalized as SetOperator);
    operandStart = i + 1;
  }
  if (!operators.length) return undefined;
  operands.push({ start: operandStart, end });
  return { operands, operators };
}
function unwrapOperand(
  tokens: readonly SqlToken[],
  operand: SetOperandRange,
): SetOperandRange {
  let { start, end } = operand;
  while (tokens[start]?.text === "(" && matching(tokens, start) === end - 1) {
    start++;
    end--;
  }
  return { start, end };
}
const sameType = (left: SqlType, right: SqlType): boolean =>
  normalizeName(left.name) === normalizeName(right.name) &&
  normalizeName(left.schema ?? "") === normalizeName(right.schema ?? "") &&
  left.maxLength === right.maxLength &&
  left.precision === right.precision &&
  left.scale === right.scale &&
  Boolean(left.userDefined) === Boolean(right.userDefined);
function reconcileSetProjection(
  branches: readonly (readonly ColumnMetadata[])[],
): ColumnMetadata[] {
  const first = branches[0] ?? [];
  return first.map((column, index) => {
    const later = branches
      .slice(1)
      .flatMap((branch) => (branch[index] ? [branch[index]] : []));
    const type = later.every((candidate) =>
      sameType(column.type, candidate.type),
    )
      ? column.type
      : unknownType;
    return {
      ...column,
      type,
      nullable:
        column.nullable || later.some((candidate) => candidate.nullable),
      ordinal: index + 1,
    };
  });
}
const setPrecedence = (operator: SetOperator): number =>
  operator === "intersect" ? 2 : 1;
function setExpression(
  tokens: readonly SqlToken[],
  start: number,
  end: number,
  known: readonly RowSource[],
  catalog?: SemanticCatalog,
): SetQueryExpression | undefined {
  const range = unwrapOperand(tokens, { start, end });
  const direct = directSetParts(tokens, range.start, range.end);
  if (!direct) return undefined;
  const nodes: SetQueryExpression[] = direct.operands.map((operand) => {
    const unwrapped = unwrapOperand(tokens, operand);
    return (
      setExpression(tokens, unwrapped.start, unwrapped.end, known, catalog) ?? {
        kind: "branch",
        range: {
          start: tokens[unwrapped.start]?.start ?? 0,
          end: tokens[unwrapped.end - 1]?.end ?? 0,
        },
        projection: singleProjection(
          tokens,
          unwrapped.start,
          unwrapped.end,
          known,
          catalog,
        ),
      }
    );
  });
  const operatorStack: SetOperator[] = [];
  const nodeStack: SetQueryExpression[] = [];
  const reduce = (): void => {
    const right = nodeStack.pop();
    const left = nodeStack.pop();
    const operator = operatorStack.pop();
    if (!left || !right || !operator) return;
    nodeStack.push({
      kind: "set",
      operator,
      left,
      right,
      range: { start: left.range.start, end: right.range.end },
      projection: reconcileSetProjection([left.projection, right.projection]),
    });
  };
  nodeStack.push(nodes[0] as SetQueryExpression);
  for (let i = 0; i < direct.operators.length; i++) {
    const operator = direct.operators[i] as SetOperator;
    while (
      operatorStack.length &&
      setPrecedence(operatorStack.at(-1) as SetOperator) >=
        setPrecedence(operator)
    )
      reduce();
    operatorStack.push(operator);
    nodeStack.push(nodes[i + 1] as SetQueryExpression);
  }
  while (operatorStack.length) reduce();
  return nodeStack[0];
}
function collectSetExpressions(
  tokens: readonly SqlToken[],
  start: number,
  end: number,
  known: readonly RowSource[],
  catalog?: SemanticCatalog,
): SetQueryExpression[] {
  const root = setExpression(tokens, start, end, known, catalog);
  if (root) return [root];
  const expressions: SetQueryExpression[] = [];
  for (let i = start; i < end; i++) {
    if (tokens[i]?.text !== "(") continue;
    const close = matching(tokens, i);
    const nested = setExpression(tokens, i + 1, close, known, catalog);
    if (nested) {
      expressions.push(nested);
      i = close;
    }
  }
  return expressions;
}
function projection(
  tokens: readonly SqlToken[],
  start: number,
  end: number,
  known: readonly RowSource[],
  catalog?: SemanticCatalog,
  inherited?: ReadonlyMap<string, readonly ColumnMetadata[]>,
): ColumnMetadata[] {
  const unwrapped = unwrapOperand(tokens, { start, end });
  const set = directSetParts(tokens, unwrapped.start, unwrapped.end);
  if (!set)
    return singleProjection(
      tokens,
      unwrapped.start,
      unwrapped.end,
      known,
      catalog,
      inherited,
    );
  return reconcileSetProjection(
    set.operands.map((operand) => {
      const range = unwrapOperand(tokens, operand);
      return projection(
        tokens,
        range.start,
        range.end,
        known,
        catalog,
        inherited,
      );
    }),
  );
}
function singleProjection(
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
  const result: ColumnMetadata[] = [];
  for (const part of segments(
    tokens,
    projectionStart(tokens, select, projectionEnd),
    projectionEnd,
  )) {
    if (!part.length) continue;
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
      const ordinalStart = result.length;
      result.push(
        ...expanded.map((column, index) => ({
          ...column,
          ordinal: ordinalStart + index + 1,
        })),
      );
      continue;
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
    if (name) result.push(col(name, result.length + 1, base));
  }
  return result;
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

interface MutableQueryScope {
  readonly id: string;
  readonly kind: QueryScopeKind;
  readonly startToken: number;
  readonly endToken: number;
  readonly range: { readonly start: number; readonly end: number };
  readonly parent?: MutableQueryScope;
  readonly local: ScopedRowSource[];
  readonly applyOpenToken?: number;
}

const tokenDepths = (tokens: readonly SqlToken[]): readonly number[] => {
  let depth = 0;
  return tokens.map((token) => {
    const value = depth;
    if (token.text === "(") depth++;
    else if (token.text === ")") depth--;
    return value;
  });
};

function objectRowSource(
  parts: readonly string[],
  alias: string,
  origin: { readonly start: number; readonly end: number },
  catalog?: SemanticCatalog,
): RowSource {
  const database = parts.length === 3 ? parts[0] : catalog?.activeDatabase;
  const schema = parts.length >= 2 ? parts.at(-2) : undefined;
  const sourceObject = catalogObject(parts, catalog);
  return rowSource({
    name: parts.at(-1) ?? alias,
    alias,
    ...(database ? { database } : {}),
    ...(schema ? { schema } : {}),
    ...(sourceObject ? { sourceObject } : {}),
    sourceKind: "derivedTable",
    columns: catalogColumns(parts, catalog),
    origin,
  });
}

function queryScopeModel(
  tokens: readonly SqlToken[],
  statementTokenStart: number,
  statementTokenEnd: number,
  cursor: number,
  known: readonly RowSource[],
  catalog?: SemanticCatalog,
): {
  readonly scopes: readonly QueryScope[];
  readonly active?: QueryScope;
  readonly visible: readonly ScopedRowSource[];
} {
  const depths = tokenDepths(tokens);
  const mutable: MutableQueryScope[] = [];
  const statementEndOffset =
    tokens[statementTokenEnd]?.start ?? tokens.at(-1)?.end ?? cursor;
  for (let select = statementTokenStart; select < statementTokenEnd; select++) {
    if (tokens[select]?.normalized !== "select") continue;
    const selectDepth = depths[select] ?? 0;
    let open = -1;
    for (let i = select - 1; i >= statementTokenStart; i--) {
      if (tokens[i]?.text === "(" && (depths[i] ?? 0) === selectDepth - 1) {
        open = i;
        break;
      }
      if ((depths[i] ?? 0) < selectDepth - 1) break;
    }
    let endToken = statementTokenEnd;
    if (open >= 0) {
      const close = matching(tokens, open);
      endToken =
        close > open
          ? Math.min(close + 1, statementTokenEnd)
          : statementTokenEnd;
    }
    for (let i = select + 1; i < endToken; i++) {
      if (
        (depths[i] ?? 0) === selectDepth &&
        ["union", "intersect", "except"].includes(tokens[i]?.normalized ?? "")
      ) {
        endToken = i;
        break;
      }
    }
    const parent = [...mutable]
      .reverse()
      .find(
        (candidate) =>
          select > candidate.startToken && select < candidate.endToken,
      );
    let kind: QueryScopeKind = parent
      ? "correlatedExpressionSubquery"
      : "topLevelQuery";
    let applyOpenToken: number | undefined;
    if (open >= 0) {
      const previous = tokens[open - 1]?.normalized;
      if (previous === "apply") {
        kind = "applyRightQuery";
        applyOpenToken = open;
      } else if (previous === "from" || previous === "join")
        kind = "derivedTable";
      const cte = known.find(
        (source) =>
          source.sourceKind === "cte" &&
          source.origin.start < (tokens[select]?.start ?? 0) &&
          source.origin.end >= (tokens[select]?.end ?? 0),
      );
      if (cte && !parent) kind = "cteDefinition";
    }
    mutable.push({
      id: `query-${String(mutable.length + 1)}`,
      kind,
      startToken: select,
      endToken,
      range: {
        start: tokens[select]?.start ?? 0,
        end: tokens[endToken - 1]?.end ?? statementEndOffset,
      },
      ...(parent ? { parent } : {}),
      local: [],
      ...(applyOpenToken === undefined ? {} : { applyOpenToken }),
    });
  }
  for (const scope of mutable) {
    const depth = depths[scope.startToken] ?? 0;
    for (let i = scope.startToken + 1; i < scope.endToken; i++) {
      if ((depths[i] ?? 0) !== depth) continue;
      if (!["from", "join", "apply"].includes(tokens[i]?.normalized ?? ""))
        continue;
      let p = i + 1;
      let source: RowSource | undefined;
      let parts: string[] = [];
      if (tokens[p]?.text === "(") {
        const close = matching(tokens, p);
        p = close;
        source = known.find(
          (candidate) => candidate.origin.start === tokens[i]?.start,
        );
      } else if (ident(tokens[p])) {
        parts = [tokens[p]?.text ?? ""];
        while (tokens[p + 1]?.text === "." && ident(tokens[p + 2])) {
          parts.push(tokens[p + 2]?.text ?? "");
          p += 2;
        }
        if (tokens[p + 1]?.text === "." && !ident(tokens[p + 2])) continue;
        if (tokens[p + 1]?.text === "(") p = matching(tokens, p + 1);
      } else continue;
      if (tokens[p + 1]?.normalized === "as") p++;
      const aliasToken =
        ident(tokens[p + 1]) && !reserved.has(tokens[p + 1]?.normalized ?? "")
          ? tokens[p + 1]
          : undefined;
      const qualifier = aliasToken?.text ?? source?.alias ?? parts.at(-1);
      if (!qualifier) continue;
      source ??=
        known.find(
          (candidate) =>
            normalizeName(candidate.name) === normalizeName(parts.at(-1) ?? ""),
        ) ??
        objectRowSource(
          parts,
          qualifier,
          {
            start: tokens[i]?.start ?? 0,
            end: aliasToken?.end ?? tokens[p]?.end ?? 0,
          },
          catalog,
        );
      scope.local.push({ source, qualifier, scopeDistance: 0, outer: false });
    }
  }
  const activeMutable = [...mutable]
    .filter((scope) => scope.range.start <= cursor && cursor <= scope.range.end)
    .sort((a, b) => b.range.start - a.range.start)[0];
  const publicScopes: QueryScope[] = mutable.map((scope) => ({
    id: scope.id,
    kind: scope.kind,
    range: scope.range,
    ...(scope.parent ? { parentId: scope.parent.id } : {}),
    localRowSources: scope.local,
    allowsOuterReferences:
      scope.kind === "correlatedExpressionSubquery" ||
      scope.kind === "applyRightQuery",
  }));
  const visible: ScopedRowSource[] = [];
  const names = new Set<string>();
  let current = activeMutable;
  let distance = 0;
  let canContinue = true;
  let upperBound: number | undefined;
  while (current && canContinue) {
    const currentUpperBound = upperBound;
    const eligible =
      currentUpperBound === undefined
        ? current.local
        : current.local.filter(
            (binding) => binding.source.origin.end <= currentUpperBound,
          );
    for (const binding of eligible) {
      const normalized = normalizeName(binding.qualifier);
      if (names.has(normalized)) continue;
      names.add(normalized);
      visible.push({
        ...binding,
        scopeDistance: distance,
        outer: distance > 0,
      });
    }
    if (!current.parent) break;
    canContinue =
      current.kind === "correlatedExpressionSubquery" ||
      current.kind === "applyRightQuery";
    upperBound =
      current.kind === "applyRightQuery" && current.applyOpenToken !== undefined
        ? tokens[current.applyOpenToken]?.start
        : undefined;
    current = canContinue ? current.parent : undefined;
    distance++;
  }
  return {
    scopes: publicScopes,
    ...(activeMutable
      ? { active: publicScopes[mutable.indexOf(activeMutable)] as QueryScope }
      : {}),
    visible,
  };
}

/** Resolves an alias in semantic proximity order without consulting statement-wide symbols. */
export function resolveVisibleRowSource(
  model: DocumentSemanticModel,
  alias: string,
): ScopedRowSource | undefined {
  const normalized = normalizeName(alias);
  const scoped = model.visibleRowSources.find(
    (binding) => normalizeName(binding.qualifier) === normalized,
  );
  if (scoped || model.activeQueryScope) return scoped;
  const statementSource = model.aliases.get(normalized);
  return statementSource
    ? {
        source: statementSource,
        qualifier: alias,
        scopeDistance: 0,
        outer: false,
      }
    : undefined;
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
  const queryModel = queryScopeModel(
    tokens,
    batch,
    statementEnd,
    cursor,
    rowSources,
    catalog,
  );
  const setQueryExpressions = collectSetExpressions(
    tokens,
    batch,
    statementEnd,
    rowSources,
    catalog,
  );
  const aliases = new Map<string, RowSource>();
  for (const binding of queryModel.visible)
    aliases.set(normalizeName(binding.qualifier), binding.source);
  if (!queryModel.active) {
    for (const [alias, columns] of selectSources(
      tokens,
      batch,
      statementEnd,
      rowSources,
      catalog,
    ).bindings) {
      const local = rowSources.find(
        (source) =>
          source.columns === columns ||
          normalizeName(source.name) === alias ||
          normalizeName(source.alias ?? "") === alias,
      );
      aliases.set(
        alias,
        local ??
          rowSource({
            name: alias,
            alias,
            sourceKind: "derivedTable",
            columns,
            origin: {
              start: tokens[batch]?.start ?? 0,
              end: tokens[statementEnd - 1]?.end ?? cursor,
            },
          }),
      );
    }
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
    queryScopes: queryModel.scopes,
    ...(queryModel.active ? { activeQueryScope: queryModel.active } : {}),
    visibleRowSources: queryModel.visible,
    setQueryExpressions,
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
