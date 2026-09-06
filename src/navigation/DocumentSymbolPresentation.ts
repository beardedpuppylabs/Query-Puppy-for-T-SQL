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

export function localVariableInitializerPreview(
  symbol: DocumentSemanticSymbol,
  sql: string,
): string | undefined {
  if (!symbol.initializer) return undefined;
  return boundedInitializerPreview(
    sql.slice(symbol.initializer.start, symbol.initializer.end),
  );
}

const localVariableDescriptionSuffix = (
  symbol: DocumentSemanticSymbol,
  sql: string,
): string => {
  const type = symbol.sqlType ? ` ${formatSqlType(symbol.sqlType)}` : "";
  const initializer = localVariableInitializerPreview(symbol, sql);
  return `${type}${initializer ? ` = ${initializer}` : ""}`;
};

export function localVariableSemanticDescription(
  symbol: DocumentSemanticSymbol,
  sql: string,
): string {
  return `local variable ${symbol.name}${localVariableDescriptionSuffix(symbol, sql)}`;
}

export function localVariableDocumentSymbolDetail(
  symbol: DocumentSemanticSymbol,
  sql: string,
): string {
  return `Local variable${localVariableDescriptionSuffix(symbol, sql)}`;
}
