import type { SqlType } from "./MetadataModels.js";

export type SqlTypeFamily =
  | "integer"
  | "decimal"
  | "floatingPoint"
  | "string"
  | "unicodeString"
  | "dateTime"
  | "time"
  | "binary"
  | "boolean"
  | "guid"
  | "xml"
  | "variant"
  | "userDefined"
  | "unknown";

export interface SqlTypeDescriptor {
  readonly kind: "known" | "unknown";
  readonly sqlName: string;
  readonly normalizedName: string;
  readonly family: SqlTypeFamily;
  readonly schema?: string;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly userDefined: boolean;
  readonly userDefinedTypeName?: string;
  readonly underlyingSystemType?: string;
}

export type TypeCompatibility =
  "exact" | "sameBaseType" | "compatibleFamily" | "unknown" | "incompatible";

export const TYPE_COMPATIBILITY_ORDER: Readonly<
  Record<TypeCompatibility, number>
> = {
  exact: 0,
  sameBaseType: 1,
  compatibleFamily: 2,
  unknown: 3,
  incompatible: 4,
};

export const UNKNOWN_SQL_TYPE: SqlTypeDescriptor = Object.freeze({
  kind: "unknown",
  sqlName: "unknown",
  normalizedName: "unknown",
  family: "unknown",
  userDefined: false,
});

const descriptorCache = new WeakMap<object, SqlTypeDescriptor>();
const integers = new Set(["tinyint", "smallint", "int", "bigint"]);
const decimals = new Set(["decimal", "numeric", "money", "smallmoney"]);
const floating = new Set(["float", "real"]);
const strings = new Set(["char", "varchar", "text"]);
const unicodeStrings = new Set(["nchar", "nvarchar", "ntext"]);
const dates = new Set([
  "date",
  "datetime",
  "datetime2",
  "datetimeoffset",
  "smalldatetime",
]);
const times = new Set(["time"]);
const binaries = new Set([
  "binary",
  "varbinary",
  "image",
  "timestamp",
  "rowversion",
]);

const familyOf = (name: string): SqlTypeFamily => {
  if (integers.has(name)) return "integer";
  if (decimals.has(name)) return "decimal";
  if (floating.has(name)) return "floatingPoint";
  if (strings.has(name)) return "string";
  if (unicodeStrings.has(name)) return "unicodeString";
  if (dates.has(name)) return "dateTime";
  if (times.has(name)) return "time";
  if (binaries.has(name)) return "binary";
  if (name === "bit") return "boolean";
  if (name === "uniqueidentifier") return "guid";
  if (name === "xml") return "xml";
  if (name === "sql_variant") return "variant";
  return "unknown";
};

export function describeSqlType(type?: SqlType): SqlTypeDescriptor {
  if (!type?.name || type.name.toLowerCase() === "unknown")
    return UNKNOWN_SQL_TYPE;
  const cached = descriptorCache.get(type);
  if (cached) return cached;
  const normalizedName = type.name.toLocaleLowerCase("en-US");
  const userDefined = type.userDefined === true;
  const descriptor: SqlTypeDescriptor = Object.freeze({
    kind: "known",
    sqlName: type.name,
    normalizedName,
    family: userDefined ? "userDefined" : familyOf(normalizedName),
    ...(type.schema ? { schema: type.schema } : {}),
    ...(type.maxLength !== undefined ? { length: type.maxLength } : {}),
    ...(type.precision !== undefined ? { precision: type.precision } : {}),
    ...(type.scale !== undefined ? { scale: type.scale } : {}),
    userDefined,
    ...(userDefined
      ? { userDefinedTypeName: `${type.schema ?? "dbo"}.${type.name}` }
      : {}),
    ...(type.underlyingSystemType
      ? { underlyingSystemType: type.underlyingSystemType }
      : {}),
  });
  descriptorCache.set(type, descriptor);
  return descriptor;
}

const exactFacets = (
  left: SqlTypeDescriptor,
  right: SqlTypeDescriptor,
): boolean =>
  left.length === right.length &&
  left.precision === right.precision &&
  left.scale === right.scale;

const compatibleFamily = (
  left: SqlTypeFamily,
  right: SqlTypeFamily,
): boolean => {
  const numeric = new Set(["integer", "decimal", "floatingPoint"]);
  const text = new Set(["string", "unicodeString"]);
  const temporal = new Set(["dateTime", "time"]);
  return (
    (numeric.has(left) && numeric.has(right)) ||
    (text.has(left) && text.has(right)) ||
    (temporal.has(left) && temporal.has(right))
  );
};

export function compareSqlTypes(
  expected: SqlTypeDescriptor,
  actual: SqlTypeDescriptor,
): TypeCompatibility {
  if (expected.kind === "unknown" || actual.kind === "unknown")
    return "unknown";
  if (expected.userDefined || actual.userDefined) {
    if (
      expected.userDefined &&
      actual.userDefined &&
      expected.userDefinedTypeName?.toLowerCase() ===
        actual.userDefinedTypeName?.toLowerCase()
    )
      return exactFacets(expected, actual) ? "exact" : "sameBaseType";
    if (expected.underlyingSystemType && actual.underlyingSystemType)
      return compareSqlTypes(
        describeSqlType({ name: expected.underlyingSystemType }),
        describeSqlType({ name: actual.underlyingSystemType }),
      );
    return "unknown";
  }
  if (expected.normalizedName === actual.normalizedName)
    return exactFacets(expected, actual) ? "exact" : "sameBaseType";
  return compatibleFamily(expected.family, actual.family)
    ? "compatibleFamily"
    : "incompatible";
}

export function descriptorToSqlType(
  descriptor: SqlTypeDescriptor,
): SqlType | undefined {
  if (descriptor.kind === "unknown") return undefined;
  return {
    name: descriptor.sqlName,
    ...(descriptor.schema ? { schema: descriptor.schema } : {}),
    ...(descriptor.length !== undefined
      ? { maxLength: descriptor.length }
      : {}),
    ...(descriptor.precision !== undefined
      ? { precision: descriptor.precision }
      : {}),
    ...(descriptor.scale !== undefined ? { scale: descriptor.scale } : {}),
    ...(descriptor.userDefined ? { userDefined: true } : {}),
    ...(descriptor.underlyingSystemType
      ? { underlyingSystemType: descriptor.underlyingSystemType }
      : {}),
  };
}
