import * as vscode from "vscode";
import {
  formatSqlType,
  quoteIdentifier,
} from "../metadata/SqlTypeFormatter.js";
import {
  friendlyKind,
  type SqlObjectKind,
} from "../metadata/MetadataModels.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";
import { presentationModel } from "./PresentationModel.js";
import type { ColumnPresentationLayout } from "./PresentationModel.js";

const kinds: Record<SqlObjectKind, vscode.CompletionItemKind> = {
  database: vscode.CompletionItemKind.Module,
  schema: vscode.CompletionItemKind.Module,
  table: vscode.CompletionItemKind.Class,
  view: vscode.CompletionItemKind.Interface,
  procedure: vscode.CompletionItemKind.Method,
  scalarFunction: vscode.CompletionItemKind.Function,
  tableValuedFunction: vscode.CompletionItemKind.Function,
  synonym: vscode.CompletionItemKind.Reference,
  sequence: vscode.CompletionItemKind.Value,
  userType: vscode.CompletionItemKind.TypeParameter,
  column: vscode.CompletionItemKind.Field,
  joinPredicate: vscode.CompletionItemKind.Operator,
  rowSourceAlias: vscode.CompletionItemKind.Reference,
  procedureParameter: vscode.CompletionItemKind.Variable,
  cte: vscode.CompletionItemKind.Struct,
  variable: vscode.CompletionItemKind.Variable,
  tableVariable: vscode.CompletionItemKind.Variable,
  tempTable: vscode.CompletionItemKind.Struct,
  derivedTable: vscode.CompletionItemKind.Struct,
  values: vscode.CompletionItemKind.Struct,
  inserted: vscode.CompletionItemKind.Struct,
  deleted: vscode.CompletionItemKind.Struct,
  keyword: vscode.CompletionItemKind.Keyword,
};
export function presentCandidate(
  candidate: CompletionCandidate,
  replacement: vscode.Range,
  search: string,
  mixed: boolean,
  rank: number,
  columnLayout?: ColumnPresentationLayout,
  separatorCharacter?: string,
): vscode.CompletionItem {
  const model = presentationModel(candidate, mixed, columnLayout);
  const label: vscode.CompletionItemLabel = {
    label: candidate.name,
    ...(model.detail ? { detail: model.detail } : {}),
    ...(model.description ? { description: model.description } : {}),
  };
  const item = new vscode.CompletionItem(label, kinds[candidate.kind]);
  (item as vscode.CompletionItem & { data?: unknown }).data = {
    provider: "improved-sql-intellisense",
    semanticKind: candidate.kind,
  };
  item.range = replacement;
  item.insertText = candidate.insertText ?? quoteIdentifier(candidate.name);
  if (candidate.kind === "joinPredicate" && separatorCharacter)
    item.additionalTextEdits = [
      vscode.TextEdit.replace(
        new vscode.Range(replacement.start.translate(0, -1), replacement.start),
        `${separatorCharacter} `,
      ),
    ];
  // Physical column identity stays exact; semantic contains matching has already selected
  // the candidate set. Other candidate kinds retain the prefix compatibility workaround.
  item.filterText =
    candidate.kind === "column"
      ? candidate.name
      : search
        ? `${search} ${candidate.name}`
        : candidate.name;
  item.sortText = rank.toString().padStart(8, "0");
  item.documentation = documentation(candidate);
  if (candidate.triggerSuggest)
    item.command = {
      command: "editor.action.triggerSuggest",
      title: "Suggest schema objects",
    };
  else if (candidate.triggerAliasSuggest)
    item.command = {
      command: "improvedSqlIntellisense.triggerAliasSuggest",
      title: "Suggest row-source alias",
    };
  return item;
}

export function documentation(
  candidate: CompletionCandidate,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.supportHtml = false;
  if (candidate.foreignKey) {
    const foreignKey = candidate.foreignKey;
    md.appendMarkdown(`**${foreignKey.name}**\n\n`);
    md.appendMarkdown(
      `Foreign key: \`${foreignKey.parentSchema}.${foreignKey.parentObjectName} (${foreignKey.columns.map((column) => column.parentColumnName).join(", ")})\`  \n→ \`${foreignKey.referencedSchema}.${foreignKey.referencedObjectName} (${foreignKey.columns.map((column) => column.referencedColumnName).join(", ")})\`\n`,
    );
    return md;
  }
  if (candidate.sourceObject)
    md.appendMarkdown(
      `**${candidate.database ? `${candidate.database}.` : ""}${candidate.sourceObject.schema}.${candidate.sourceObject.name}**\n\n`,
    );
  else if (candidate.database)
    md.appendMarkdown(`Database: **${candidate.database}**\n\n`);
  md.appendMarkdown(`${friendlyKind(candidate.kind)}\n\n`);
  if (candidate.sqlType)
    md.appendMarkdown(
      `Type: \`${formatSqlType(candidate.sqlType)}\`  \nNullability: **${candidate.nullable ? "NULL" : "NOT NULL"}**${candidate.keyRoles?.length ? `  \nRoles: **${candidate.keyRoles.join(" · ")}**` : ""}\n`,
    );
  for (const key of candidate.keys ?? []) {
    const label =
      key.kind === "primaryKey"
        ? "Primary key"
        : key.kind === "uniqueConstraint"
          ? "Unique constraint"
          : "Unique index";
    md.appendMarkdown(
      `\n${label}: **${key.name}** (${key.columns.map((column) => `\`${column.columnName}\``).join(", ")})${key.filtered ? `  \nFilter: \`${key.filterDefinition ?? "filtered"}\`` : ""}\n`,
    );
  }
  for (const foreignKey of candidate.foreignKeys ?? []) {
    const outgoing = foreignKey.parentObjectId === candidate.sourceObject?.id;
    const mappings = foreignKey.columns.map((column) =>
      outgoing
        ? `${column.parentColumnName} → ${foreignKey.referencedSchema}.${foreignKey.referencedObjectName}.${column.referencedColumnName}`
        : `${foreignKey.parentSchema}.${foreignKey.parentObjectName}.${column.parentColumnName} → ${column.referencedColumnName}`,
    );
    md.appendMarkdown(
      `\n${outgoing ? "Foreign key" : "Referenced by"}: **${foreignKey.name}**  \n${mappings.map((mapping) => `- \`${mapping}\``).join("\n")}  \nActions: ON DELETE ${foreignKey.deleteAction}; ON UPDATE ${foreignKey.updateAction}${foreignKey.disabled ? "; disabled" : ""}${foreignKey.notTrusted ? "; not trusted" : ""}\n`,
    );
  }
  if (candidate.parameters?.length) {
    md.appendMarkdown("Parameters:\n");
    for (const parameter of candidate.parameters)
      md.appendMarkdown(
        `- \`${parameter.name} ${formatSqlType(parameter.type)}${parameter.output ? " OUTPUT" : ""}\`\n`,
      );
  }
  if (candidate.returnType)
    md.appendMarkdown(
      `\nReturns: \`${formatSqlType(candidate.returnType)}\`\n`,
    );
  if (candidate.kind === "procedure")
    md.appendMarkdown("\nReturn status: `int`\n");
  if (candidate.baseObjectName)
    md.appendMarkdown(`\nBase object: \`${candidate.baseObjectName}\`\n`);
  return md;
}
