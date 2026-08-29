import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CompletionScope } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type {
  ColumnMetadata,
  DatabaseMetadata,
  DatabaseObject,
  KeyMetadata,
} from "../src/metadata/MetadataModels.js";
import {
  applyLearnedEvidenceMutation,
  knownRelationshipEvidenceIdentities,
  learnedEvidenceFromResolvedJoin,
  learnedEvidenceIdentity,
  MAX_LEARNED_RELATIONSHIP_EVIDENCE,
  LearnedRelationshipObservationTracker,
  parseLearnedRelationshipEvidence,
  serializeLearnedRelationshipEvidence,
  type LearnedRelationshipEvidenceDefinition,
  type LearnedRelationshipEvidenceRecord,
} from "../src/relationships/LearnedRelationshipEvidence.js";
import { FileLearnedRelationshipEvidenceStore } from "../src/relationships/LearnedRelationshipEvidenceStore.js";
import {
  productionRelationshipRank,
  RelationshipConfidence,
  RelationshipProvenance,
  type Relationship,
} from "../src/relationships/RelationshipModels.js";
import { resolveJoinRelationshipCandidates } from "../src/relationships/ResolvedJoinRelationship.js";

const column = (name: string, ordinal: number): ColumnMetadata => ({
  name,
  normalizedName: name.toLocaleLowerCase("en-US"),
  type: { name: "int" },
  nullable: false,
  ordinal,
});

const table = (
  id: number,
  name: string,
  columns: readonly string[],
): DatabaseObject => ({
  id,
  schema: "qpacc",
  name,
  normalizedName: name.toLocaleLowerCase("en-US"),
  kind: "table",
  parameters: [],
  columns: columns.map(column),
});

const objects: readonly DatabaseObject[] = [
  table(1, "ProjectParent", ["CompanyId", "ParentId"]),
  table(2, "ProjectChild", ["CompanyId", "ChildId", "ParentRef", "LegacyRef"]),
  table(3, "ThirdTable", ["CompanyId"]),
  table(4, "Employee", ["EmployeeId", "ManagerId"]),
];

const key = (
  objectId: number,
  objectName: string,
  name: string,
  columns: readonly string[],
): KeyMetadata => ({
  database: "IntelliSenseLab",
  objectId,
  schema: "qpacc",
  objectName,
  name,
  kind: "uniqueConstraint",
  columns: columns.map((columnName, index) => ({
    columnId: index + 1,
    columnName,
    ordinal: index + 1,
  })),
  filtered: false,
});

const metadata: DatabaseMetadata = {
  database: "IntelliSenseLab",
  schemas: ["qpacc"],
  objects,
  keys: [
    key(1, "ProjectParent", "UQ_ProjectParent", ["CompanyId", "ParentId"]),
    key(4, "Employee", "UQ_Employee", ["EmployeeId"]),
  ],
  foreignKeys: [],
  loadedAt: 1,
};
const index = new DatabaseIndex(metadata);
const scope: CompletionScope = {
  activeDatabase: metadata.database,
  indexes: new Map([["intellisenselab", index]]),
};

const evidence = (sql: string): LearnedRelationshipEvidenceDefinition[] =>
  resolveJoinRelationshipCandidates(sql, scope)
    .map(learnedEvidenceFromResolvedJoin)
    .filter((candidate) => candidate !== undefined);

const compositeSql = `SELECT *
FROM qpacc.ProjectParent AS p
JOIN qpacc.ProjectChild AS c
  ON c.CompanyId = p.CompanyId
 AND c.ParentRef = p.ParentId`;

test("contract: learned evidence normalizes aliases operands AND order casing and quoting", () => {
  const canonical = evidence(compositeSql);
  const equivalent = evidence(`SELECT *
FROM [QPACC].[PROJECTPARENT] AS [parent]
JOIN [qpacc].[projectchild] AS [child]
  ON [parent].[PARENTID] = [child].[parentref]
 AND [parent].[companyid] = [child].[COMPANYID]`);
  assert.equal(canonical.length, 1);
  assert.equal(equivalent.length, 1);
  assert.equal(
    learnedEvidenceIdentity(canonical[0]!),
    learnedEvidenceIdentity(equivalent[0]!),
  );
  assert.deepEqual(canonical[0], {
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
  });
});

test("learned evidence supports meaningful self joins and skips ambiguous direction", () => {
  const self = evidence(`SELECT * FROM qpacc.Employee e
JOIN qpacc.Employee manager ON e.ManagerId = manager.EmployeeId`);
  assert.deepEqual(self, [
    {
      source: {
        database: "IntelliSenseLab",
        schema: "qpacc",
        object: "Employee",
      },
      target: {
        database: "IntelliSenseLab",
        schema: "qpacc",
        object: "Employee",
      },
      mappings: [{ source: "ManagerId", target: "EmployeeId" }],
    },
  ]);
  assert.deepEqual(
    evidence(`SELECT * FROM qpacc.ProjectChild c
JOIN qpacc.ThirdTable t ON c.CompanyId = t.CompanyId`),
    [],
  );
  assert.deepEqual(
    evidence(`SELECT * FROM qpacc.Employee e
JOIN qpacc.Employee manager ON e.EmployeeId = manager.EmployeeId`),
    [],
  );
});

test("contract: unsafe and transient JOIN shapes never become learned evidence", () => {
  for (const predicate of [
    "c.ParentRef + 1 = p.ParentId",
    "ISNULL(c.ParentRef, 0) = p.ParentId",
    "c.ParentRef = p.ParentId OR c.LegacyRef = p.ParentId",
    "c.ParentRef > p.ParentId",
    "c.ParentRef = 1",
    "c.ParentRef = @ParentId",
    "missing.ParentRef = p.ParentId",
    "c.Missing = p.ParentId",
    "c.ParentRef = p.ParentId AND c.CompanyId = t.CompanyId",
  ])
    assert.deepEqual(
      evidence(`SELECT * FROM qpacc.ProjectParent p
JOIN qpacc.ThirdTable t ON t.CompanyId = p.CompanyId
JOIN qpacc.ProjectChild c ON ${predicate}`),
      [],
      predicate,
    );
  assert.deepEqual(
    evidence(`WITH local AS (SELECT ParentId FROM qpacc.ProjectParent)
SELECT * FROM local p JOIN qpacc.ProjectChild c ON c.ParentRef = p.ParentId`),
    [],
  );

  const reportingMetadata: DatabaseMetadata = {
    ...metadata,
    database: "IntelliSenseLabReporting",
    keys: (metadata.keys ?? []).map((item) => ({
      ...item,
      database: "IntelliSenseLabReporting",
    })),
  };
  const crossDatabaseScope: CompletionScope = {
    activeDatabase: metadata.database,
    indexes: new Map([
      ["intellisenselab", index],
      ["intellisenselabreporting", new DatabaseIndex(reportingMetadata)],
    ]),
  };
  assert.deepEqual(
    resolveJoinRelationshipCandidates(
      `SELECT * FROM IntelliSenseLab.qpacc.ProjectParent p
JOIN IntelliSenseLabReporting.qpacc.ProjectChild c
  ON c.ParentRef = p.ParentId`,
      crossDatabaseScope,
    )
      .map(learnedEvidenceFromResolvedJoin)
      .filter((candidate) => candidate !== undefined),
    [],
    "Phase E1 must not learn cross-database relationships",
  );
});

test("observation tracking counts genuine occurrences without provider or edit inflation", () => {
  const item = evidence(compositeSql)[0]!;
  const tracker = new LearnedRelationshipObservationTracker();
  const none = new Set<string>();
  assert.deepEqual(tracker.observe("document-a", [item], none).observations, [
    { evidence: item, count: 1 },
  ]);
  assert.deepEqual(
    tracker.observe("document-a", [item], none).observations,
    [],
    "unchanged save or unrelated edits must not recount the JOIN",
  );
  assert.deepEqual(
    tracker.observe("document-a", [item, item], none).observations,
    [{ evidence: item, count: 1 }],
    "a second independent occurrence contributes once",
  );
  assert.deepEqual(tracker.observe("document-a", [], none).observations, []);
  assert.deepEqual(tracker.observe("document-a", [item], none).observations, [
    { evidence: item, count: 1 },
  ]);
  assert.deepEqual(tracker.observe("document-b", [item], none).observations, [
    { evidence: item, count: 1 },
  ]);
});

test("known canonical relationships remove and suppress redundant evidence", () => {
  const item = evidence(compositeSql)[0]!;
  const identity = learnedEvidenceIdentity(item);
  const tracker = new LearnedRelationshipObservationTracker();
  const mutation = tracker.observe("document", [item], new Set([identity]));
  assert.deepEqual(mutation.observations, []);
  assert.deepEqual([...mutation.removals], [identity]);
  assert.deepEqual(
    applyLearnedEvidenceMutation([{ ...item, observationCount: 8 }], mutation),
    [],
  );
});

test("declared FK and confirmed relationship provenances are known evidence identities", () => {
  const item = evidence(compositeSql)[0]!;
  const relationship = (
    provenance: Relationship["provenance"],
  ): Relationship => {
    const shared = {
      source: {
        database: item.source.database,
        schema: item.source.schema,
        objectName: item.source.object,
      },
      target: {
        database: item.target.database,
        schema: item.target.schema,
        objectName: item.target.object,
      },
      mappings: item.mappings.map((mapping, ordinal) => ({
        sourceColumnName: mapping.source,
        targetColumnName: mapping.target,
        ordinal: ordinal + 1,
      })),
    };
    switch (provenance) {
      case RelationshipProvenance.DeclaredForeignKey:
        return {
          ...shared,
          provenance,
          confidence: RelationshipConfidence.Authoritative,
          declaredForeignKey: {
            constraintId: 41,
            constraintName: "FK_known",
            deleteAction: "NO_ACTION",
            updateAction: "NO_ACTION",
            disabled: true,
            notTrusted: true,
          },
        };
      case RelationshipProvenance.ProjectDefined:
      case RelationshipProvenance.UserConfirmed:
        return {
          ...shared,
          provenance,
          confidence: RelationshipConfidence.Confirmed,
        };
      case RelationshipProvenance.LearnedFromQuery:
        return {
          ...shared,
          provenance,
          confidence: RelationshipConfidence.StrongEvidence,
        };
      case RelationshipProvenance.HeuristicCandidate:
        return {
          ...shared,
          provenance,
          confidence: RelationshipConfidence.Candidate,
        };
    }
  };
  for (const provenance of [
    RelationshipProvenance.DeclaredForeignKey,
    RelationshipProvenance.ProjectDefined,
    RelationshipProvenance.UserConfirmed,
  ])
    assert.deepEqual(
      [...knownRelationshipEvidenceIdentities([relationship(provenance)])],
      [learnedEvidenceIdentity(item)],
      provenance,
    );
  for (const provenance of [
    RelationshipProvenance.LearnedFromQuery,
    RelationshipProvenance.HeuristicCandidate,
  ])
    assert.deepEqual(
      [...knownRelationshipEvidenceIdentities([relationship(provenance)])],
      [],
      provenance,
    );
});

test("bounded evidence retains stronger records and serializes deterministically", () => {
  const base = evidence(compositeSql)[0]!;
  const records: LearnedRelationshipEvidenceRecord[] = [
    { ...variant(base, "ZetaRef"), observationCount: 1 },
    { ...variant(base, "AlphaRef"), observationCount: 1 },
    { ...variant(base, "StrongRef"), observationCount: 12 },
    { ...variant(base, "MediumRef"), observationCount: 4 },
  ];
  const bounded = applyLearnedEvidenceMutation(
    records,
    { observations: [], removals: new Set() },
    3,
  );
  assert.equal(bounded.length, 3);
  assert.ok(bounded.some((record) => record.observationCount === 12));
  assert.ok(bounded.some((record) => record.observationCount === 4));
  const serialized = serializeLearnedRelationshipEvidence(bounded);
  assert.equal(
    serializeLearnedRelationshipEvidence(
      parseValid(serialized).document.evidence,
    ),
    serialized,
  );

  const exactLimit = applyLearnedEvidenceMutation(
    Array.from(
      { length: MAX_LEARNED_RELATIONSHIP_EVIDENCE + 4 },
      (_, ordinal) => ({
        ...variant(base, `Source${String(ordinal).padStart(5, "0")}`),
        observationCount: ordinal + 1,
      }),
    ),
    { observations: [], removals: new Set() },
  );
  assert.equal(exactLimit.length, MAX_LEARNED_RELATIONSHIP_EVIDENCE);
  assert.equal(
    exactLimit.some((record) => record.observationCount === 1),
    false,
  );
});

test("file store reloads, serializes concurrent updates, isolates workspaces, and fails safely", async () => {
  const directory = await mkdtemp(join(tmpdir(), "query-puppy-evidence-"));
  try {
    const item = evidence(compositeSql)[0]!;
    const observation = {
      observations: [{ evidence: item, count: 1 }],
      removals: new Set<string>(),
    };
    const store = new FileLearnedRelationshipEvidenceStore(directory);
    await Promise.all(
      Array.from({ length: 6 }, () => store.update("workspace-a", observation)),
    );
    await store.update("workspace-b", observation);
    const reloaded = new FileLearnedRelationshipEvidenceStore(directory);
    const workspaceA = await reloaded.read("workspace-a");
    const workspaceB = await reloaded.read("workspace-b");
    assert.equal(workspaceA.kind, "valid");
    assert.equal(workspaceB.kind, "valid");
    assert.equal(workspaceA.evidence[0]?.observationCount, 6);
    assert.equal(workspaceB.evidence[0]?.observationCount, 1);

    const persisted = await readFile(
      storePath(directory, "workspace-a"),
      "utf8",
    );
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
      [],
    );
    assert.doesNotMatch(
      persisted,
      /SELECT|JOIN|literal-value|password|connection string/i,
    );
    assert.equal(persisted.includes("observationCount"), true);

    const malformedPath = storePath(directory, "malformed-workspace");
    await writeFile(malformedPath, "{not-json", "utf8");
    const diagnostics: string[] = [];
    const malformed = new FileLearnedRelationshipEvidenceStore(
      directory,
      (message) => diagnostics.push(message),
    );
    assert.equal((await malformed.read("malformed-workspace")).kind, "invalid");
    assert.equal(
      (await malformed.update("malformed-workspace", observation)).kind,
      "invalid",
    );
    assert.equal((await malformed.read("malformed-workspace")).kind, "invalid");
    assert.equal(diagnostics.length, 1, "invalid storage is reported once");
    assert.equal(await readFile(malformedPath, "utf8"), "{not-json");

    const unsupportedPath = storePath(directory, "unsupported-workspace");
    await writeFile(
      unsupportedPath,
      JSON.stringify({ version: 999, evidence: [] }),
      "utf8",
    );
    assert.equal(
      (
        await new FileLearnedRelationshipEvidenceStore(directory).read(
          "unsupported-workspace",
        )
      ).kind,
      "invalid",
    );
    await store.clear("workspace-b");
    const cleared = await store.read("workspace-b");
    assert.deepEqual(
      cleared.kind === "valid" ? cleared.evidence : undefined,
      [],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("contract: persisted evidence never activates LearnedFromQuery production relationships", () => {
  assert.equal(
    productionRelationshipRank({
      provenance: RelationshipProvenance.LearnedFromQuery,
      confidence: RelationshipConfidence.StrongEvidence,
      source: {
        database: "IntelliSenseLab",
        schema: "qpacc",
        objectName: "ProjectChild",
      },
      target: {
        database: "IntelliSenseLab",
        schema: "qpacc",
        objectName: "ProjectParent",
      },
      mappings: [
        {
          sourceColumnName: "ParentRef",
          targetColumnName: "ParentId",
          ordinal: 1,
        },
      ],
    }),
    undefined,
  );
  assert.deepEqual(index.relationships, []);
});

const variant = (
  evidence: LearnedRelationshipEvidenceDefinition,
  source: string,
): LearnedRelationshipEvidenceDefinition => ({
  ...evidence,
  mappings: [{ source, target: "ParentId" }],
});

const parseValid = (text: string) => {
  const parsed = parseLearnedRelationshipEvidence(text);
  if (parsed.kind !== "valid") assert.fail(parsed.message);
  return parsed;
};

const storePath = (directory: string, workspaceKey: string): string =>
  join(
    directory,
    `workspace-${createHash("sha256").update(workspaceKey).digest("hex")}.json`,
  );
