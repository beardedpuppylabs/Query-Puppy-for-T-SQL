import { normalizeName, type SqlType } from "../metadata/MetadataModels.js";
import type { SqlTypeFamily } from "../metadata/SqlTypeDescriptor.js";

export interface BuiltinParameter {
  readonly name: string;
  readonly ordinal: number;
  readonly optional?: boolean;
  readonly type?: SqlType;
  readonly families?: readonly SqlTypeFamily[];
  readonly semantic?: string;
}

export type BuiltinReturnRule =
  | { readonly kind: "fixed"; readonly type: SqlType }
  | { readonly kind: "dateadd" }
  | { readonly kind: "substring" }
  | { readonly kind: "charindex" }
  | { readonly kind: "round" }
  | { readonly kind: "stringAgg" };

export interface BuiltinFunctionDefinition {
  readonly name: string;
  readonly normalizedName: string;
  readonly kind: "scalar" | "aggregate";
  readonly parameters: readonly BuiltinParameter[];
  readonly returnRule: BuiltinReturnRule;
  readonly description: string;
  readonly minimumServerMajor: number;
}

const integer = ["integer"] as const;
const numeric = ["integer", "decimal", "floatingPoint"] as const;
const temporal = ["dateTime", "time"] as const;
const textual = ["string", "unicodeString"] as const;
const textOrBinary = ["string", "unicodeString", "binary"] as const;

const definitions: readonly Omit<
  BuiltinFunctionDefinition,
  "normalizedName"
>[] = [
  {
    name: "CHARINDEX",
    kind: "scalar",
    parameters: [
      { name: "expressionToFind", ordinal: 1, families: textual },
      { name: "expressionToSearch", ordinal: 2, families: textual },
      { name: "startLocation", ordinal: 3, optional: true, families: integer },
    ],
    returnRule: { kind: "charindex" },
    description:
      "Returns the starting position of one character expression within another.",
    minimumServerMajor: 7,
  },
  {
    name: "DATEADD",
    kind: "scalar",
    parameters: [
      { name: "datepart", ordinal: 1, semantic: "datepart" },
      { name: "number", ordinal: 2, families: integer },
      { name: "date", ordinal: 3, families: temporal },
    ],
    returnRule: { kind: "dateadd" },
    description: "Adds a signed integer number of dateparts to a date value.",
    minimumServerMajor: 7,
  },
  {
    name: "DATEDIFF",
    kind: "scalar",
    parameters: [
      { name: "datepart", ordinal: 1, semantic: "datepart" },
      { name: "startdate", ordinal: 2, families: temporal },
      { name: "enddate", ordinal: 3, families: temporal },
    ],
    returnRule: { kind: "fixed", type: { name: "int" } },
    description:
      "Returns the number of datepart boundaries crossed between two dates.",
    minimumServerMajor: 7,
  },
  {
    name: "DATEFROMPARTS",
    kind: "scalar",
    parameters: [
      { name: "year", ordinal: 1, families: integer },
      { name: "month", ordinal: 2, families: integer },
      { name: "day", ordinal: 3, families: integer },
    ],
    returnRule: { kind: "fixed", type: { name: "date" } },
    description: "Constructs a date from integer year, month, and day parts.",
    minimumServerMajor: 11,
  },
  {
    name: "ROUND",
    kind: "scalar",
    parameters: [
      { name: "numericExpression", ordinal: 1, families: numeric },
      { name: "length", ordinal: 2, families: integer },
      { name: "function", ordinal: 3, optional: true, families: integer },
    ],
    returnRule: { kind: "round" },
    description:
      "Rounds or truncates a numeric expression to the requested precision.",
    minimumServerMajor: 7,
  },
  {
    name: "STRING_AGG",
    kind: "aggregate",
    parameters: [
      { name: "expression", ordinal: 1 },
      { name: "separator", ordinal: 2, families: textual },
    ],
    returnRule: { kind: "stringAgg" },
    description: "Concatenates expression values using a separator.",
    minimumServerMajor: 14,
  },
  {
    name: "SUBSTRING",
    kind: "scalar",
    parameters: [
      { name: "expression", ordinal: 1, families: textOrBinary },
      { name: "start", ordinal: 2, families: integer },
      { name: "length", ordinal: 3, families: integer },
    ],
    returnRule: { kind: "substring" },
    description: "Returns part of a character or binary expression.",
    minimumServerMajor: 7,
  },
];

export const BUILTIN_FUNCTIONS: readonly BuiltinFunctionDefinition[] =
  Object.freeze(
    definitions.map((definition) =>
      Object.freeze({
        ...definition,
        parameters: Object.freeze(
          definition.parameters.map((parameter) => Object.freeze(parameter)),
        ),
        returnRule: Object.freeze(definition.returnRule),
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
