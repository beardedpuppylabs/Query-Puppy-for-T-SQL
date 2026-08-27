import type {
  MetadataCellValue,
  MetadataQueryResult,
} from "../backend/MetadataBackend.js";

export function validateSimpleExecuteResult(
  value: unknown,
): MetadataQueryResult {
  if (typeof value !== "object" || value === null)
    throw new Error("mssql executeSimpleQuery returned a non-object result.");
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result["rows"]))
    throw new Error(
      `mssql executeSimpleQuery result has no rows array (keys: ${Object.keys(result).join(", ") || "none"}).`,
    );
  const rows: MetadataCellValue[][] = result["rows"].map(
    (rawRow: unknown, rowIndex: number) => {
      if (!Array.isArray(rawRow))
        throw new Error(`mssql query row ${String(rowIndex)} is not an array.`);
      return rawRow.map((rawCell: unknown, columnIndex: number) => {
        if (typeof rawCell !== "object" || rawCell === null)
          throw new Error(
            `mssql query cell ${String(rowIndex)}:${String(columnIndex)} has an unsupported shape.`,
          );
        const cell = rawCell as Record<string, unknown>;
        if (typeof cell["isNull"] !== "boolean")
          throw new Error(
            `mssql query cell ${String(rowIndex)}:${String(columnIndex)} has no boolean isNull field.`,
          );
        const displayValue = cell["displayValue"];
        if (!cell["isNull"] && typeof displayValue !== "string")
          throw new Error(
            `mssql query cell ${String(rowIndex)}:${String(columnIndex)} has no string displayValue field.`,
          );
        return {
          isNull: cell["isNull"],
          displayValue: typeof displayValue === "string" ? displayValue : "",
        };
      });
    },
  );
  const rowCount = result["rowCount"];
  if (typeof rowCount !== "number")
    throw new Error("mssql executeSimpleQuery result has no numeric rowCount.");
  if (rowCount > 0 && rows.length === 0)
    throw new Error(
      `mssql reported ${String(rowCount)} rows but returned an empty rows array.`,
    );
  return { rowCount, rows };
}
