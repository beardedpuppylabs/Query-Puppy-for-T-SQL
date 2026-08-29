import * as vscode from "vscode";
import {
  formatSqlType,
  quoteIdentifier,
} from "../metadata/SqlTypeFormatter.js";
import {
  friendlyKind,
  type SqlObjectKind,
} from "../metadata/MetadataModels.js";
import {
  isDeclaredForeignKeyRelationship,
  RelationshipProvenance,
} from "../relationships/RelationshipModels.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";
import { completionSortText } from "./CompletionSorter.js";
import {
  presentationModel,
  physicalColumnDisplayRow,
  formatColumnRoles,
  visibleCandidateName,
} from "./PresentationModel.js";
import { callableParameterLabel } from "../parser/CallableAnalyzer.js";

const kinds: Record<SqlObjectKind, vscode.CompletionItemKind> = {
  database: vscode.CompletionItemKind.Module,
  schema: vscode.CompletionItemKind.Module,
  table: vscode.CompletionItemKind.Class,
  view: vscode.CompletionItemKind.Interface,
  procedure: vscode.CompletionItemKind.Method,
  scalarFunction: vscode.CompletionItemKind.Function,
  builtinFunction: vscode.CompletionItemKind.Function,
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
  separatorCharacter?: string,
): vscode.CompletionItem {
  const model = presentationModel(candidate, mixed);
  const physical = createPhysicalColumnCompletionItem(
    candidate,
    replacement,
    search,
    rank,
  );
  if (physical) return physical;
  const label: vscode.CompletionItemLabel = {
    label: visibleCandidateName(candidate),
    ...(model.detail ? { detail: model.detail } : {}),
    ...(model.description ? { description: model.description } : {}),
  };
  const item = new vscode.CompletionItem(label, kinds[candidate.kind]);
  configureCandidateItem(item, candidate, replacement, search, rank);
  if (candidate.documentation) item.documentation = candidate.documentation;
  if (candidate.kind === "joinPredicate" && separatorCharacter)
    item.additionalTextEdits = [
      vscode.TextEdit.replace(
        new vscode.Range(replacement.start.translate(0, -1), replacement.start),
        `${separatorCharacter} `,
      ),
    ];
  return item;
}

export function createPhysicalColumnCompletionItem(
  candidate: CompletionCandidate,
  replacement: vscode.Range,
  search: string,
  rank: number,
): vscode.CompletionItem | undefined {
  const row = physicalColumnDisplayRow(candidate);
  if (!row) return undefined;
  const item = new vscode.CompletionItem(row, vscode.CompletionItemKind.Field);
  configureCandidateItem(item, candidate, replacement, search, rank);
  return item;
}

function configureCandidateItem(
  item: vscode.CompletionItem,
  candidate: CompletionCandidate,
  replacement: vscode.Range,
  search: string,
  rank: number,
): void {
  (item as vscode.CompletionItem & { data?: unknown }).data = {
    provider: "query-puppy-for-t-sql",
    semanticKind: candidate.kind,
  };
  item.range = replacement;
  item.insertText = candidate.insertText ?? quoteIdentifier(candidate.name);
  // Physical column identity stays exact; semantic contains matching has already selected
  // the candidate set. Other candidate kinds retain the prefix compatibility workaround.
  item.filterText =
    candidate.kind === "column"
      ? candidate.name
      : search
        ? `${search} ${candidate.name}`
        : candidate.name;
  item.sortText = completionSortText(rank);
  item.documentation = documentation(candidate);
  if (candidate.triggerSuggest)
    item.command = {
      command: "editor.action.triggerSuggest",
      title: "Suggest schema objects",
    };
  else if (candidate.triggerAliasSuggest)
    item.command = {
      command: "queryPuppyForTSql.triggerAliasSuggest",
      title: "Suggest row-source alias",
    };
}

export function documentation(
  candidate: CompletionCandidate,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.supportHtml = false;
  if (
    candidate.relationship &&
    isDeclaredForeignKeyRelationship(candidate.relationship)
  ) {
    const relationship = candidate.relationship;
    const foreignKey = relationship.declaredForeignKey;
    md.appendMarkdown(`**${foreignKey.constraintName}**\n\n`);
    md.appendMarkdown(
      `Foreign key: \`${relationship.source.schema}.${relationship.source.objectName} (${relationship.mappings.map((mapping) => mapping.sourceColumnName).join(", ")})\`  \n→ \`${relationship.target.schema}.${relationship.target.objectName} (${relationship.mappings.map((mapping) => mapping.targetColumnName).join(", ")})\`\n`,
    );
    return md;
  }
  if (candidate.relationship) {
    const relationship = candidate.relationship;
    if (relationship.provenance === RelationshipProvenance.LearnedFromQuery) {
      md.appendMarkdown("**Learned relationship**\n\n");
      md.appendMarkdown(
        `Relationship: \`${relationship.source.database}.${relationship.source.schema}.${relationship.source.objectName}\`  \n→ \`${relationship.target.database}.${relationship.target.schema}.${relationship.target.objectName}\`\n\nMappings:\n${relationship.mappings.map((mapping) => `- \`${mapping.sourceColumnName}\` → \`${mapping.targetColumnName}\``).join("\n")}\n\nProvenance: learned from repeated JOIN usage.  \nObserved in **${String(relationship.observationCount)}** resolved JOIN occurrences.  \nConfidence: **StrongEvidence**.\n\nThis is learned Query Puppy relationship evidence, not a SQL Server foreign key.\n`,
      );
      return md;
    }
    const userConfirmed =
      relationship.provenance === RelationshipProvenance.UserConfirmed;
    md.appendMarkdown(
      `**${userConfirmed ? "User-confirmed relationship" : "Project-defined relationship"}**\n\n`,
    );
    md.appendMarkdown(
      `${userConfirmed ? "Explicitly saved from a resolved JOIN" : "Project relationship"}: \`${relationship.source.database}.${relationship.source.schema}.${relationship.source.objectName} (${relationship.mappings.map((mapping) => mapping.sourceColumnName).join(", ")})\`  \n→ \`${relationship.target.database}.${relationship.target.schema}.${relationship.target.objectName} (${relationship.mappings.map((mapping) => mapping.targetColumnName).join(", ")})\`\n\nDefined in \`.query-puppy/relationships.json\`. This is not a SQL Server foreign key.\n`,
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
    if (candidate.kind === "column")
      appendPhysicalColumnDocumentation(md, candidate);
    else
      md.appendMarkdown(
        `Type: \`${formatSqlType(candidate.sqlType)}\`  \nNullability: **${candidate.nullable ? "NULL" : "NOT NULL"}**${formatColumnRoles(candidate.keyRoles) ? `  \nRoles: **${formatColumnRoles(candidate.keyRoles).replaceAll("·", " · ")}**` : ""}\n`,
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
  for (const relationship of candidate.relationships ?? []) {
    if (!isDeclaredForeignKeyRelationship(relationship)) continue;
    const foreignKey = relationship.declaredForeignKey;
    const outgoing =
      relationship.source.objectId === candidate.sourceObject?.id;
    const mappings = relationship.mappings.map((mapping) =>
      outgoing
        ? `${mapping.sourceColumnName} → ${relationship.target.schema}.${relationship.target.objectName}.${mapping.targetColumnName}`
        : `${relationship.source.schema}.${relationship.source.objectName}.${mapping.sourceColumnName} → ${mapping.targetColumnName}`,
    );
    md.appendMarkdown(
      `\n${outgoing ? "Foreign key" : "Referenced by"}: **${foreignKey.constraintName}**  \n${mappings.map((mapping) => `- \`${mapping}\``).join("\n")}  \nActions: ON DELETE ${foreignKey.deleteAction}; ON UPDATE ${foreignKey.updateAction}${foreignKey.disabled ? "; disabled" : ""}${foreignKey.notTrusted ? "; not trusted" : ""}\n`,
    );
  }
  if (candidate.parameters?.length) {
    md.appendMarkdown("Parameters:\n");
    for (const parameter of candidate.parameters)
      md.appendMarkdown(`- \`${callableParameterLabel(parameter)}\`\n`);
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

function appendPhysicalColumnDocumentation(
  markdown: vscode.MarkdownString,
  candidate: CompletionCandidate,
): void {
  if (!candidate.sqlType) return;
  const roles = formatColumnRoles(candidate.keyRoles);
  markdown.appendMarkdown(
    `**Column**\n\n${wrapIdentifierForDocumentation(candidate.name)}\n\n**Type:** \`${formatSqlType(candidate.sqlType)}\`\n\n**Nullability:** \`${candidate.nullable ? "NULL" : "NOT NULL"}\`\n\n**Roles:** ${roles ? roles.replaceAll("·", " · ") : "none"}\n`,
  );
}

export function wrapIdentifierForDocumentation(
  identifier: string,
  maxLineLength = 40,
): string {
  if (identifier.length <= maxLineLength) return identifier;
  const parts = identifier.match(
    /[A-Z]+(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|\d+|[^A-Za-z\d]+/g,
  ) ?? [identifier];
  const lines: string[] = [];
  let line = "";
  for (let part of parts) {
    if (line && line.length + part.length > maxLineLength) {
      lines.push(line);
      line = "";
    }
    while (part.length > maxLineLength) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(part.slice(0, maxLineLength));
      part = part.slice(maxLineLength);
    }
    line += part;
  }
  if (line) lines.push(line);
  return lines.join("  \n");
}
