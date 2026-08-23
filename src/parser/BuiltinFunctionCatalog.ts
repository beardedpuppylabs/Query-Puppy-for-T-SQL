import { normalizeName, type SqlType } from "../metadata/MetadataModels.js";
import type { SqlTypeFamily } from "../metadata/SqlTypeDescriptor.js";

export type BuiltinParameterSemantic =
  "datepart" | "expression" | "expressionOrStar";

export interface BuiltinParameter {
  readonly name: string;
  readonly ordinal: number;
  readonly optional?: boolean;
  readonly variadic?: boolean;
  readonly type?: SqlType;
  readonly families?: readonly SqlTypeFamily[];
  readonly semantic?: BuiltinParameterSemantic;
  /** Zero-based parameter index whose inferred type this parameter should match. */
  readonly sameTypeAs?: number;
  readonly minimumServerMajor?: number;
  readonly minimumCompatibilityLevel?: number;
}

export type BuiltinReturnRule =
  | { readonly kind: "fixed"; readonly type: SqlType }
  | { readonly kind: "argument"; readonly index: number }
  | { readonly kind: "precedence" }
  | { readonly kind: "dateadd" }
  | { readonly kind: "substring" }
  | { readonly kind: "charindex" }
  | { readonly kind: "round" }
  | { readonly kind: "stringAgg" }
  | { readonly kind: "isnull" }
  | { readonly kind: "len" }
  | { readonly kind: "stringTransform" }
  | { readonly kind: "replace" }
  | { readonly kind: "concat" }
  | { readonly kind: "numeric"; readonly operation: "scalar" | "sum" | "avg" };

export interface BuiltinOverClause {
  readonly required: boolean;
  readonly orderByRequired: boolean;
  readonly frameAllowed: boolean;
}

export interface BuiltinFunctionDefinition {
  readonly name: string;
  readonly normalizedName: string;
  readonly kind: "scalar" | "aggregate" | "window" | "expression";
  readonly parameters: readonly BuiltinParameter[];
  readonly returnRule: BuiltinReturnRule;
  readonly over?: BuiltinOverClause;
  readonly description: string;
  readonly minimumServerMajor: number;
}

export interface DatepartValueDefinition {
  readonly name: string;
  readonly aliases: readonly string[];
}

const integer = ["integer"] as const;
const numeric = ["integer", "decimal", "floatingPoint"] as const;
const scalarNumeric = [
  "integer",
  "decimal",
  "floatingPoint",
  "boolean",
] as const;
const temporal = ["dateTime", "time"] as const;
const textual = ["string", "unicodeString"] as const;
const textOrBinary = ["string", "unicodeString", "binary"] as const;
const optionalOver: BuiltinOverClause = {
  required: false,
  orderByRequired: false,
  frameAllowed: true,
};
const orderedOver: BuiltinOverClause = {
  required: true,
  orderByRequired: true,
  frameAllowed: false,
};

const p = (
  name: string,
  ordinal: number,
  options: Omit<BuiltinParameter, "name" | "ordinal"> = {},
): BuiltinParameter => ({ name, ordinal, ...options });

type Definition = Omit<BuiltinFunctionDefinition, "normalizedName">;
const fn = (
  name: string,
  kind: Definition["kind"],
  parameters: readonly BuiltinParameter[],
  returnRule: BuiltinReturnRule,
  description: string,
  minimumServerMajor = 7,
  over?: BuiltinOverClause,
): Definition => ({
  name,
  kind,
  parameters,
  returnRule,
  description,
  minimumServerMajor,
  ...(over ? { over } : {}),
});

const definitions: readonly Definition[] = [
  fn(
    "ABS",
    "scalar",
    [p("numericExpression", 1, { families: scalarNumeric })],
    { kind: "numeric", operation: "scalar" },
    "Returns the absolute value of a numeric expression.",
  ),
  fn(
    "AVG",
    "aggregate",
    [p("expression", 1, { families: numeric })],
    { kind: "numeric", operation: "avg" },
    "Returns the average of the values in a group.",
    7,
    optionalOver,
  ),
  fn(
    "CEILING",
    "scalar",
    [p("numericExpression", 1, { families: scalarNumeric })],
    { kind: "numeric", operation: "scalar" },
    "Returns the smallest integer greater than or equal to a number.",
  ),
  fn(
    "CHARINDEX",
    "scalar",
    [
      p("expressionToFind", 1, { families: textual }),
      p("expressionToSearch", 2, { families: textual }),
      p("startLocation", 3, { optional: true, families: integer }),
    ],
    { kind: "charindex" },
    "Returns the starting position of one character expression within another.",
  ),
  fn(
    "COALESCE",
    "expression",
    [
      p("expression1", 1, { semantic: "expression" }),
      p("expression2", 2, { semantic: "expression", variadic: true }),
    ],
    { kind: "precedence" },
    "Returns the first non-NULL expression using CASE type-precedence rules.",
  ),
  fn(
    "CONCAT",
    "scalar",
    [
      p("argument1", 1, { semantic: "expression" }),
      p("argument2", 2, { semantic: "expression", variadic: true }),
    ],
    { kind: "concat" },
    "Concatenates two or more values into a string.",
    11,
  ),
  fn(
    "COUNT",
    "aggregate",
    [p("expression", 1, { semantic: "expressionOrStar" })],
    { kind: "fixed", type: { name: "int" } },
    "Returns the number of items in a group.",
    7,
    optionalOver,
  ),
  fn(
    "COUNT_BIG",
    "aggregate",
    [p("expression", 1, { semantic: "expressionOrStar" })],
    { kind: "fixed", type: { name: "bigint" } },
    "Returns the number of items in a group as bigint.",
    7,
    optionalOver,
  ),
  fn(
    "DATEADD",
    "scalar",
    [
      p("datepart", 1, { semantic: "datepart" }),
      p("number", 2, { families: integer }),
      p("date", 3, { families: temporal }),
    ],
    { kind: "dateadd" },
    "Adds a signed integer number of dateparts to a date value.",
  ),
  fn(
    "DATEDIFF",
    "scalar",
    [
      p("datepart", 1, { semantic: "datepart" }),
      p("startdate", 2, { families: temporal }),
      p("enddate", 3, { families: temporal }),
    ],
    { kind: "fixed", type: { name: "int" } },
    "Returns the number of datepart boundaries crossed between two dates.",
  ),
  fn(
    "DATEFROMPARTS",
    "scalar",
    [
      p("year", 1, { families: integer }),
      p("month", 2, { families: integer }),
      p("day", 3, { families: integer }),
    ],
    { kind: "fixed", type: { name: "date" } },
    "Constructs a date from integer year, month, and day parts.",
    11,
  ),
  fn(
    "DATENAME",
    "scalar",
    [
      p("datepart", 1, { semantic: "datepart" }),
      p("date", 2, { families: temporal }),
    ],
    { kind: "fixed", type: { name: "nvarchar" } },
    "Returns a character string representing the requested part of a date.",
  ),
  fn(
    "DATEPART",
    "scalar",
    [
      p("datepart", 1, { semantic: "datepart" }),
      p("date", 2, { families: temporal }),
    ],
    { kind: "fixed", type: { name: "int" } },
    "Returns an integer representing the requested part of a date.",
  ),
  fn(
    "DENSE_RANK",
    "window",
    [],
    { kind: "fixed", type: { name: "bigint" } },
    "Returns the rank of rows without gaps within a window partition.",
    9,
    orderedOver,
  ),
  fn(
    "EOMONTH",
    "scalar",
    [
      p("startDate", 1, { families: temporal }),
      p("monthToAdd", 2, { optional: true, families: integer }),
    ],
    { kind: "fixed", type: { name: "date" } },
    "Returns the last day of the month containing a date.",
    11,
  ),
  fn(
    "FLOOR",
    "scalar",
    [p("numericExpression", 1, { families: scalarNumeric })],
    { kind: "numeric", operation: "scalar" },
    "Returns the largest integer less than or equal to a number.",
  ),
  fn(
    "GETDATE",
    "scalar",
    [],
    { kind: "fixed", type: { name: "datetime" } },
    "Returns the current database system timestamp as datetime.",
  ),
  fn(
    "ISNULL",
    "scalar",
    [
      p("checkExpression", 1, { semantic: "expression" }),
      p("replacementValue", 2, { semantic: "expression", sameTypeAs: 0 }),
    ],
    { kind: "isnull" },
    "Replaces NULL with the specified replacement value.",
  ),
  fn(
    "LAG",
    "window",
    [
      p("scalarExpression", 1, { semantic: "expression" }),
      p("offset", 2, { optional: true, families: integer }),
      p("default", 3, {
        optional: true,
        semantic: "expression",
        sameTypeAs: 0,
      }),
    ],
    { kind: "argument", index: 0 },
    "Returns a value from a preceding row in a window partition.",
    11,
    orderedOver,
  ),
  fn(
    "LEAD",
    "window",
    [
      p("scalarExpression", 1, { semantic: "expression" }),
      p("offset", 2, { optional: true, families: integer }),
      p("default", 3, {
        optional: true,
        semantic: "expression",
        sameTypeAs: 0,
      }),
    ],
    { kind: "argument", index: 0 },
    "Returns a value from a following row in a window partition.",
    11,
    orderedOver,
  ),
  fn(
    "LEFT",
    "scalar",
    [
      p("characterExpression", 1, { families: textual }),
      p("integerExpression", 2, { families: integer }),
    ],
    { kind: "stringTransform" },
    "Returns the left part of a character string.",
  ),
  fn(
    "LEN",
    "scalar",
    [p("stringExpression", 1, { families: textOrBinary })],
    { kind: "len" },
    "Returns the number of characters in a string, excluding trailing spaces.",
  ),
  fn(
    "LOWER",
    "scalar",
    [p("characterExpression", 1, { families: textual })],
    { kind: "stringTransform" },
    "Converts character data to lowercase.",
  ),
  fn(
    "LTRIM",
    "scalar",
    [
      p("characterExpression", 1, { families: textual }),
      p("characters", 2, {
        optional: true,
        families: textual,
        minimumServerMajor: 16,
        minimumCompatibilityLevel: 160,
      }),
    ],
    { kind: "stringTransform" },
    "Removes leading spaces or specified characters from a character expression.",
  ),
  fn(
    "MAX",
    "aggregate",
    [p("expression", 1, { semantic: "expression" })],
    { kind: "argument", index: 0 },
    "Returns the maximum value in a group.",
    7,
    optionalOver,
  ),
  fn(
    "MIN",
    "aggregate",
    [p("expression", 1, { semantic: "expression" })],
    { kind: "argument", index: 0 },
    "Returns the minimum value in a group.",
    7,
    optionalOver,
  ),
  fn(
    "NTILE",
    "window",
    [p("integerExpression", 1, { families: integer })],
    { kind: "fixed", type: { name: "bigint" } },
    "Distributes rows into a requested number of window groups.",
    9,
    orderedOver,
  ),
  fn(
    "NULLIF",
    "scalar",
    [
      p("expression", 1, { semantic: "expression" }),
      p("expressionToCompare", 2, { semantic: "expression", sameTypeAs: 0 }),
    ],
    { kind: "argument", index: 0 },
    "Returns NULL when two expressions are equal; otherwise returns the first expression.",
  ),
  fn(
    "RANK",
    "window",
    [],
    { kind: "fixed", type: { name: "bigint" } },
    "Returns the rank of rows with gaps within a window partition.",
    9,
    orderedOver,
  ),
  fn(
    "REPLACE",
    "scalar",
    [
      p("stringExpression", 1, { families: textOrBinary }),
      p("stringPattern", 2, { families: textOrBinary, sameTypeAs: 0 }),
      p("stringReplacement", 3, { families: textOrBinary, sameTypeAs: 0 }),
    ],
    { kind: "replace" },
    "Replaces occurrences of a substring with another string.",
  ),
  fn(
    "RIGHT",
    "scalar",
    [
      p("characterExpression", 1, { families: textual }),
      p("integerExpression", 2, { families: integer }),
    ],
    { kind: "stringTransform" },
    "Returns the right part of a character string.",
  ),
  fn(
    "ROUND",
    "scalar",
    [
      p("numericExpression", 1, { families: numeric }),
      p("length", 2, { families: integer }),
      p("function", 3, { optional: true, families: integer }),
    ],
    { kind: "round" },
    "Rounds or truncates a numeric expression to the requested precision.",
  ),
  fn(
    "ROW_NUMBER",
    "window",
    [],
    { kind: "fixed", type: { name: "bigint" } },
    "Returns the sequential number of a row within a window partition.",
    9,
    orderedOver,
  ),
  fn(
    "RTRIM",
    "scalar",
    [
      p("characterExpression", 1, { families: textual }),
      p("characters", 2, {
        optional: true,
        families: textual,
        minimumServerMajor: 16,
        minimumCompatibilityLevel: 160,
      }),
    ],
    { kind: "stringTransform" },
    "Removes trailing spaces or specified characters from a character expression.",
  ),
  fn(
    "STRING_AGG",
    "aggregate",
    [
      p("expression", 1, { semantic: "expression" }),
      p("separator", 2, { families: textual }),
    ],
    { kind: "stringAgg" },
    "Concatenates expression values using a separator.",
    14,
  ),
  fn(
    "SUBSTRING",
    "scalar",
    [
      p("expression", 1, { families: textOrBinary }),
      p("start", 2, { families: integer }),
      p("length", 3, { families: integer }),
    ],
    { kind: "substring" },
    "Returns part of a character or binary expression.",
  ),
  fn(
    "SUM",
    "aggregate",
    [p("expression", 1, { families: numeric })],
    { kind: "numeric", operation: "sum" },
    "Returns the sum of the values in a group.",
    7,
    optionalOver,
  ),
  fn(
    "SYSDATETIME",
    "scalar",
    [],
    { kind: "fixed", type: { name: "datetime2", scale: 7 } },
    "Returns the current database system timestamp as datetime2(7).",
    10,
  ),
  fn(
    "SYSUTCDATETIME",
    "scalar",
    [],
    { kind: "fixed", type: { name: "datetime2", scale: 7 } },
    "Returns the current UTC database system timestamp as datetime2(7).",
    10,
  ),
  fn(
    "UPPER",
    "scalar",
    [p("characterExpression", 1, { families: textual })],
    { kind: "stringTransform" },
    "Converts character data to uppercase.",
  ),
];

const datepartValues: readonly DatepartValueDefinition[] = [
  { name: "year", aliases: ["yy", "yyyy"] },
  { name: "quarter", aliases: ["qq", "q"] },
  { name: "month", aliases: ["mm", "m"] },
  { name: "dayofyear", aliases: ["dy", "y"] },
  { name: "day", aliases: ["dd", "d"] },
  { name: "week", aliases: ["wk", "ww"] },
  { name: "weekday", aliases: ["dw", "w"] },
  { name: "hour", aliases: ["hh"] },
  { name: "minute", aliases: ["mi", "n"] },
  { name: "second", aliases: ["ss", "s"] },
  { name: "millisecond", aliases: ["ms"] },
  { name: "microsecond", aliases: ["mcs"] },
  { name: "nanosecond", aliases: ["ns"] },
];

export const DATEPART_VALUES: readonly DatepartValueDefinition[] =
  Object.freeze(
    datepartValues.map((value) =>
      Object.freeze({ ...value, aliases: Object.freeze([...value.aliases]) }),
    ),
  );

export const BUILTIN_FUNCTIONS: readonly BuiltinFunctionDefinition[] =
  Object.freeze(
    definitions.map((definition) =>
      Object.freeze({
        ...definition,
        parameters: Object.freeze(
          definition.parameters.map((parameter) => Object.freeze(parameter)),
        ),
        returnRule: Object.freeze(definition.returnRule),
        ...(definition.over ? { over: Object.freeze(definition.over) } : {}),
        normalizedName: normalizeName(definition.name),
      }),
    ),
  );

const byName = new Map(
  BUILTIN_FUNCTIONS.map((item) => [item.normalizedName, item]),
);

export const findBuiltinFunction = (
  name: string,
): BuiltinFunctionDefinition | undefined => byName.get(normalizeName(name));
