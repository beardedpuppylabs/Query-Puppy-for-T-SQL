import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type {
  ColumnMetadata,
  DatabaseMetadata,
  DatabaseObject,
  KeyMetadata,
} from "../src/metadata/MetadataModels.js";
import type { SemanticCatalog } from "../src/parser/DocumentSemanticAnalyzer.js";
import {
  applyLearnedEvidenceMutation,
  applyLearnedRelationshipEvidenceSave,
  boundSeenOccurrences,
  createLearnedRelationshipEvidenceSave,
  knownRelationshipEvidenceIdentities,
  learnedDocumentIdentity,
  learnedEvidenceFromResolvedJoin,
  learnedEvidenceIdentity,
  LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION,
  MAX_LEARNED_RELATIONSHIP_EVIDENCE,
  MAX_LEARNED_RELATIONSHIP_SEEN_OCCURRENCES,
  parseLearnedRelationshipEvidence,
  serializeLearnedRelationshipEvidence,
  type LearnedRelationshipEvidenceDefinition,
  type LearnedRelationshipEvidenceDocument,
  type LearnedRelationshipEvidenceRecord,
  type LearnedRelationshipSeenOccurrence,
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
const scope: SemanticCatalog = {
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
  const crossDatabaseScope: SemanticCatalog = {
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

test("persisted occurrence identity rejects lifecycle formatting alias and offset inflation", () => {
  const document = learnedDocumentIdentity("sql/customer-report.sql");
  const first = evidence(compositeSql)[0]!;
  let state = emptyEvidenceDocument();
  state = observe(state, document, [first]);
  assert.equal(state.evidence[0]?.observationCount, 1);
  assert.equal(state.seenOccurrences.length, 1);

  state = observe(state, document, [first]);
  assert.equal(
    state.evidence[0]?.observationCount,
    1,
    "unchanged saves and recreated observers must not recount",
  );

  const reformatted = evidence(`SELECT 1;
SELECT *
FROM [QPACC].[PROJECTPARENT] AS [parent]
JOIN [qpacc].[projectchild] AS [customer]
  ON [parent].[PARENTID] = [customer].[parentref]
 AND [parent].[companyid] = [customer].[COMPANYID]`)[0]!;
  state = observe(state, document, [reformatted]);
  assert.equal(
    state.evidence[0]?.observationCount,
    1,
    "offset movement, formatting, quoting, alias changes, operand reversal, and AND order are semantic no-ops",
  );

  state = observe(state, document, [first, reformatted]);
  assert.equal(
    state.evidence[0]?.observationCount,
    2,
    "a second real occurrence has a distinct ordinal",
  );
  assert.deepEqual(
    state.seenOccurrences.map((occurrence) => occurrence.ordinal),
    [0, 1],
  );

  state = observe(state, document, []);
  assert.equal(state.evidence[0]?.observationCount, 2);
  assert.deepEqual(state.seenOccurrences, []);
  state = observe(state, document, [first]);
  assert.equal(
    state.evidence[0]?.observationCount,
    3,
    "a saved absence followed by reintroduction counts once without decrementing history",
  );
});

test("known canonical relationships remove and suppress redundant evidence", () => {
  const item = evidence(compositeSql)[0]!;
  const identity = learnedEvidenceIdentity(item);
  const document = learnedDocumentIdentity("known.sql");
  let observed = observe(emptyEvidenceDocument(), document, [item]);
  observed = observe(observed, learnedDocumentIdentity("known-elsewhere.sql"), [
    item,
  ]);
  assert.equal(observed.evidence[0]?.observationCount, 2);
  assert.equal(observed.seenOccurrences.length, 2);
  const save = createLearnedRelationshipEvidenceSave(
    document,
    [item],
    new Set([identity]),
  );
  assert.deepEqual(save.occurrences, []);
  assert.deepEqual([...save.removals], [identity]);
  const promoted = applyLearnedRelationshipEvidenceSave(observed, save);
  assert.deepEqual(promoted.evidence, []);
  assert.deepEqual(
    promoted.seenOccurrences,
    [],
    "promotion removes stale dedupe identities for this relationship across documents",
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
          observationCount: 3,
        };
      case RelationshipProvenance.HeuristicCandidate:
        return {
          ...shared,
          provenance,
          confidence: RelationshipConfidence.Candidate,
          evidence: [],
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

test("seen occurrence state uses a deterministic practical bound without changing evidence history", () => {
  const item = evidence(compositeSql)[0]!;
  let state = emptyEvidenceDocument();
  for (let ordinal = 0; ordinal < 4; ordinal++)
    state = applyLearnedRelationshipEvidenceSave(
      state,
      createLearnedRelationshipEvidenceSave(
        learnedDocumentIdentity(`document-${String(ordinal)}.sql`),
        [item],
        new Set(),
      ),
      MAX_LEARNED_RELATIONSHIP_EVIDENCE,
      3,
    );
  assert.equal(state.evidence[0]?.observationCount, 4);
  assert.equal(state.seenOccurrences.length, 3);
  assert.equal(
    state.seenOccurrences.some(
      (occurrence) =>
        occurrence.document === learnedDocumentIdentity("document-0.sql"),
    ),
    false,
    "the oldest insertion is evicted first",
  );
  assert.equal(
    boundSeenOccurrences(
      Array.from(
        { length: MAX_LEARNED_RELATIONSHIP_SEEN_OCCURRENCES + 1 },
        (_, ordinal): LearnedRelationshipSeenOccurrence => ({
          document: learnedDocumentIdentity(`bound-${String(ordinal)}.sql`),
          relationship: learnedDocumentIdentity("relationship"),
          ordinal: 0,
          order: ordinal + 1,
        }),
      ),
    ).length,
    MAX_LEARNED_RELATIONSHIP_SEEN_OCCURRENCES,
  );
  state = applyLearnedRelationshipEvidenceSave(
    state,
    createLearnedRelationshipEvidenceSave(
      learnedDocumentIdentity("document-0.sql"),
      [item],
      new Set(),
    ),
    MAX_LEARNED_RELATIONSHIP_EVIDENCE,
    3,
  );
  assert.equal(
    state.evidence[0]?.observationCount,
    5,
    "an identity may count again only after deterministic bounded eviction",
  );
});

test("file store reloads, serializes concurrent updates, isolates workspaces, and fails safely", async () => {
  const directory = await mkdtemp(join(tmpdir(), "query-puppy-evidence-"));
  try {
    const item = evidence(compositeSql)[0]!;
    const sameOccurrence = evidenceSave("reports/customer.sql", [item]);
    const secondDocument = evidenceSave("reports/second.sql", [item]);
    const thirdDocument = evidenceSave("reports/third.sql", [item]);
    const store = new FileLearnedRelationshipEvidenceStore(directory);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        store.update("workspace-a", sameOccurrence),
      ),
    );
    await Promise.all(
      [secondDocument, thirdDocument].map((save) =>
        store.update("workspace-a", save),
      ),
    );
    await store.update("workspace-b", sameOccurrence);
    const reloaded = new FileLearnedRelationshipEvidenceStore(directory);
    assert.equal(
      (await reloaded.update("workspace-a", sameOccurrence)).kind,
      "unchanged",
      "a recreated store must dedupe the unchanged occurrence",
    );
    const workspaceA = await reloaded.read("workspace-a");
    const workspaceB = await reloaded.read("workspace-b");
    assert.equal(workspaceA.kind, "valid");
    assert.equal(workspaceB.kind, "valid");
    assert.equal(workspaceA.evidence[0]?.observationCount, 3);
    assert.equal(workspaceA.seenOccurrences.length, 3);
    assert.equal(workspaceB.evidence[0]?.observationCount, 1);
    assert.equal(workspaceB.seenOccurrences.length, 1);

    const persisted = await readFile(
      storePath(directory, "workspace-a"),
      "utf8",
    );
    const persistedDocument = JSON.parse(persisted) as {
      readonly version: number;
      readonly seenOccurrences: readonly {
        readonly document: string;
        readonly relationship: string;
        readonly ordinal: number;
        readonly order: number;
      }[];
    };
    assert.equal(persistedDocument.version, 2);
    assert.equal(persistedDocument.seenOccurrences.length, 3);
    assert.ok(
      persistedDocument.seenOccurrences.every(
        (occurrence) =>
          /^[a-f\d]{64}$/u.test(occurrence.document) &&
          /^[a-f\d]{64}$/u.test(occurrence.relationship) &&
          occurrence.ordinal === 0 &&
          occurrence.order > 0,
      ),
    );
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
      [],
    );
    assert.doesNotMatch(
      persisted,
      /SELECT|JOIN|customer\.sql|reports\/|ProjectParent AS|literal-value|password|connection string|\/home\//i,
    );
    assert.equal(persisted.includes("observationCount"), true);
    const parsedPersisted = parseValid(persisted).document;
    assert.equal(
      serializeLearnedRelationshipEvidence(
        parsedPersisted.evidence,
        parsedPersisted.seenOccurrences,
      ),
      persisted,
    );

    const malformedPath = storePath(directory, "malformed-workspace");
    await writeFile(malformedPath, "{not-json", "utf8");
    const diagnostics: string[] = [];
    const malformed = new FileLearnedRelationshipEvidenceStore(
      directory,
      (message) => diagnostics.push(message),
    );
    assert.equal((await malformed.read("malformed-workspace")).kind, "invalid");
    assert.equal(
      (await malformed.update("malformed-workspace", sameOccurrence)).kind,
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
    assert.equal(cleared.kind, "valid");
    assert.deepEqual(cleared.evidence, []);
    assert.deepEqual(cleared.seenOccurrences, []);
    await store.update("workspace-b", sameOccurrence);
    const relearned = await store.read("workspace-b");
    assert.equal(relearned.kind, "valid");
    assert.equal(relearned.evidence[0]?.observationCount, 1);
    assert.equal(relearned.seenOccurrences.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("format version 1 preserves evidence counts and initializes occurrence state safely", async () => {
  const directory = await mkdtemp(join(tmpdir(), "query-puppy-evidence-v1-"));
  try {
    const item = evidence(compositeSql)[0]!;
    const legacy = JSON.stringify({
      version: 1,
      evidence: [{ ...item, observationCount: 7 }],
    });
    const parsed = parseValid(legacy);
    assert.equal(parsed.document.version, 2);
    assert.equal(parsed.document.evidence[0]?.observationCount, 7);
    assert.deepEqual(parsed.document.seenOccurrences, []);

    await writeFile(storePath(directory, "workspace"), legacy, "utf8");
    const store = new FileLearnedRelationshipEvidenceStore(directory);
    const loaded = await store.read("workspace");
    assert.equal(loaded.kind, "valid");
    assert.equal(loaded.evidence[0]?.observationCount, 7);
    assert.deepEqual(loaded.seenOccurrences, []);
    await store.update("workspace", evidenceSave("unrelated.sql", []));
    const upgraded = JSON.parse(
      await readFile(storePath(directory, "workspace"), "utf8"),
    ) as {
      readonly version: number;
      readonly evidence: readonly { readonly observationCount: number }[];
      readonly seenOccurrences: unknown[];
    };
    assert.equal(upgraded.version, 2);
    assert.equal(upgraded.evidence[0]?.observationCount, 7);
    assert.deepEqual(upgraded.seenOccurrences, []);
    await store.update("workspace", evidenceSave("legacy.sql", [item]));
    const observed = await store.read("workspace");
    assert.equal(observed.kind, "valid");
    assert.equal(observed.evidence[0]?.observationCount, 8);
    assert.equal(observed.seenOccurrences.length, 1);

    assert.equal(
      parseLearnedRelationshipEvidence(
        JSON.stringify({
          version: 2,
          evidence: [],
          seenOccurrences: [{ document: "plaintext-path" }],
        }),
      ).kind,
      "invalid",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("contract: a resolved qualifying candidate has the lowest production trust tier", () => {
  assert.equal(
    productionRelationshipRank({
      provenance: RelationshipProvenance.LearnedFromQuery,
      confidence: RelationshipConfidence.StrongEvidence,
      observationCount: 3,
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
    3,
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

const emptyEvidenceDocument = (): LearnedRelationshipEvidenceDocument => ({
  version: LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION,
  evidence: [],
  seenOccurrences: [],
});

const evidenceSave = (
  document: string,
  occurrences: readonly LearnedRelationshipEvidenceDefinition[],
) =>
  createLearnedRelationshipEvidenceSave(
    learnedDocumentIdentity(document),
    occurrences,
    new Set(),
  );

const observe = (
  state: LearnedRelationshipEvidenceDocument,
  document: string,
  occurrences: readonly LearnedRelationshipEvidenceDefinition[],
): LearnedRelationshipEvidenceDocument =>
  applyLearnedRelationshipEvidenceSave(
    state,
    createLearnedRelationshipEvidenceSave(document, occurrences, new Set()),
  );

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
