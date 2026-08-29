import assert from "node:assert/strict";
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
  resolveJoinRelationshipCandidate,
  resolvedJoinRelationshipIdentity,
  userConfirmedDefinition,
} from "../src/relationships/ResolvedJoinRelationship.js";
import { RelationshipProvenance } from "../src/relationships/RelationshipModels.js";

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
    key(1, "ProjectParent", "UQ_ProjectParent_ParentId", ["ParentId"]),
    key(1, "ProjectParent", "UQ_ProjectParent_CompanyParent", [
      "CompanyId",
      "ParentId",
    ]),
    key(4, "Employee", "UQ_Employee_EmployeeId", ["EmployeeId"]),
  ],
  foreignKeys: [],
  loadedAt: 1,
};

const index = new DatabaseIndex(metadata);
const scope: CompletionScope = {
  activeDatabase: "IntelliSenseLab",
  indexes: new Map([["intellisenselab", index]]),
};

const resolve = (markedSql: string, catalog: CompletionScope = scope) => {
  const cursor = markedSql.indexOf("|");
  assert.notEqual(cursor, -1, "test SQL needs a cursor marker");
  const sql = markedSql.replace("|", "");
  return resolveJoinRelationshipCandidate(
    sql,
    { start: cursor, end: cursor },
    catalog,
  );
};

test("contract: resolved JOIN model canonicalizes aliases and one equality", () => {
  const candidate = resolve(`
    SELECT *
    FROM qpacc.ProjectParent AS p
    JOIN qpacc.ProjectChild AS c
      ON c.ParentRef = p.Parent|Id
  `);
  assert.ok(candidate);
  assert.equal(candidate.endpointA.object.name, "ProjectParent");
  assert.equal(candidate.endpointA.qualifier, "p");
  assert.equal(candidate.endpointB.object.name, "ProjectChild");
  assert.equal(candidate.endpointB.qualifier, "c");
  assert.deepEqual(
    candidate.mappings.map((mapping) => [
      mapping.endpointAColumn.name,
      mapping.endpointBColumn.name,
    ]),
    [["ParentId", "ParentRef"]],
  );
  assert.equal(candidate.direction, "bToA");
});

test("resolved JOIN model preserves one deterministic composite relationship", () => {
  const forward = resolve(`
    SELECT * FROM qpacc.ProjectParent p
    JOIN qpacc.ProjectChild c
      ON c.CompanyId = p.CompanyId
     AND c.ParentRef = p.Parent|Id
  `);
  const reversedAndReordered = resolve(`
    SELECT * FROM qpacc.ProjectParent p
    JOIN qpacc.ProjectChild c
      ON p.ParentId = c.ParentRef
     AND p.Company|Id = c.CompanyId
  `);
  assert.ok(forward);
  assert.ok(reversedAndReordered);
  assert.equal(forward.mappings.length, 2);
  assert.equal(
    resolvedJoinRelationshipIdentity(forward),
    resolvedJoinRelationshipIdentity(reversedAndReordered),
  );
  assert.deepEqual(
    userConfirmedDefinition(
      forward,
      forward.direction === "ambiguous" ? "bToA" : forward.direction,
    ),
    {
      provenance: RelationshipProvenance.UserConfirmed,
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
    },
  );
});

test("resolved JOIN model supports quoted identifiers and meaningful self joins", () => {
  const quoted = resolve(`
    SELECT * FROM [qpacc].[ProjectParent] AS [p]
    JOIN [qpacc].[ProjectChild] AS [c]
      ON [c].[ParentRef] = [p].[Parent|Id]
  `);
  assert.ok(quoted);
  assert.equal(quoted.mappings[0]?.endpointAColumn.name, "ParentId");

  const self = resolve(`
    SELECT * FROM qpacc.Employee e
    JOIN qpacc.Employee manager
      ON e.ManagerId = manager.Employee|Id
  `);
  assert.ok(self);
  assert.equal(self.endpointA.object.id, self.endpointB.object.id);
  assert.deepEqual(
    self.mappings.map((mapping) => [
      mapping.endpointAColumn.name,
      mapping.endpointBColumn.name,
    ]),
    [["ManagerId", "EmployeeId"]],
  );
  assert.equal(self.direction, "aToB");
});

test("relationship direction remains ambiguous when canonical keys cannot decide it", () => {
  const candidate = resolve(`
    SELECT * FROM qpacc.ProjectChild c
    JOIN qpacc.ThirdTable t
      ON c.CompanyId = t.Company|Id
  `);
  assert.ok(candidate);
  assert.equal(candidate.direction, "ambiguous");
});

test("contract: unsafe JOIN shapes do not produce save candidates", () => {
  const predicates = [
    "c.ParentRef + 1 = p.ParentId",
    "ISNULL(c.ParentRef, 0) = p.ParentId",
    "c.ParentRef = p.ParentId OR c.LegacyRef = p.ParentId",
    "c.ParentRef > p.ParentId",
    "c.ParentRef = 1",
    "c.ParentRef = @ParentId",
    "missing.ParentRef = p.ParentId",
    "c.Missing = p.ParentId",
    "c.ParentRef = p.ParentId AND c.CompanyId = t.CompanyId",
    "c.ParentRef = p.ParentId AND c.ParentRef = p.ParentId",
  ];
  for (const predicate of predicates) {
    assert.equal(
      resolve(`
        SELECT * FROM qpacc.ProjectParent p
        JOIN qpacc.ThirdTable t ON t.CompanyId = p.CompanyId
        JOIN qpacc.ProjectChild c ON ${predicate}|
      `),
      undefined,
      predicate,
    );
  }
});

test("local RowSources and meaningless self identity do not produce candidates", () => {
  assert.equal(
    resolve(`
      WITH LocalRows AS (SELECT ParentId FROM qpacc.ProjectParent)
      SELECT * FROM LocalRows p
      JOIN qpacc.ProjectChild c ON c.ParentRef = p.Parent|Id
    `),
    undefined,
  );
  assert.equal(
    resolve(`
      SELECT * FROM qpacc.Employee e
      JOIN qpacc.Employee manager ON e.EmployeeId = manager.Employee|Id
    `),
    undefined,
  );
});

test("resolved JOIN action scope excludes unrelated ranges and cross-database edges", () => {
  assert.equal(
    resolve(`
      SELECT * FROM qpacc.ProjectParent p
      JOIN qpacc.ProjectChild c ON c.ParentRef = p.ParentId
      WHERE| c.ChildId > 0
    `),
    undefined,
  );

  const reporting = new DatabaseIndex({
    ...metadata,
    database: "Reporting",
    objects: [objects[1]!],
    keys: [],
  });
  const crossDatabaseScope: CompletionScope = {
    ...scope,
    indexes: new Map([...scope.indexes, ["reporting", reporting]]),
  };
  assert.equal(
    resolve(
      `
        SELECT * FROM IntelliSenseLab.qpacc.ProjectParent p
        JOIN Reporting.qpacc.ProjectChild c
          ON c.ParentRef = p.Parent|Id
      `,
      crossDatabaseScope,
    ),
    undefined,
  );
});
