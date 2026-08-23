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
  readonly kind: "known" | "unknown" | "family";
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
  readonly acceptedFamilies?: readonly SqlTypeFamily[];
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

export function describeSqlTypeFamilies(
  families: readonly SqlTypeFamily[],
): SqlTypeDescriptor {
  const unique = [...new Set(families)];
  const label = unique.every((family) =>
    ["integer", "decimal", "floatingPoint", "boolean"].includes(family),
  )
    ? "numeric"
    : unique.every((family) => ["string", "unicodeString"].includes(family))
      ? "string"
      : unique.every((family) => ["dateTime", "time"].includes(family))
        ? "date/time"
        : unique.join("/");
  return Object.freeze({
    kind: "family",
    sqlName: label,
    normalizedName: label,
    family: unique[0] ?? "unknown",
    acceptedFamilies: unique,
    userDefined: false,
  });
}

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
  if (expected.kind === "family")
    return expected.acceptedFamilies?.includes(actual.family)
      ? "compatibleFamily"
      : actual.kind === "unknown"
        ? "unknown"
        : "incompatible";
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
  if (descriptor.kind !== "known") return undefined;
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

// SQL Server chooses the highest-precedence result type for CASE and COALESCE.
// Keep the table centralized so expression inference does not grow a second
// compatibility model. Unknown and family-only descriptors are not guessable.
const typePrecedence = new Map(
  [
    "sql_variant",
    "xml",
    "datetimeoffset",
    "datetime2",
    "datetime",
    "smalldatetime",
    "date",
    "time",
    "float",
    "real",
    "decimal",
    "numeric",
    "money",
    "smallmoney",
    "bigint",
    "int",
    "smallint",
    "tinyint",
    "bit",
    "ntext",
    "text",
    "image",
    "timestamp",
    "rowversion",
    "uniqueidentifier",
    "nvarchar",
    "nchar",
    "varchar",
    "char",
    "varbinary",
    "binary",
  ].map((name, index) => [name, index]),
);

const widestFacet = (
  values: readonly (number | undefined)[],
): number | undefined => {
  const present = values.filter(
    (value): value is number => value !== undefined,
  );
  if (!present.length) return undefined;
  return present.includes(-1) ? -1 : Math.max(...present);
};

const mergeSameBaseType = (
  values: readonly SqlTypeDescriptor[],
): SqlTypeDescriptor => {
  const first = values[0];
  if (!first) return UNKNOWN_SQL_TYPE;
  const type = descriptorToSqlType(first);
  if (!type) return UNKNOWN_SQL_TYPE;
  const length = widestFacet(values.map((value) => value.length));
  const precision = widestFacet(values.map((value) => value.precision));
  const scale = widestFacet(values.map((value) => value.scale));
  return describeSqlType({
    ...type,
    ...(length !== undefined ? { maxLength: length } : {}),
    ...(precision !== undefined ? { precision } : {}),
    ...(scale !== undefined ? { scale } : {}),
  });
};

/** Reconciles known expression types using SQL Server data-type precedence. */
export function reconcileSqlTypesByPrecedence(
  types: readonly SqlTypeDescriptor[],
): SqlTypeDescriptor {
  const known = types.filter(
    (type): type is SqlTypeDescriptor & { readonly kind: "known" } =>
      type.kind === "known",
  );
  if (!known.length) return UNKNOWN_SQL_TYPE;
  if (known.some((type) => type.userDefined)) {
    const firstUserDefined = known.find((type) => type.userDefined);
    return firstUserDefined &&
      known
        .filter((type) => type.userDefined)
        .every(
          (type) =>
            type.userDefinedTypeName?.toLowerCase() ===
            firstUserDefined.userDefinedTypeName?.toLowerCase(),
        )
      ? firstUserDefined
      : UNKNOWN_SQL_TYPE;
  }
  const selected = [...known].sort(
    (left, right) =>
      (typePrecedence.get(left.normalizedName) ?? Number.MAX_SAFE_INTEGER) -
      (typePrecedence.get(right.normalizedName) ?? Number.MAX_SAFE_INTEGER),
  )[0];
  if (!selected || !typePrecedence.has(selected.normalizedName))
    return UNKNOWN_SQL_TYPE;
  const sameBase = known.filter(
    (type) => type.normalizedName === selected.normalizedName,
  );
  return mergeSameBaseType(sameBase);
}
