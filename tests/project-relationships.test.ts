import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { presentationModel } from "../src/completion/PresentationModel.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type {
  DatabaseMetadata,
  ForeignKeyMetadata,
} from "../src/metadata/MetadataModels.js";
import { FileMetadataSnapshotStore } from "../src/metadata/PersistentMetadataStore.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";
import {
  appendProjectRelationshipDefinition,
  parseProjectRelationshipConfiguration,
  ProjectRelationshipConfigurationCache,
  resolveProjectRelationships,
  type ProjectRelationshipDefinition,
} from "../src/relationships/ProjectRelationshipConfig.js";
import {
  isDeclaredForeignKeyRelationship,
  RelationshipConfidence,
  RelationshipProvenance,
} from "../src/relationships/RelationshipModels.js";

const column = (name: string, ordinal: number, type = "int") => ({
  name,
  normalizedName: name.toLocaleLowerCase("en-US"),
  type: { name: type },
  nullable: false,
  ordinal,
});

const objects: DatabaseMetadata["objects"] = [
  {
    id: 1,
    schema: "qpacc",
    name: "ProjectParent",
    normalizedName: "projectparent",
    kind: "table",
    parameters: [],
    columns: [column("CompanyId", 1), column("ParentId", 2)],
  },
  {
    id: 2,
    schema: "qpacc",
    name: "ProjectChild",
    normalizedName: "projectchild",
    kind: "table",
    parameters: [],
    columns: [
      column("CompanyId", 1),
      column("ChildId", 2),
      column("ParentRef", 3),
      column("AlternateParentRef", 4),
      column("TextRef", 5, "nvarchar"),
      column("UnknownRef", 6, "unknown"),
    ],
  },
  {
    id: 3,
    schema: "qpacc",
    name: "Unrelated",
    normalizedName: "unrelated",
    kind: "table",
    parameters: [],
    columns: [column("Id", 1)],
  },
  {
    id: 4,
    schema: "qpacc",
    name: "ProjectAlternative",
    normalizedName: "projectalternative",
    kind: "table",
    parameters: [],
    columns: [column("ParentRef", 1)],
  },
];

const metadata = (
  foreignKeys: readonly ForeignKeyMetadata[] = [],
): DatabaseMetadata => ({
  database: "IntelliSenseLab",
  schemas: ["qpacc"],
  objects,
  foreignKeys,
  loadedAt: 0,
});

const composite: ProjectRelationshipDefinition = {
  source: {
    database: "IntelliSenseLab",
    schema: "qpacc",
    object: "ProjectChild",
  },
  target: {
    database: "IntelliSenseLab",
    schema: "qpacc",
    object: "ProjectParent",
  },
  mappings: [
    { source: "CompanyId", target: "CompanyId" },
    { source: "ParentRef", target: "ParentId" },
  ],
};

const single: ProjectRelationshipDefinition = {
  ...composite,
  mappings: [{ source: "ParentRef", target: "ParentId" }],
};

const alternative: ProjectRelationshipDefinition = {
  ...single,
  source: {
    ...single.source,
    object: "ProjectAlternative",
  },
};

const resolve = (
  definitions: readonly ProjectRelationshipDefinition[],
  foreignKeys: readonly ForeignKeyMetadata[] = [],
) => {
  const base = new DatabaseIndex(metadata(foreignKeys));
  const resolved = resolveProjectRelationships(definitions, base);
  return {
    base,
    resolved,
    index: new DatabaseIndex(base.metadata, resolved.relationships),
  };
};

const joins = (index: DatabaseIndex, sql: string) =>
  createCandidates(resolveSqlContext(sql), index).filter(
    (candidate) => candidate.kind === "joinPredicate",
  );

const declared = (
  columns: ForeignKeyMetadata["columns"],
  id = 10,
): ForeignKeyMetadata => ({
  database: "IntelliSenseLab",
  id,
  name: `FK_ProjectChild_ProjectParent_${String(id)}`,
  parentObjectId: 2,
  parentSchema: "qpacc",
  parentObjectName: "ProjectChild",
  referencedObjectId: 1,
  referencedSchema: "qpacc",
  referencedObjectName: "ProjectParent",
  columns,
  deleteAction: "NO_ACTION",
  updateAction: "NO_ACTION",
  disabled: false,
  notTrusted: false,
});

test("contract: valid ProjectDefined relationships resolve without FK details", () => {
  for (const definition of [single, composite]) {
    const { resolved } = resolve([definition]);
    assert.deepEqual(resolved.issues, []);
    assert.equal(resolved.relationships.length, 1);
    const relationship = resolved.relationships[0]!;
    assert.equal(
      relationship.provenance,
      RelationshipProvenance.ProjectDefined,
    );
    assert.equal(relationship.confidence, RelationshipConfidence.Confirmed);
    assert.equal("declaredForeignKey" in relationship, false);
  }
  assert.deepEqual(
    resolve([composite]).resolved.relationships[0]?.mappings.map((mapping) => [
      mapping.ordinal,
      mapping.sourceColumnName,
      mapping.targetColumnName,
    ]),
    [
      [1, "CompanyId", "CompanyId"],
      [2, "ParentRef", "ParentId"],
    ],
  );
});

test("project relationship JSON parsing is versioned strict and fail-safe", () => {
  const valid = parseProjectRelationshipConfiguration(
    JSON.stringify({ version: 1, relationships: [composite] }),
  );
  assert.equal(valid.definitions.length, 1);
  assert.deepEqual(valid.issues, []);
  assert.equal(valid.definitions[0]?.provenance, undefined);
  assert.equal(
    resolve(valid.definitions).resolved.relationships[0]?.provenance,
    RelationshipProvenance.ProjectDefined,
    "version-1 entries without provenance remain ProjectDefined",
  );

  const confirmed = parseProjectRelationshipConfiguration(
    JSON.stringify({
      version: 1,
      relationships: [
        {
          ...composite,
          provenance: RelationshipProvenance.UserConfirmed,
        },
      ],
    }),
  );
  assert.deepEqual(confirmed.issues, []);
  const confirmedRelationship = resolve(confirmed.definitions).resolved
    .relationships[0];
  assert.ok(confirmedRelationship);
  assert.equal(
    confirmedRelationship.provenance,
    RelationshipProvenance.UserConfirmed,
  );
  assert.equal(
    confirmedRelationship.confidence,
    RelationshipConfidence.Confirmed,
  );
  assert.equal("declaredForeignKey" in confirmedRelationship, false);

  for (const [value, message] of [
    [{ version: 2, relationships: [] }, /Unsupported relationship format/],
    [
      { version: 1, relationships: [{ ...composite, mappings: [] }] },
      /non-empty array/,
    ],
    [
      {
        version: 1,
        relationships: [
          { ...composite, source: { ...composite.source, schema: " qpacc" } },
        ],
      },
      /requires non-empty database/,
    ],
    [
      { version: 1, relationships: [{ ...composite, typo: true }] },
      /Unknown field/,
    ],
    [
      {
        version: 1,
        relationships: [{ ...composite, provenance: "learnedFromQuery" }],
      },
      /provenance must be/,
    ],
  ] as const) {
    const parsed = parseProjectRelationshipConfiguration(JSON.stringify(value));
    assert.equal(parsed.definitions.length, 0);
    assert.match(parsed.issues[0]?.message ?? "", message);
  }
  assert.match(
    parseProjectRelationshipConfiguration("{").issues[0]?.message ?? "",
    /Invalid JSON/,
  );
});

test("user-confirmed persistence creates appends preserves and deduplicates version 1", () => {
  const confirmed: ProjectRelationshipDefinition = {
    ...composite,
    provenance: RelationshipProvenance.UserConfirmed,
  };
  const created = appendProjectRelationshipDefinition(undefined, confirmed);
  assert.equal(created.kind, "written");
  assert.equal(created.text.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(created.text), {
    version: 1,
    relationships: [confirmed],
  });

  const existing = JSON.stringify({
    $schema: "../../schemas/project-relationships.schema.json",
    version: 1,
    relationships: [alternative],
  });
  const appended = appendProjectRelationshipDefinition(existing, confirmed);
  assert.equal(appended.kind, "written");
  assert.deepEqual(JSON.parse(appended.text), {
    $schema: "../../schemas/project-relationships.schema.json",
    version: 1,
    relationships: [alternative, confirmed],
  });
  assert.equal(
    appendProjectRelationshipDefinition(appended.text, confirmed).kind,
    "duplicate",
  );
  assert.equal(
    appendProjectRelationshipDefinition(
      JSON.stringify({ version: 1, relationships: [composite] }),
      confirmed,
    ).kind,
    "duplicate",
    "an exact ProjectDefined mapping is already project knowledge",
  );
  assert.equal(
    appendProjectRelationshipDefinition("", confirmed).kind,
    "invalid",
    "an invalid existing file must never be overwritten",
  );

  const distinct = appendProjectRelationshipDefinition(created.text, {
    ...confirmed,
    mappings: [{ source: "AlternateParentRef", target: "ParentId" }],
  });
  assert.equal(distinct.kind, "written");
});

test("semantic validation rejects missing endpoints columns duplicates and incompatible mappings", () => {
  const cases: readonly [ProjectRelationshipDefinition, RegExp][] = [
    [
      { ...composite, source: { ...composite.source, object: "Missing" } },
      /Source table.*was not found/,
    ],
    [
      { ...composite, target: { ...composite.target, object: "Missing" } },
      /Target table.*was not found/,
    ],
    [
      { ...composite, mappings: [{ source: "Missing", target: "ParentId" }] },
      /Source column.*was not found/,
    ],
    [
      { ...composite, mappings: [{ source: "ParentRef", target: "Missing" }] },
      /Target column.*was not found/,
    ],
    [
      {
        ...composite,
        mappings: [
          { source: "CompanyId", target: "CompanyId" },
          { source: "CompanyId", target: "ParentId" },
        ],
      },
      /repeats a source or target column/,
    ],
    [
      { ...composite, mappings: [{ source: "TextRef", target: "ParentId" }] },
      /incompatible SQL types/,
    ],
    [
      {
        ...composite,
        target: { ...composite.target, database: "Reporting" },
      },
      /Cross-database project relationships are not supported/,
    ],
    [
      {
        source: composite.target,
        target: composite.target,
        mappings: [{ source: "ParentId", target: "ParentId" }],
      },
      /self-relationship/,
    ],
  ];
  for (const [definition, message] of cases) {
    const result = resolve([definition]).resolved;
    assert.equal(result.relationships.length, 0);
    assert.match(result.issues[0]?.message ?? "", message);
  }

  assert.equal(
    resolve([
      {
        ...composite,
        mappings: [{ source: "UnknownRef", target: "ParentId" }],
      },
    ]).resolved.relationships.length,
    1,
    "unknown type metadata must not reject an explicit relationship",
  );
});

test("exact project duplicates collapse and declared FKs win equivalent mappings", () => {
  const duplicate = resolve([composite, { ...composite }]);
  assert.equal(duplicate.resolved.relationships.length, 1);
  assert.match(duplicate.resolved.issues[0]?.message ?? "", /Duplicate/);

  const physical = declared([
    {
      parentColumnId: 1,
      parentColumnName: "CompanyId",
      referencedColumnId: 1,
      referencedColumnName: "CompanyId",
      ordinal: 1,
    },
    {
      parentColumnId: 3,
      parentColumnName: "ParentRef",
      referencedColumnId: 2,
      referencedColumnName: "ParentId",
      ordinal: 2,
    },
  ]);
  const withPhysical = resolve([composite], [physical]).index;
  assert.equal(withPhysical.relationships.length, 1);
  assert.ok(isDeclaredForeignKeyRelationship(withPhysical.relationships[0]!));
});

test("exact UserConfirmed and ProjectDefined duplicates collapse to explicit user trust", () => {
  const confirmed: ProjectRelationshipDefinition = {
    ...composite,
    provenance: RelationshipProvenance.UserConfirmed,
  };
  const result = resolve([composite, confirmed]);
  assert.equal(result.resolved.relationships.length, 1);
  assert.equal(
    result.resolved.relationships[0]?.provenance,
    RelationshipProvenance.UserConfirmed,
  );
  assert.match(result.resolved.issues[0]?.message ?? "", /Duplicate/);
});

test("distinct declared and project relationships coexist with explicit trust ordering", () => {
  const physical = declared([
    {
      parentColumnId: 4,
      parentColumnName: "AlternateParentRef",
      referencedColumnId: 2,
      referencedColumnName: "ParentId",
      ordinal: 1,
    },
  ]);
  const { index } = resolve([single], [physical]);
  const candidates = joins(
    index,
    "SELECT * FROM qpacc.ProjectParent p JOIN qpacc.ProjectChild c ON",
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.name),
    ["c.AlternateParentRef = p.ParentId", "c.ParentRef = p.ParentId"],
  );
  assert.ok(isDeclaredForeignKeyRelationship(candidates[0]!.relationship!));
  assert.equal(
    candidates[1]?.relationship?.provenance,
    RelationshipProvenance.ProjectDefined,
  );

  const rankedIndex = resolve([single, alternative], [physical]).index;
  const tables = createCandidates(
    resolveSqlContext("SELECT * FROM qpacc.ProjectParent p JOIN qpacc.Project"),
    rankedIndex,
  ).filter((candidate) => candidate.kind === "table");
  const declaredIndex = tables.findIndex(
    (candidate) => candidate.name === "ProjectChild",
  );
  const projectIndex = tables.findIndex(
    (candidate) => candidate.name === "ProjectAlternative",
  );
  assert.notEqual(declaredIndex, -1);
  assert.notEqual(projectIndex, -1);
  assert.ok(
    declaredIndex < projectIndex,
    "a declared-FK-related RowSource must rank above a project-only RowSource",
  );
});

test("contract: project relationships power canonical graph and bidirectional composite JOINs", () => {
  const { index } = resolve([composite]);
  const parent = index.findObject("qpacc", "ProjectParent")!;
  const child = index.findObject("qpacc", "ProjectChild")!;
  const relationship = index.relationshipsBetween(parent, child)[0]!;
  assert.equal(index.outgoingRelationships(child)[0], relationship);
  assert.equal(index.incomingRelationships(parent)[0], relationship);
  assert.equal(index.relationshipsBetween(child, parent)[0], relationship);
  assert.deepEqual(index.relatedObjects(parent), [child]);
  assert.deepEqual(
    joins(
      index,
      "SELECT * FROM qpacc.ProjectParent p JOIN qpacc.ProjectChild c ON",
    ).map((candidate) => candidate.name),
    ["c.CompanyId = p.CompanyId AND c.ParentRef = p.ParentId"],
  );
  assert.deepEqual(
    joins(
      index,
      "SELECT * FROM qpacc.ProjectChild c JOIN qpacc.ProjectParent p ON",
    ).map((candidate) => candidate.name),
    ["p.CompanyId = c.CompanyId AND p.ParentId = c.ParentRef"],
  );
});

test("project relationships are distinguishable and rank related RowSources", () => {
  const { index } = resolve([composite]);
  const predicate = joins(
    index,
    "SELECT * FROM qpacc.ProjectParent p JOIN qpacc.ProjectChild c ON",
  )[0]!;
  assert.equal(
    presentationModel(predicate, true).detail,
    " Project relationship JOIN",
  );
  const tables = createCandidates(
    resolveSqlContext("SELECT * FROM qpacc.ProjectParent p JOIN qpacc.Project"),
    index,
  ).filter((candidate) => candidate.kind === "table");
  assert.equal(tables[0]?.name, "ProjectChild");
  assert.match(
    presentationModel(tables[0]!, true).detail,
    /project relationship/,
  );
});

test("user-confirmed JOIN presentation is distinct and never claims FK metadata", () => {
  const { index } = resolve([
    { ...composite, provenance: RelationshipProvenance.UserConfirmed },
  ]);
  const predicate = joins(
    index,
    "SELECT * FROM qpacc.ProjectParent p JOIN qpacc.ProjectChild c ON",
  )[0]!;
  assert.equal(
    presentationModel(predicate, true).detail,
    " User-confirmed relationship JOIN",
  );
  assert.ok(predicate.relationship);
  assert.equal(
    predicate.relationship.provenance,
    RelationshipProvenance.UserConfirmed,
  );
  assert.equal("declaredForeignKey" in predicate.relationship, false);
});

test("configuration cache isolates projects and reloads only after invalidation", async () => {
  const reads = new Map<string, number>();
  const cache = new ProjectRelationshipConfigurationCache(async (key) => {
    reads.set(key, (reads.get(key) ?? 0) + 1);
    return JSON.stringify({
      version: 1,
      relationships: key === "project-a" ? [single] : [],
    });
  });
  assert.equal((await cache.load("project-a")).definitions.length, 1);
  assert.equal((await cache.load("project-a")).definitions.length, 1);
  assert.equal((await cache.load("project-b")).definitions.length, 0);
  assert.deepEqual(Object.fromEntries(reads), {
    "project-a": 1,
    "project-b": 1,
  });
  cache.invalidate("project-a");
  await cache.load("project-a");
  assert.equal(reads.get("project-a"), 2);
});

test("physical snapshots exclude project relationships and refresh overlays reapply them", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "query-puppy-project-rel-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const base = new DatabaseIndex(metadata());
  const project = resolveProjectRelationships([composite], base).relationships;
  const overlay = new DatabaseIndex(base.metadata, project);
  const store = new FileMetadataSnapshotStore(directory);
  await store.save("connection", "IntelliSenseLab", overlay, 123);
  const files = await import("node:fs/promises").then((fs) =>
    fs.readdir(directory),
  );
  const persisted = await readFile(join(directory, files[0]!), "utf8");
  assert.doesNotMatch(persisted, /projectDefined|Project relationship/);
  const hydrated = await store.load("connection", "IntelliSenseLab");
  assert.ok(hydrated);
  assert.equal(hydrated.index.relationships.length, 0);
  const reapplied = resolveProjectRelationships(
    [composite],
    hydrated.index,
  ).relationships;
  assert.equal(
    new DatabaseIndex(hydrated.index.metadata, reapplied).relationships.length,
    1,
  );
});
