import type { ColumnMetadata, SqlType } from "../metadata/MetadataModels.js";
import { normalizeName } from "../metadata/MetadataModels.js";
import {
  describeSqlType,
  describeSqlTypeFamilies,
  UNKNOWN_SQL_TYPE,
  type SqlTypeDescriptor,
} from "../metadata/SqlTypeDescriptor.js";
import type { CompletionScope } from "../completion/CandidateFactory.js";
import type {
  DocumentSemanticModel,
  RowSource,
} from "./DocumentSemanticAnalyzer.js";
import { resolveCatalogObject } from "./CatalogObjectResolver.js";
import {
  resolveCallableAtCursor,
  resolveCompletedScalarCallable,
} from "./CallableAnalyzer.js";
import { tokenizeSql, type SqlToken } from "./SqlTokenizer.js";
import { resolveDocumentSymbols } from "./DocumentSymbols.js";

export type ExpectedTypeSource =
  | "comparisonOperand"
  | "functionParameter"
  | "updateAssignment"
  | "insertTarget"
  | "arithmeticOperand"
  | "likeOperand";

export interface ExpectedTypeContext {
  readonly expectedType: SqlTypeDescriptor;
  readonly source: ExpectedTypeSource;
  readonly confidence: "catalog" | "projection" | "literal" | "reconciled";
  readonly comparisonColumn?: {
    readonly source: RowSource;
    readonly column: ColumnMetadata;
  };
}

export interface UpdateAssignment {
  readonly ordinal: number;
  readonly targetColumnName: string;
  readonly targetRange: { readonly start: number; readonly end: number };
  readonly equalsRange: { readonly start: number; readonly end: number };
  readonly rhsStart: number;
  readonly rhsEnd: number;
  readonly updateTarget: string;
}

export function updateAssignmentAtCursor(
  sql: string,
  cursor: number,
): UpdateAssignment | undefined {
  const tokens = tokenizeSql(sql);
  let statementStart = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token || token.start >= cursor) break;
    if (token.text === ";" || token.normalized === "go")
      statementStart = index + 1;
  }
  let depth = 0;
  const depths = tokens.map((token) => {
    const current = depth;
    if (token.text === "(") depth++;
    else if (token.text === ")") depth--;
    return current;
  });
  let update = -1;
  for (let index = statementStart; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token || token.start >= cursor) break;
    if (token.normalized === "update" && depths[index] === 0) update = index;
  }
  const updateTarget = tokens[update + 1];
  if (update < 0 || updateTarget?.kind !== "identifier") return undefined;
  let set = -1;
  for (let index = update + 2; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token || token.start >= cursor) break;
    if (token.normalized === "set" && depths[index] === depths[update]) {
      set = index;
      break;
    }
  }
  if (set < 0) return undefined;
  const baseDepth = depths[set] ?? 0;
  let segmentStart = set + 1;
  let ordinal = 1;
  for (let index = set + 1; index <= tokens.length; index++) {
    const token = tokens[index];
    const boundary =
      !token ||
      token.text === ";" ||
      (depths[index] === baseDepth &&
        (token.text === "," ||
          ["from", "where", "output", "option"].includes(token.normalized)));
    if (!boundary) continue;
    const segmentEnd = index;
    let equals = -1;
    for (let part = segmentStart; part < segmentEnd; part++)
      if (tokens[part]?.text === "=" && depths[part] === baseDepth) {
        equals = part;
        break;
      }
    if (equals >= 0) {
      const target = tokens
        .slice(segmentStart, equals)
        .reverse()
        .find((candidate) => candidate.kind === "identifier");
      const rhsStart = tokens[equals]?.end ?? cursor;
      const rhsEnd = token?.start ?? sql.length;
      if (target && cursor >= rhsStart && cursor <= rhsEnd)
        return {
          ordinal,
          targetColumnName: target.text,
          targetRange: { start: target.start, end: target.end },
          equalsRange: {
            start: tokens[equals]?.start ?? rhsStart,
            end: tokens[equals]?.end ?? rhsStart,
          },
          rhsStart,
          rhsEnd,
          updateTarget: updateTarget.text,
        };
    }
    if (!token || token.text === ";" || token.text !== ",") break;
    segmentStart = index + 1;
    ordinal++;
  }
  return undefined;
}

const unknown = (): SqlTypeDescriptor => UNKNOWN_SQL_TYPE;
const known = (type?: SqlType): SqlTypeDescriptor => describeSqlType(type);
const visibleSource = (
  semantics: DocumentSemanticModel,
  qualifier: string,
): RowSource | undefined =>
  semantics.visibleRowSources.find(
    (binding) => normalizeName(binding.qualifier) === normalizeName(qualifier),
  )?.source ?? semantics.aliases.get(normalizeName(qualifier));

const updateTargetSource = (
  sql: string,
  qualifier: string,
  scope: CompletionScope,
  semantics: DocumentSemanticModel,
): RowSource | undefined => {
  const semantic = visibleSource(semantics, qualifier);
  if (semantic?.columns.length) return semantic;
  // UPDATE frequently references a target alias whose physical FROM source is
  // textually after the completion cursor. Resolve that alias from the complete
  // statement, then bind it directly to the already-cached catalog.
  const reference = resolveDocumentSymbols(
    tokenizeSql(sql),
    Number.POSITIVE_INFINITY,
  ).aliases.get(normalizeName(qualifier));
  if (!reference) return semantic;
  const object = resolveCatalogObject(
    [reference.database, reference.schema, reference.name].filter(
      (part): part is string => Boolean(part),
    ),
    scope,
    ["table", "view"],
  );
  return object
    ? {
        sourceId: `update:${reference.database ?? scope.activeDatabase}.${object.schema}.${object.name}:${reference.alias}`,
        name: object.name,
        alias: reference.alias,
        database: reference.database ?? scope.activeDatabase,
        schema: object.schema,
        sourceKind: "derivedTable",
        sourceObject: object,
        columns: object.columns,
        origin: { start: 0, end: 0 },
      }
    : semantic;
};

const findColumnReference = (
  tokens: readonly SqlToken[],
  semantics: DocumentSemanticModel,
):
  | { readonly source: RowSource; readonly column: ColumnMetadata }
  | undefined => {
  for (let i = tokens.length - 1; i >= 2; i--) {
    const column = tokens[i];
    if (
      column?.kind !== "identifier" ||
      tokens[i - 1]?.text !== "." ||
      tokens[i - 2]?.kind !== "identifier"
    )
      continue;
    const source = visibleSource(semantics, tokens[i - 2]?.text ?? "");
    const resolvedColumn = source?.columns.find(
      (candidate) => candidate.normalizedName === column.normalized,
    );
    return source && resolvedColumn
      ? { source, column: resolvedColumn }
      : undefined;
  }
  const identifier = [...tokens]
    .reverse()
    .find((token) => token.kind === "identifier");
  if (!identifier) return undefined;
  const matches = semantics.visibleRowSources.flatMap((binding) =>
    binding.source.columns
      .filter((column) => column.normalizedName === identifier.normalized)
      .map((column) => ({ source: binding.source, column })),
  );
  return matches.length === 1 ? matches[0] : undefined;
};

const parseTypeTokens = (tokens: readonly SqlToken[]): SqlTypeDescriptor => {
  const name = tokens.find((token) => token.kind === "identifier");
  if (!name) return unknown();
  const numbers = tokens
    .filter((token) => token.kind === "number")
    .map((token) => Number(token.text));
  const max = tokens.some((token) => token.normalized === "max");
  const normalized = name.normalized;
  const type: SqlType = { name: name.text };
  if (
    ["decimal", "numeric"].includes(normalized) &&
    numbers[0] !== undefined &&
    numbers[1] !== undefined
  )
    return known({ ...type, precision: numbers[0], scale: numbers[1] });
  if (
    ["datetime2", "datetimeoffset", "time"].includes(normalized) &&
    numbers[0] !== undefined
  )
    return known({ ...type, scale: numbers[0] });
  if (
    ["char", "varchar", "nchar", "nvarchar", "binary", "varbinary"].includes(
      normalized,
    )
  )
    if (max) return known({ ...type, maxLength: -1 });
  if (numbers[0] !== undefined)
    return known({
      ...type,
      maxLength: normalized.startsWith("n") ? numbers[0] * 2 : numbers[0],
    });
  return known(type);
};

const reconcile = (types: readonly SqlTypeDescriptor[]): SqlTypeDescriptor => {
  const values = types.filter((type) => type.kind === "known");
  const first = values[0];
  if (!first) return unknown();
  if (values.every((value) => value.normalizedName === first.normalizedName))
    return first;
  const numeric = new Set(["integer", "decimal", "floatingPoint"]);
  const text = new Set(["string", "unicodeString"]);
  if (values.every((value) => numeric.has(value.family)))
    return known({ name: "decimal" });
  if (values.every((value) => text.has(value.family)))
    return known({
      name: values.some((value) => value.family === "unicodeString")
        ? "nvarchar"
        : "varchar",
    });
  return unknown();
};

export function inferExpressionType(
  sql: string,
  start: number,
  end: number,
  scope: CompletionScope,
  semantics: DocumentSemanticModel,
): SqlTypeDescriptor {
  const text = sql.slice(start, end).trim();
  if (!text || /^null$/i.test(text)) return unknown();
  if (/^N'(?:''|[^'])*'$/i.test(text))
    return known({
      name: "nvarchar",
      maxLength: Math.max(0, text.length - 3) * 2,
    });
  if (/^'(?:''|[^'])*'$/.test(text))
    return known({ name: "varchar", maxLength: Math.max(0, text.length - 2) });
  if (/^0x[0-9a-f]*$/i.test(text))
    return known({
      name: "varbinary",
      maxLength: Math.max(0, (text.length - 2) / 2),
    });
  if (/^[+-]?\d+$/.test(text)) {
    const value = BigInt(text);
    return known({
      name:
        value >= -2_147_483_648n && value <= 2_147_483_647n ? "int" : "bigint",
    });
  }
  if (/^[+-]?\d+\.\d+$/.test(text)) {
    const unsigned = text.replace(/^[+-]/, "");
    const [whole = "", fraction = ""] = unsigned.split(".");
    return known({
      name: "decimal",
      precision: whole.length + fraction.length,
      scale: fraction.length,
    });
  }
  const tokens = tokenizeSql(text);
  const finalToken = tokens.at(-1);
  if (tokens[0]?.text === "(" && finalToken?.text === ")")
    return inferExpressionType(
      text,
      tokens[0].end,
      finalToken.start,
      scope,
      semantics,
    );
  if (tokens[0]?.normalized === "cast") {
    const as = tokens.findIndex((token) => token.normalized === "as");
    if (as >= 0) return parseTypeTokens(tokens.slice(as + 1, -1));
  }
  if (tokens[0]?.normalized === "convert" && tokens[1]?.text === "(") {
    const comma = tokens.findIndex(
      (token, index) => index > 1 && token.text === ",",
    );
    if (comma > 0) return parseTypeTokens(tokens.slice(2, comma));
  }
  if (tokens[0]?.normalized === "case") {
    const branches: SqlTypeDescriptor[] = [];
    for (let i = 0; i < tokens.length; i++)
      if (["then", "else"].includes(tokens[i]?.normalized ?? "")) {
        const branch = tokens[i];
        if (!branch) continue;
        const stop = tokens.findIndex(
          (token, index) =>
            index > i && ["when", "else", "end"].includes(token.normalized),
        );
        branches.push(
          inferExpressionType(
            text,
            branch.end,
            stop < 0 ? text.length : (tokens[stop]?.start ?? text.length),
            scope,
            semantics,
          ),
        );
      }
    return reconcile(branches);
  }
  const arithmetic = tokens.findIndex((token) =>
    ["+", "-", "*", "/", "%"].includes(token.text),
  );
  if (arithmetic > 0) {
    const operator = tokens[arithmetic];
    if (!operator) return unknown();
    const left = inferExpressionType(text, 0, operator.start, scope, semantics);
    const right = inferExpressionType(
      text,
      operator.end,
      text.length,
      scope,
      semantics,
    );
    return reconcile([left, right]);
  }
  if (tokens.at(-1)?.text === ")") {
    const callable = resolveCompletedScalarCallable(sql, start, end, scope);
    if (callable?.signature.returnType)
      return known(callable.signature.returnType);
    if (callable?.signature.returnRule)
      return inferCallableReturnType(callable, sql, scope, semantics);
  }
  return known(findColumnReference(tokens, semantics)?.column.type);
}

const argumentType = (
  resolution: NonNullable<ReturnType<typeof resolveCompletedScalarCallable>>,
  ordinal: number,
  sql: string,
  scope: CompletionScope,
  semantics: DocumentSemanticModel,
): SqlTypeDescriptor => {
  const range = resolution.callSite.arguments[ordinal];
  return range
    ? inferExpressionType(sql, range.start, range.end, scope, semantics)
    : unknown();
};

function inferCallableReturnType(
  resolution: NonNullable<ReturnType<typeof resolveCompletedScalarCallable>>,
  sql: string,
  scope: CompletionScope,
  semantics: DocumentSemanticModel,
): SqlTypeDescriptor {
  const rule = resolution.signature.returnRule;
  if (!rule) return unknown();
  if (rule.kind === "fixed") return known(rule.type);
  const first = argumentType(resolution, 0, sql, scope, semantics);
  if (rule.kind === "dateadd") {
    const range = resolution.callSite.arguments[2];
    if (
      range &&
      /^\s*'(?:''|[^'])*'\s*$/.test(sql.slice(range.start, range.end))
    )
      return known({ name: "datetime" });
    return argumentType(resolution, 2, sql, scope, semantics);
  }
  if (rule.kind === "substring") {
    if (first.kind !== "known") return unknown();
    if (first.family === "unicodeString")
      return { ...first, sqlName: "nvarchar", normalizedName: "nvarchar" };
    if (first.family === "string")
      return { ...first, sqlName: "varchar", normalizedName: "varchar" };
    if (first.family === "binary")
      return { ...first, sqlName: "varbinary", normalizedName: "varbinary" };
    return unknown();
  }
  if (rule.kind === "charindex") {
    const searched = argumentType(resolution, 1, sql, scope, semantics);
    return known({
      name:
        searched.kind === "known" &&
        searched.length === -1 &&
        ["varchar", "nvarchar", "varbinary"].includes(searched.normalizedName)
          ? "bigint"
          : "int",
    });
  }
  if (rule.kind === "round") {
    if (first.kind !== "known") return unknown();
    if (["tinyint", "smallint"].includes(first.normalizedName))
      return known({ name: "int" });
    if (first.normalizedName === "real") return known({ name: "float" });
    return first;
  }
  if (first.kind !== "known") return unknown();
  if (first.family === "unicodeString")
    return known({
      name: "nvarchar",
      maxLength: first.length === -1 ? -1 : 8000,
    });
  if (first.family === "string")
    return known({
      name: "varchar",
      maxLength: first.length === -1 ? -1 : 8000,
    });
  return known({ name: "nvarchar", maxLength: 8000 });
}

const contextResult = (
  type: SqlTypeDescriptor,
  source: ExpectedTypeSource,
  confidence: ExpectedTypeContext["confidence"] = "catalog",
  comparisonColumn?: ExpectedTypeContext["comparisonColumn"],
): ExpectedTypeContext | undefined =>
  type.kind !== "unknown"
    ? {
        expectedType: type,
        source,
        confidence,
        ...(comparisonColumn ? { comparisonColumn } : {}),
      }
    : undefined;

const comparisonColumnInRange = (
  sql: string,
  start: number,
  end: number,
  semantics: DocumentSemanticModel,
): ExpectedTypeContext["comparisonColumn"] => {
  const tokens = tokenizeSql(sql.slice(start, end));
  const last = tokens.at(-1);
  if (last?.kind !== "identifier") return undefined;
  const qualified =
    tokens.at(-2)?.text === "." && tokens.at(-3)?.kind === "identifier";
  const operandStart = qualified ? tokens.length - 3 : tokens.length - 1;
  const preceding = tokens[operandStart - 1];
  if (
    preceding &&
    preceding.text !== "(" &&
    !["on", "where", "and", "or", "when", "having"].includes(
      preceding.normalized,
    )
  )
    return undefined;
  return findColumnReference(tokens.slice(operandStart), semantics);
};

const topLevelCommaOrdinal = (text: string): number => {
  const tokens = tokenizeSql(text);
  let depth = 0,
    ordinal = 0;
  for (const token of tokens) {
    if (token.text === "(") depth++;
    else if (token.text === ")") depth--;
    else if (token.text === "," && depth === 0) ordinal++;
  }
  return ordinal;
};

export function inferExpectedTypeAtCursor(
  sql: string,
  cursor: number,
  scope: CompletionScope,
  semantics: DocumentSemanticModel,
): ExpectedTypeContext | undefined {
  const signature = resolveCallableAtCursor(sql, cursor, scope);
  const parameter = signature?.signature.parameters[signature.activeParameter];
  if (parameter?.type)
    return contextResult(known(parameter.type), "functionParameter");
  if (parameter?.families?.length)
    return contextResult(
      describeSqlTypeFamilies(parameter.families),
      "functionParameter",
    );

  const before = sql.slice(0, cursor);
  // Resolve the current SET assignment before generic comparison operators.
  // Otherwise an equals sign in an earlier assignment can be mistaken for the
  // cursor's expression context.
  const update = updateAssignmentAtCursor(sql, cursor);
  if (update) {
    const targetSource = updateTargetSource(
      sql,
      update.updateTarget,
      scope,
      semantics,
    );
    const column = targetSource?.columns.find(
      (item) => item.normalizedName === normalizeName(update.targetColumnName),
    );
    if (column) return contextResult(known(column.type), "updateAssignment");
  }

  const comparison =
    /(?:^|[\s,(])(.+?)\s*(=|<>|!=|<=|>=|<|>)\s*(?:[\w@#$]*\.)?[\w@#$]*$/is.exec(
      before,
    );
  if (comparison) {
    const expression = comparison[1] ?? "";
    const offset = before.lastIndexOf(expression);
    const result = contextResult(
      inferExpressionType(
        sql,
        offset,
        offset + expression.length,
        scope,
        semantics,
      ),
      "comparisonOperand",
      "catalog",
      comparisonColumnInRange(
        sql,
        offset,
        offset + expression.length,
        semantics,
      ),
    );
    if (result) return result;
  }
  const after = sql.slice(cursor);
  const rightComparison =
    /^\s*(?:[\w@#$]*\.)?[\w@#$]*\s*(=|<>|!=|<=|>=|<|>)\s*([^,;\n)]+)/i.exec(
      after,
    );
  if (rightComparison?.[2]) {
    const offset = cursor + after.indexOf(rightComparison[2]);
    const result = contextResult(
      inferExpressionType(
        sql,
        offset,
        offset + rightComparison[2].length,
        scope,
        semantics,
      ),
      "comparisonOperand",
      "catalog",
      comparisonColumnInRange(
        sql,
        offset,
        offset + rightComparison[2].length,
        semantics,
      ),
    );
    if (result) return result;
  }
  const like = /(.+?)\s+like\s+(?:[\w@#$]*\.)?[\w@#$]*$/is.exec(before);
  if (like?.[1]) {
    const offset = before.lastIndexOf(like[1]);
    const type = inferExpressionType(
      sql,
      offset,
      offset + like[1].length,
      scope,
      semantics,
    );
    if (["string", "unicodeString"].includes(type.family))
      return contextResult(type, "likeOperand");
  }
  const arithmetic = /(.+?)\s*([-+*/%])\s*(?:[\w@#$]*\.)?[\w@#$]*$/s.exec(
    before,
  );
  if (arithmetic?.[1]) {
    const offset = before.lastIndexOf(arithmetic[1]);
    const result = contextResult(
      inferExpressionType(
        sql,
        offset,
        offset + arithmetic[1].length,
        scope,
        semantics,
      ),
      "arithmeticOperand",
    );
    if (result) return result;
  }

  const insert =
    /\binsert\s+(?:into\s+)?([\w.[\]]+)\s*\(([^)]*)\)[\s\S]*?\b(values|select)\b([\s\S]*)$/i.exec(
      before,
    );
  if (
    insert?.[1] &&
    insert[2] !== undefined &&
    insert[3] &&
    insert[4] !== undefined
  ) {
    const parts = insert[1]
      .split(".")
      .map((part) => part.replace(/^\[|\]$/g, ""));
    const object = resolveCatalogObject(parts, scope, ["table", "view"]);
    const targets = insert[2]
      .split(",")
      .map((name) => normalizeName(name.trim().replace(/^\[|\]$/g, "")));
    const expressionList =
      insert[3].toLowerCase() === "values"
        ? insert[4].replace(/^\s*\(/, "")
        : insert[4];
    const ordinal = topLevelCommaOrdinal(expressionList);
    const column = object?.columns.find(
      (item) => item.normalizedName === targets[ordinal],
    );
    if (column) return contextResult(known(column.type), "insertTarget");
  }
  return undefined;
}
