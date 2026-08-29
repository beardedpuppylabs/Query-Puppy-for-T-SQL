import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { presentationModel } from "../src/completion/PresentationModel.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type {
  DatabaseMetadata,
  DatabaseObject,
} from "../src/metadata/MetadataModels.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";
import {
  LEARNED_RELATIONSHIP_CANDIDATE_THRESHOLD,
  resolveLearnedRelationshipCandidates,
} from "../src/relationships/LearnedRelationshipCandidatePolicy.js";
import type { LearnedRelationshipEvidenceRecord } from "../src/relationships/LearnedRelationshipEvidence.js";
import {
  productionRelationshipRank,
  relationshipSemanticIdentity,
  RelationshipConfidence,
  RelationshipProvenance,
  type Relationship,
} from "../src/relationships/RelationshipModels.js";

const column = (name: string, ordinal: number, type = "int") => ({
  name,
  normalizedName: name.toLocaleLowerCase("en-US"),
  type: { name: type },
  nullable: false,
  ordinal,
});

const table = (
  id: number,
  name: string,
  columns: readonly ReturnType<typeof column>[],
): DatabaseObject => ({
  id,
  schema: "qpacc",
  name,
  normalizedName: name.toLocaleLowerCase("en-US"),
  kind: "table",
  parameters: [],
  columns,
});

const parent = table(1, "ProjectParent", [
  column("CompanyId", 1),
  column("ParentId", 2),
]);
const child = table(2, "ProjectChild", [
  column("CompanyId", 1),
  column("ChildId", 2),
  column("ParentRef", 3),
  column("LegacyRef", 4),
  column("TextRef", 5, "nvarchar"),
]);
const unrelated = table(3, "ProjectUnrelated", [column("Id", 1)]);
const employee = table(4, "Employee", [
  column("EmployeeId", 1),
  column("ManagerId", 2),
]);

const metadata = (
  objects: readonly DatabaseObject[] = [parent, child, unrelated, employee],
): DatabaseMetadata => ({
  database: "IntelliSenseLab",
  schemas: ["qpacc"],
  objects,
  foreignKeys: [],
  loadedAt: 0,
});

const evidence = (
  observationCount: number,
  mappings: LearnedRelationshipEvidenceRecord["mappings"] = [
    { source: "ParentRef", target: "ParentId" },
  ],
  sourceObject = "ProjectChild",
  targetObject = "ProjectParent",
): LearnedRelationshipEvidenceRecord => ({
  source: {
    database: "IntelliSenseLab",
    schema: "qpacc",
    object: sourceObject,
  },
  target: {
    database: "IntelliSenseLab",
    schema: "qpacc",
    object: targetObject,
  },
  mappings,
  observationCount,
});

const learnedIndex = (
  records: readonly LearnedRelationshipEvidenceRecord[],
  base = new DatabaseIndex(metadata()),
): DatabaseIndex =>
  new DatabaseIndex(
    base.metadata,
    resolveLearnedRelationshipCandidates(records, base),
  );

const joinCandidates = (index: DatabaseIndex, sql: string) =>
  createCandidates(resolveSqlContext(sql), index).filter(
    (candidate) => candidate.kind === "joinPredicate",
  );

test("contract: learned relationship threshold is exactly three observations", () => {
  assert.equal(LEARNED_RELATIONSHIP_CANDIDATE_THRESHOLD, 3);
  for (const count of [0, 1, 2])
    assert.deepEqual(
      resolveLearnedRelationshipCandidates(
        [evidence(count)],
        new DatabaseIndex(metadata()),
      ),
      [],
    );
  for (const count of [3, 8]) {
    const candidates = resolveLearnedRelationshipCandidates(
      [evidence(count)],
      new DatabaseIndex(metadata()),
    );
    assert.equal(candidates.length, 1);
    const candidate = candidates[0]!;
    assert.equal(candidate.provenance, RelationshipProvenance.LearnedFromQuery);
    assert.equal(candidate.confidence, RelationshipConfidence.StrongEvidence);
    assert.equal(candidate.observationCount, count);
    assert.equal(productionRelationshipRank(candidate), 3);
  }
});

test("policy resolves current canonical metadata and fails safely for stale or invalid evidence", () => {
  const index = new DatabaseIndex(metadata());
  const invalid: LearnedRelationshipEvidenceRecord[] = [
    evidence(3, undefined, "MissingChild"),
    evidence(3, [{ source: "MissingColumn", target: "ParentId" }]),
    evidence(3, [{ source: "TextRef", target: "ParentId" }]),
    {
      ...evidence(3),
      target: { ...evidence(3).target, database: "OtherDatabase" },
    },
    evidence(
      3,
      [{ source: "EmployeeId", target: "EmployeeId" }],
      "Employee",
      "Employee",
    ),
  ];
  for (const record of invalid)
    assert.deepEqual(resolveLearnedRelationshipCandidates([record], index), []);

  const withoutColumn = new DatabaseIndex(
    metadata([
      parent,
      {
        ...child,
        columns: child.columns.filter((item) => item.name !== "ParentRef"),
      },
    ]),
  );
  assert.deepEqual(
    resolveLearnedRelationshipCandidates([evidence(3)], withoutColumn),
    [],
  );
  assert.equal(
    resolveLearnedRelationshipCandidates([evidence(3)], index).length,
    1,
  );
});

test("exact stronger truth suppresses learned duplicates without broad contradiction inference", () => {
  const learned = resolveLearnedRelationshipCandidates(
    [evidence(3)],
    new DatabaseIndex(metadata()),
  )[0]!;
  const stronger = (
    provenance:
      | typeof RelationshipProvenance.DeclaredForeignKey
      | typeof RelationshipProvenance.UserConfirmed
      | typeof RelationshipProvenance.ProjectDefined,
  ): Relationship =>
    provenance === RelationshipProvenance.DeclaredForeignKey
      ? {
          ...learned,
          provenance,
          confidence: RelationshipConfidence.Authoritative,
          declaredForeignKey: {
            constraintId: 77,
            constraintName: "FK_ProjectChild_ProjectParent",
            deleteAction: "NO_ACTION",
            updateAction: "NO_ACTION",
            disabled: false,
            notTrusted: false,
          },
        }
      : {
          ...learned,
          provenance,
          confidence: RelationshipConfidence.Confirmed,
        };
  for (const provenance of [
    RelationshipProvenance.DeclaredForeignKey,
    RelationshipProvenance.UserConfirmed,
    RelationshipProvenance.ProjectDefined,
  ] as const) {
    const base = new DatabaseIndex(metadata(), [stronger(provenance)]);
    assert.deepEqual(
      resolveLearnedRelationshipCandidates([evidence(8)], base),
      [],
    );
  }

  const alternate = stronger(RelationshipProvenance.ProjectDefined);
  const alternateRelationship: Relationship = {
    ...alternate,
    mappings: [
      {
        ...alternate.mappings[0]!,
        sourceColumnName: "LegacyRef",
        sourceColumnId: 4,
      },
    ],
  };
  const candidate = resolveLearnedRelationshipCandidates(
    [evidence(3)],
    new DatabaseIndex(metadata(), [alternateRelationship]),
  );
  assert.equal(candidate.length, 1);
  assert.notEqual(
    relationshipSemanticIdentity(candidate[0]!),
    relationshipSemanticIdentity(alternateRelationship),
  );
});

test("learned composite relationships use the canonical graph in both JOIN directions", () => {
  const record = evidence(8, [
    { source: "CompanyId", target: "CompanyId" },
    { source: "ParentRef", target: "ParentId" },
  ]);
  const index = learnedIndex([record]);
  const relationship = index.relationshipsBetween(child, parent)[0]!;
  assert.equal(index.relationships.length, 1);
  assert.deepEqual(
    relationship.mappings.map((mapping) => [
      mapping.ordinal,
      mapping.sourceColumnName,
      mapping.targetColumnName,
    ]),
    [
      [1, "CompanyId", "CompanyId"],
      [2, "ParentRef", "ParentId"],
    ],
  );
  assert.equal(index.outgoingRelationships(child)[0], relationship);
  assert.equal(index.incomingRelationships(parent)[0], relationship);
  assert.deepEqual(index.relatedObjects(parent), [child]);
  assert.deepEqual(
    joinCandidates(
      index,
      "SELECT * FROM qpacc.ProjectParent p JOIN qpacc.ProjectChild c ON",
    ).map((candidate) => candidate.name),
    ["c.CompanyId = p.CompanyId AND c.ParentRef = p.ParentId"],
  );
  assert.deepEqual(
    joinCandidates(
      index,
      "SELECT * FROM qpacc.ProjectChild c JOIN qpacc.ProjectParent p ON",
    ).map((candidate) => candidate.name),
    ["p.CompanyId = c.CompanyId AND p.ParentId = c.ParentRef"],
  );
});

test("single-column and valid self relationships produce one deterministic JOIN candidate", () => {
  const singleIndex = learnedIndex([evidence(3)]);
  assert.deepEqual(
    joinCandidates(
      singleIndex,
      "SELECT * FROM qpacc.ProjectParent p JOIN qpacc.ProjectChild c ON",
    ).map((candidate) => candidate.name),
    ["c.ParentRef = p.ParentId"],
  );

  const selfIndex = learnedIndex([
    evidence(
      3,
      [{ source: "ManagerId", target: "EmployeeId" }],
      "Employee",
      "Employee",
    ),
  ]);
  assert.deepEqual(
    joinCandidates(
      selfIndex,
      "SELECT * FROM qpacc.Employee e JOIN qpacc.Employee m ON",
    ).map((candidate) => candidate.name),
    ["m.ManagerId = e.EmployeeId"],
  );
});

test("learned relationships rank after explicit trust and promote related RowSources", () => {
  const index = learnedIndex([evidence(3)]);
  const predicate = joinCandidates(
    index,
    "SELECT * FROM qpacc.ProjectParent p JOIN qpacc.ProjectChild c ON",
  )[0]!;
  assert.equal(
    presentationModel(predicate, true).detail,
    " Learned relationship JOIN",
  );
  const tables = createCandidates(
    resolveSqlContext("SELECT * FROM qpacc.ProjectParent p JOIN qpacc.Project"),
    index,
  ).filter((candidate) => candidate.kind === "table");
  assert.equal(tables[0]?.name, "ProjectChild");
  assert.match(
    presentationModel(tables[0]!, true).detail,
    /learned relationship/,
  );
  const comparisonColumns = createCandidates(
    resolveSqlContext(
      "SELECT * FROM qpacc.ProjectParent p JOIN qpacc.ProjectChild c ON p.ParentId = c.",
    ),
    index,
  ).filter((candidate) => candidate.kind === "column");
  assert.equal(comparisonColumns[0]?.name, "ParentRef");
});

test("coexisting JOIN predicates follow declared user project learned trust order", () => {
  const learned = resolveLearnedRelationshipCandidates(
    [evidence(3)],
    new DatabaseIndex(metadata()),
  )[0]!;
  const remap = (
    sourceColumnName: string,
    sourceColumnId: number,
    targetColumnName = "ParentId",
    targetColumnId = 2,
  ) => [
    {
      sourceColumnName,
      targetColumnName,
      sourceColumnId,
      targetColumnId,
      ordinal: 1,
    },
  ];
  const declared: Relationship = {
    ...learned,
    provenance: RelationshipProvenance.DeclaredForeignKey,
    confidence: RelationshipConfidence.Authoritative,
    mappings: remap("LegacyRef", 4),
    declaredForeignKey: {
      constraintId: 91,
      constraintName: "FK_ProjectChild_Legacy",
      deleteAction: "NO_ACTION",
      updateAction: "NO_ACTION",
      disabled: false,
      notTrusted: false,
    },
  };
  const confirmed: Relationship = {
    ...learned,
    provenance: RelationshipProvenance.UserConfirmed,
    confidence: RelationshipConfidence.Confirmed,
    mappings: remap("ChildId", 2),
  };
  const project: Relationship = {
    ...learned,
    provenance: RelationshipProvenance.ProjectDefined,
    confidence: RelationshipConfidence.Confirmed,
    mappings: remap("CompanyId", 1, "CompanyId", 1),
  };
  const index = new DatabaseIndex(metadata(), [
    learned,
    project,
    confirmed,
    declared,
  ]);
  assert.deepEqual(
    joinCandidates(
      index,
      "SELECT * FROM qpacc.ProjectParent p JOIN qpacc.ProjectChild c ON",
    ).map((candidate) => [candidate.name, candidate.relationship?.provenance]),
    [
      ["c.LegacyRef = p.ParentId", RelationshipProvenance.DeclaredForeignKey],
      ["c.ChildId = p.ParentId", RelationshipProvenance.UserConfirmed],
      ["c.CompanyId = p.CompanyId", RelationshipProvenance.ProjectDefined],
      ["c.ParentRef = p.ParentId", RelationshipProvenance.LearnedFromQuery],
    ],
  );
});
