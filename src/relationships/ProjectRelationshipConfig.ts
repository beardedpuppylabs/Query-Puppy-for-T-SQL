import { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import { normalizeName } from "../metadata/MetadataModels.js";
import {
  compareSqlTypes,
  describeSqlType,
} from "../metadata/SqlTypeDescriptor.js";
import {
  relationshipSemanticIdentity,
  RelationshipConfidence,
  RelationshipProvenance,
  type ProjectDefinedRelationship,
  type UserConfirmedRelationship,
} from "./RelationshipModels.js";

export const PROJECT_RELATIONSHIP_FORMAT_VERSION = 1;
export const PROJECT_RELATIONSHIP_FILE = ".query-puppy/relationships.json";

export interface ProjectRelationshipEndpointDefinition {
  readonly database: string;
  readonly schema: string;
  readonly object: string;
}

export interface ProjectRelationshipMappingDefinition {
  readonly source: string;
  readonly target: string;
}

export interface ProjectRelationshipDefinition {
  /** Omitted version-1 entries remain backward-compatible ProjectDefined relationships. */
  readonly provenance?: PersistedRelationshipProvenance;
  readonly source: ProjectRelationshipEndpointDefinition;
  readonly target: ProjectRelationshipEndpointDefinition;
  readonly mappings: readonly ProjectRelationshipMappingDefinition[];
}

export type PersistedRelationshipProvenance =
  | typeof RelationshipProvenance.ProjectDefined
  | typeof RelationshipProvenance.UserConfirmed;

export interface ProjectRelationshipIssue {
  readonly message: string;
  readonly relationshipIndex?: number;
}

export interface ProjectRelationshipDocument {
  readonly schema?: string;
  readonly definitions: readonly ProjectRelationshipDefinition[];
  readonly issues: readonly ProjectRelationshipIssue[];
}

export interface ResolvedProjectRelationships {
  readonly relationships: readonly ConfiguredRelationship[];
  readonly issues: readonly ProjectRelationshipIssue[];
}

export type ConfiguredRelationship =
  ProjectDefinedRelationship | UserConfirmedRelationship;

export type ProjectRelationshipUpdateResult =
  | { readonly kind: "written"; readonly text: string }
  | { readonly kind: "duplicate" }
  | {
      readonly kind: "invalid";
      readonly issues: readonly ProjectRelationshipIssue[];
    };

type ReadProjectFile = (projectKey: string) => Promise<string | undefined>;

/** Small project-keyed cache; invalidation is driven by the workspace file watcher. */
export class ProjectRelationshipConfigurationCache {
  private readonly entries = new Map<
    string,
    Promise<ProjectRelationshipDocument>
  >();

  constructor(
    private readonly read: ReadProjectFile,
    private readonly diagnostic: (
      projectKey: string,
      message: string,
    ) => void = () => undefined,
  ) {}

  load(projectKey: string): Promise<ProjectRelationshipDocument> {
    const existing = this.entries.get(projectKey);
    if (existing) return existing;
    const pending = this.read(projectKey)
      .then((text) =>
        text === undefined
          ? { definitions: [], issues: [] }
          : parseProjectRelationshipConfiguration(text),
      )
      .catch((error: unknown) => ({
        definitions: [],
        issues: [
          {
            message: `Could not read ${PROJECT_RELATIONSHIP_FILE}: ${errorMessage(error)}.`,
          },
        ],
      }))
      .then((document) => {
        for (const issue of document.issues)
          this.diagnostic(projectKey, issue.message);
        return document;
      });
    this.entries.set(projectKey, pending);
    return pending;
  }

  invalidate(projectKey: string): void {
    this.entries.delete(projectKey);
  }

  clear(): void {
    this.entries.clear();
  }
}

export function parseProjectRelationshipConfiguration(
  text: string,
): ProjectRelationshipDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      definitions: [],
      issues: [{ message: `Invalid JSON: ${errorMessage(error)}.` }],
    };
  }
  if (!record(value))
    return {
      definitions: [],
      issues: [
        { message: "The relationship file root must be a JSON object." },
      ],
    };
  const rootFields = unknownFields(value, [
    "$schema",
    "version",
    "relationships",
  ]);
  if (rootFields.length)
    return {
      definitions: [],
      issues: [{ message: `Unknown root field(s): ${rootFields.join(", ")}.` }],
    };
  if (value["$schema"] !== undefined && typeof value["$schema"] !== "string")
    return {
      definitions: [],
      issues: [{ message: "`$schema` must be a string when present." }],
    };
  if (value["version"] !== PROJECT_RELATIONSHIP_FORMAT_VERSION)
    return {
      definitions: [],
      issues: [
        {
          message: `Unsupported relationship format version ${String(value["version"])}; supported version is ${String(PROJECT_RELATIONSHIP_FORMAT_VERSION)}.`,
        },
      ],
    };
  if (!Array.isArray(value["relationships"]))
    return {
      definitions: [],
      issues: [{ message: "`relationships` must be an array." }],
    };
  const definitions: ProjectRelationshipDefinition[] = [];
  const issues: ProjectRelationshipIssue[] = [];
  for (const [index, candidate] of value["relationships"].entries()) {
    const parsed = parseDefinition(candidate, index);
    if (parsed.definition) definitions.push(parsed.definition);
    issues.push(...parsed.issues);
  }
  return {
    ...(typeof value["$schema"] === "string"
      ? { schema: value["$schema"] }
      : {}),
    definitions,
    issues,
  };
}

export function appendProjectRelationshipDefinition(
  text: string | undefined,
  definition: ProjectRelationshipDefinition,
): ProjectRelationshipUpdateResult {
  const document =
    text !== undefined
      ? parseProjectRelationshipConfiguration(text)
      : { definitions: [], issues: [] };
  if (document.issues.length)
    return { kind: "invalid", issues: document.issues };
  const identity = projectRelationshipDefinitionIdentity(definition);
  if (
    document.definitions.some(
      (existing) =>
        projectRelationshipDefinitionIdentity(existing) === identity,
    )
  )
    return { kind: "duplicate" };
  return {
    kind: "written",
    text: `${JSON.stringify(
      {
        ...(document.schema ? { $schema: document.schema } : {}),
        version: PROJECT_RELATIONSHIP_FORMAT_VERSION,
        relationships: [...document.definitions, definition],
      },
      undefined,
      2,
    )}\n`,
  };
}

export function projectRelationshipDefinitionIdentity(
  definition: ProjectRelationshipDefinition,
): string {
  const provenance =
    definition.provenance === RelationshipProvenance.UserConfirmed
      ? RelationshipProvenance.UserConfirmed
      : RelationshipProvenance.ProjectDefined;
  const relationship: ConfiguredRelationship = {
    provenance,
    confidence: RelationshipConfidence.Confirmed,
    source: {
      database: definition.source.database,
      schema: definition.source.schema,
      objectName: definition.source.object,
    },
    target: {
      database: definition.target.database,
      schema: definition.target.schema,
      objectName: definition.target.object,
    },
    mappings: definition.mappings.map((mapping, index) => ({
      sourceColumnName: mapping.source,
      targetColumnName: mapping.target,
      ordinal: index + 1,
    })),
  };
  return relationshipSemanticIdentity(relationship);
}

export function resolveProjectRelationships(
  definitions: readonly ProjectRelationshipDefinition[],
  index: DatabaseIndex,
): ResolvedProjectRelationships {
  const relationships: ConfiguredRelationship[] = [];
  const issues: ProjectRelationshipIssue[] = [];
  const seen = new Map<string, number>();
  for (const [definitionIndex, definition] of definitions.entries()) {
    const sourceDatabase = normalizeName(definition.source.database);
    const targetDatabase = normalizeName(definition.target.database);
    const currentDatabase = normalizeName(index.metadata.database);
    if (
      sourceDatabase !== currentDatabase &&
      targetDatabase !== currentDatabase
    )
      continue;
    if (sourceDatabase !== targetDatabase) {
      issues.push({
        relationshipIndex: definitionIndex,
        message:
          "Cross-database project relationships are not supported in format version 1 and were ignored.",
      });
      continue;
    }
    if (!definition.mappings.length) {
      issues.push(
        semanticIssue(definitionIndex, "mappings must not be empty."),
      );
      continue;
    }
    const source = index.findObject(
      definition.source.schema,
      definition.source.object,
    );
    const target = index.findObject(
      definition.target.schema,
      definition.target.object,
    );
    if (!source || source.kind !== "table") {
      issues.push(
        semanticIssue(
          definitionIndex,
          `Source table ${qualified(definition.source)} was not found.`,
        ),
      );
      continue;
    }
    if (!target || target.kind !== "table") {
      issues.push(
        semanticIssue(
          definitionIndex,
          `Target table ${qualified(definition.target)} was not found.`,
        ),
      );
      continue;
    }
    const sourceColumns = new Set<string>();
    const targetColumns = new Set<string>();
    const mappings: ConfiguredRelationship["mappings"][number][] = [];
    let valid = true;
    for (const [mappingIndex, mapping] of definition.mappings.entries()) {
      const sourceColumn = source.columns.find(
        (column) => column.normalizedName === normalizeName(mapping.source),
      );
      const targetColumn = target.columns.find(
        (column) => column.normalizedName === normalizeName(mapping.target),
      );
      if (!sourceColumn) {
        issues.push(
          semanticIssue(
            definitionIndex,
            `Source column ${qualified(definition.source)}.${mapping.source} was not found.`,
          ),
        );
        valid = false;
        continue;
      }
      if (!targetColumn) {
        issues.push(
          semanticIssue(
            definitionIndex,
            `Target column ${qualified(definition.target)}.${mapping.target} was not found.`,
          ),
        );
        valid = false;
        continue;
      }
      if (
        sourceColumns.has(sourceColumn.normalizedName) ||
        targetColumns.has(targetColumn.normalizedName)
      ) {
        issues.push(
          semanticIssue(
            definitionIndex,
            `Mapping ${String(mappingIndex + 1)} repeats a source or target column.`,
          ),
        );
        valid = false;
        continue;
      }
      sourceColumns.add(sourceColumn.normalizedName);
      targetColumns.add(targetColumn.normalizedName);
      const compatibility = compareSqlTypes(
        describeSqlType(sourceColumn.type),
        describeSqlType(targetColumn.type),
      );
      if (compatibility === "incompatible") {
        issues.push(
          semanticIssue(
            definitionIndex,
            `Mapping ${sourceColumn.name} -> ${targetColumn.name} has incompatible SQL types.`,
          ),
        );
        valid = false;
        continue;
      }
      mappings.push({
        sourceColumnName: sourceColumn.name,
        targetColumnName: targetColumn.name,
        ordinal: mappingIndex + 1,
        sourceColumnId: sourceColumn.ordinal,
        targetColumnId: targetColumn.ordinal,
      });
    }
    if (!valid) continue;
    if (
      source.id === target.id &&
      mappings.every(
        (mapping) =>
          normalizeName(mapping.sourceColumnName) ===
          normalizeName(mapping.targetColumnName),
      )
    ) {
      issues.push(
        semanticIssue(
          definitionIndex,
          "A self-relationship must not map every column to itself.",
        ),
      );
      continue;
    }
    const provenance =
      definition.provenance === RelationshipProvenance.UserConfirmed
        ? RelationshipProvenance.UserConfirmed
        : RelationshipProvenance.ProjectDefined;
    const relationship = {
      provenance,
      confidence: RelationshipConfidence.Confirmed,
      source: {
        database: index.metadata.database,
        schema: source.schema,
        objectName: source.name,
        ...(source.id === undefined ? {} : { objectId: source.id }),
      },
      target: {
        database: index.metadata.database,
        schema: target.schema,
        objectName: target.name,
        ...(target.id === undefined ? {} : { objectId: target.id }),
      },
      mappings,
    } as ConfiguredRelationship;
    const identity = relationshipSemanticIdentity(relationship);
    const duplicateIndex = seen.get(identity);
    if (duplicateIndex !== undefined) {
      const existing = relationships[duplicateIndex];
      if (
        existing?.provenance === RelationshipProvenance.ProjectDefined &&
        relationship.provenance === RelationshipProvenance.UserConfirmed
      )
        relationships[duplicateIndex] = relationship;
      issues.push(
        semanticIssue(
          definitionIndex,
          "Duplicate project relationship was ignored.",
        ),
      );
      continue;
    }
    seen.set(identity, relationships.length);
    relationships.push(relationship);
  }
  return { relationships, issues };
}

function parseDefinition(
  value: unknown,
  index: number,
): {
  readonly definition?: ProjectRelationshipDefinition;
  readonly issues: readonly ProjectRelationshipIssue[];
} {
  if (!record(value)) return invalid(index, "Relationship must be an object.");
  const fields = unknownFields(value, [
    "provenance",
    "source",
    "target",
    "mappings",
  ]);
  if (fields.length)
    return invalid(index, `Unknown field(s): ${fields.join(", ")}.`);
  const provenance = parseProvenance(value["provenance"], index);
  const source = parseEndpoint(value["source"], "source", index);
  const target = parseEndpoint(value["target"], "target", index);
  const mappings = parseMappings(value["mappings"], index);
  const issues = [
    ...provenance.issues,
    ...source.issues,
    ...target.issues,
    ...mappings.issues,
  ];
  if (
    provenance.invalid ||
    !source.endpoint ||
    !target.endpoint ||
    !mappings.mappings
  )
    return { issues };
  return {
    definition: {
      ...(provenance.value ? { provenance: provenance.value } : {}),
      source: source.endpoint,
      target: target.endpoint,
      mappings: mappings.mappings,
    },
    issues,
  };
}

function parseProvenance(
  value: unknown,
  relationshipIndex: number,
): {
  readonly value?: PersistedRelationshipProvenance;
  readonly invalid: boolean;
  readonly issues: readonly ProjectRelationshipIssue[];
} {
  if (value === undefined) return { invalid: false, issues: [] };
  if (
    value === RelationshipProvenance.ProjectDefined ||
    value === RelationshipProvenance.UserConfirmed
  )
    return { value, invalid: false, issues: [] };
  return {
    invalid: true,
    issues: [
      semanticIssue(
        relationshipIndex,
        "provenance must be `projectDefined` or `userConfirmed` when present.",
      ),
    ],
  };
}

function parseEndpoint(
  value: unknown,
  label: string,
  relationshipIndex: number,
): {
  readonly endpoint?: ProjectRelationshipEndpointDefinition;
  readonly issues: readonly ProjectRelationshipIssue[];
} {
  if (!record(value))
    return {
      issues: [semanticIssue(relationshipIndex, `${label} must be an object.`)],
    };
  const fields = unknownFields(value, ["database", "schema", "object"]);
  if (fields.length)
    return {
      issues: [
        semanticIssue(
          relationshipIndex,
          `${label} has unknown field(s): ${fields.join(", ")}.`,
        ),
      ],
    };
  const database = validName(value["database"]);
  const schema = validName(value["schema"]);
  const object = validName(value["object"]);
  if (!database || !schema || !object)
    return {
      issues: [
        semanticIssue(
          relationshipIndex,
          `${label} requires non-empty database, schema, and object names without leading/trailing whitespace or control characters.`,
        ),
      ],
    };
  return { endpoint: { database, schema, object }, issues: [] };
}

function parseMappings(
  value: unknown,
  relationshipIndex: number,
): {
  readonly mappings?: readonly ProjectRelationshipMappingDefinition[];
  readonly issues: readonly ProjectRelationshipIssue[];
} {
  if (!Array.isArray(value) || !value.length)
    return {
      issues: [
        semanticIssue(relationshipIndex, "mappings must be a non-empty array."),
      ],
    };
  const mappings: ProjectRelationshipMappingDefinition[] = [];
  const issues: ProjectRelationshipIssue[] = [];
  for (const [mappingIndex, mapping] of value.entries()) {
    if (!record(mapping)) {
      issues.push(
        semanticIssue(
          relationshipIndex,
          `Mapping ${String(mappingIndex + 1)} must be an object.`,
        ),
      );
      continue;
    }
    const fields = unknownFields(mapping, ["source", "target"]);
    const source = validName(mapping["source"]);
    const target = validName(mapping["target"]);
    if (fields.length || !source || !target) {
      issues.push(
        semanticIssue(
          relationshipIndex,
          `Mapping ${String(mappingIndex + 1)} requires only non-empty source and target column names.`,
        ),
      );
      continue;
    }
    mappings.push({ source, target });
  }
  return mappings.length === value.length ? { mappings, issues } : { issues };
}

const invalid = (
  relationshipIndex: number,
  message: string,
): { readonly issues: readonly ProjectRelationshipIssue[] } => ({
  issues: [semanticIssue(relationshipIndex, message)],
});
const semanticIssue = (
  relationshipIndex: number,
  message: string,
): ProjectRelationshipIssue => ({
  relationshipIndex,
  message: `Relationship ${String(relationshipIndex + 1)}: ${message}`,
});
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const unknownFields = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): string[] => Object.keys(value).filter((field) => !allowed.includes(field));
const validName = (value: unknown): string | undefined =>
  typeof value === "string" &&
  value.length > 0 &&
  value === value.trim() &&
  !hasControlCharacter(value)
    ? value
    : undefined;
const hasControlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
};
const qualified = (endpoint: ProjectRelationshipEndpointDefinition): string =>
  `${endpoint.database}.${endpoint.schema}.${endpoint.object}`;
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
