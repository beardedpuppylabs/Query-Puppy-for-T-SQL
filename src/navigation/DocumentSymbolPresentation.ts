import { formatSqlType } from "../metadata/SqlTypeFormatter.js";
import type { DocumentSemanticSymbol } from "../parser/DocumentSemanticSymbols.js";

export const LOCAL_VARIABLE_INITIALIZER_PREVIEW_LIMIT = 80;

const boundedInitializerPreview = (source: string): string | undefined => {
  if (source.includes("\n") || source.includes("\r")) return undefined;
  const characters = Array.from(source);
  return characters.length <= LOCAL_VARIABLE_INITIALIZER_PREVIEW_LIMIT
    ? source
    : `${characters
        .slice(0, LOCAL_VARIABLE_INITIALIZER_PREVIEW_LIMIT - 1)
        .join("")}…`;
};

export function localVariableDocumentSymbolDetail(
  symbol: DocumentSemanticSymbol,
  sql: string,
): string {
  const detail = `Local variable${symbol.sqlType ? ` ${formatSqlType(symbol.sqlType)}` : ""}`;
  if (!symbol.initializer) return detail;
  const initializer = boundedInitializerPreview(
    sql.slice(symbol.initializer.start, symbol.initializer.end),
  );
  return initializer ? `${detail} = ${initializer}` : detail;
}
