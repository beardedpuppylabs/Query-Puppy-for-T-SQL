import type { SqlType } from "./MetadataModels.js";
import type { SqlTypeDescriptor } from "./SqlTypeDescriptor.js";

const LENGTH_TYPES = new Set([
  "binary",
  "char",
  "nchar",
  "nvarchar",
  "varbinary",
  "varchar",
]);
const PRECISION_TYPES = new Set(["decimal", "numeric"]);
const SCALE_TYPES = new Set(["datetime2", "datetimeoffset", "time"]);

export function formatSqlType(type: SqlType): string {
  const name =
    type.userDefined && type.schema
      ? `${quoteIdentifier(type.schema)}.${quoteIdentifier(type.name)}`
      : type.name;
  const normalized = type.name.toLowerCase();
  if (LENGTH_TYPES.has(normalized) && type.maxLength !== undefined) {
    if (type.maxLength === -1) return `${name}(max)`;
    const length = normalized.startsWith("n")
      ? type.maxLength / 2
      : type.maxLength;
    return `${name}(${String(length)})`;
  }
  if (
    PRECISION_TYPES.has(normalized) &&
    type.precision !== undefined &&
    type.scale !== undefined
  ) {
    return `${name}(${String(type.precision)},${String(type.scale)})`;
  }
  if (SCALE_TYPES.has(normalized) && type.scale !== undefined)
    return `${name}(${String(type.scale)})`;
  return name;
}

/** Formats normalized inference metadata using SQL declaration syntax only. */
export function formatSqlTypeDescriptorForDisplay(
  descriptor: SqlTypeDescriptor,
): string {
  const normalized = descriptor.normalizedName;
  return formatSqlType({
    name: descriptor.sqlName,
    ...(descriptor.schema ? { schema: descriptor.schema } : {}),
    ...(LENGTH_TYPES.has(normalized) && descriptor.length !== undefined
      ? { maxLength: descriptor.length }
      : {}),
    ...(PRECISION_TYPES.has(normalized) &&
    descriptor.precision !== undefined &&
    descriptor.scale !== undefined
      ? { precision: descriptor.precision, scale: descriptor.scale }
      : {}),
    ...(SCALE_TYPES.has(normalized) && descriptor.scale !== undefined
      ? { scale: descriptor.scale }
      : {}),
    ...(descriptor.userDefined ? { userDefined: true } : {}),
  });
}

export function quoteIdentifier(name: string): string {
  return /^(?:#{1,2}|@)?[A-Za-z_][A-Za-z0-9_@$#]*$/.test(name)
    ? name
    : `[${name.replaceAll("]", "]]")}]`;
}

/** Database names are always delimited because they are interpolated into USE. */
export function quoteDatabaseIdentifier(name: string): string {
  if (!name || name.includes("\u0000"))
    throw new Error("Invalid active database name.");
  return `[${name.replaceAll("]", "]]")}]`;
}
