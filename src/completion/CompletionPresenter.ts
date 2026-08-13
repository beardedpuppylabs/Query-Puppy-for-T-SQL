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
): vscode.CompletionItem {
  const model = presentationModel(candidate, mixed);
  const label: vscode.CompletionItemLabel = {
    label: candidate.name,
    ...(model.detail ? { detail: model.detail } : {}),
    ...(model.description ? { description: model.description } : {}),
  };
  const item = new vscode.CompletionItem(label, kinds[candidate.kind]);
  item.range = replacement;
  item.insertText = candidate.insertText ?? quoteIdentifier(candidate.name);
  // VS Code filters the replacement prefix against filterText. Prefixing with the user's
  // fragment preserves every contains match without changing insertion or ranking.
  item.filterText = search ? `${search} ${candidate.name}` : candidate.name;
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
  if (candidate.sourceObject)
    md.appendMarkdown(
      `**${candidate.database ? `${candidate.database}.` : ""}${candidate.sourceObject.schema}.${candidate.sourceObject.name}**\n\n`,
    );
  else if (candidate.database)
    md.appendMarkdown(`Database: **${candidate.database}**\n\n`);
  md.appendMarkdown(`${friendlyKind(candidate.kind)}\n\n`);
  if (candidate.sqlType)
    md.appendMarkdown(
      `Type: \`${formatSqlType(candidate.sqlType)}\`  \nNullability: **${candidate.nullable ? "NULL" : "NOT NULL"}**\n`,
    );
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
