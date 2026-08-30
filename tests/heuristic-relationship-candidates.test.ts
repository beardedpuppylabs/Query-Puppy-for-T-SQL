import assert from "node:assert/strict";
import test from "node:test";

import { createCandidates } from "../src/completion/CandidateFactory.js";
import { presentationModel } from "../src/completion/PresentationModel.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type {
  ColumnMetadata,
  DatabaseMetadata,
  DatabaseObject,
  KeyKind,
  KeyMetadata,
} from "../src/metadata/MetadataModels.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";
import {
  relationshipTargetNameForms,
  resolveHeuristicRelationshipCandidate,
} from "../src/relationships/HeuristicRelationshipCandidatePolicy.js";
import {
  productionRelationshipRank,
  RelationshipConfidence,
  RelationshipProvenance,
  type Relationship,
} from "../src/relationships/RelationshipModels.js";

const database = "IntelliSenseLab";
const schema = "qpacc";

const column = (
  name: string,
  ordinal: number,
  type = "int",
): ColumnMetadata => ({
  name,
  normalizedName: name.toLocaleLowerCase("en-US"),
  type: { name: type },
  nullable: false,
  ordinal,
});

const table = (
  id: number,
  name: string,
  columns: readonly ColumnMetadata[],
): DatabaseObject => ({
  id,
  schema,
  name,
  normalizedName: name.toLocaleLowerCase("en-US"),
  kind: "table",
  parameters: [],
  columns,
});

const key = (
  object: DatabaseObject,
  name: string,
  columns: readonly string[],
  kind: KeyKind = "primaryKey",
  filtered = false,
): KeyMetadata => ({
  database,
  objectId: object.id!,
  schema,
  objectName: object.name,
  name,
  kind,
  filtered,
  columns: columns.map((columnName, index) => ({
    columnId:
      object.columns.find((item) => item.name === columnName)?.ordinal ??
      index + 1,
    columnName,
    ordinal: index + 1,
  })),
});

const metadata = (
  objects: readonly DatabaseObject[],
  keys: readonly KeyMetadata[] = [],
): DatabaseMetadata => ({
  database,
  schemas: [schema],
  objects,
  keys,
  foreignKeys: [],
  loadedAt: 0,
});

const customers = table(1, "Customers", [column("Id", 1)]);
const orders = table(2, "Orders", [column("Id", 1), column("CustomerId", 2)]);

const policy = (
  source: DatabaseObject,
  target: DatabaseObject,
  keys: readonly KeyMetadata[],
  relationships: readonly Relationship[] = [],
) => {
  const index = new DatabaseIndex(
    metadata([source, target], keys),
    relationships,
  );
  return resolveHeuristicRelationshipCandidate(index, source, target);
};

test("contract: target-aware naming uses exact object+key and a narrow trailing-s variant", () => {
  assert.deepEqual(relationshipTargetNameForms("Customer"), ["customer"]);
  assert.deepEqual(relationshipTargetNameForms("Customers"), [
    "customers",
    "customer",
  ]);
  assert.deepEqual(relationshipTargetNameForms("Companies"), ["companies"]);
  assert.deepEqual(relationshipTargetNameForms("Addresses"), ["addresses"]);

  const candidate = policy(orders, customers, [
    key(customers, "PK_Customers", ["Id"]),
  ]);
  assert.ok(candidate);
  assert.equal(candidate.provenance, RelationshipProvenance.HeuristicCandidate);
  assert.equal(candidate.confidence, RelationshipConfidence.Candidate);
  assert.equal(productionRelationshipRank(candidate), 4);
  assert.deepEqual(candidate.mappings, [
    {
      sourceColumnName: "CustomerId",
      targetColumnName: "Id",
      sourceColumnId: 2,
      targetColumnId: 1,
      ordinal: 1,
    },
  ]);
  assert.deepEqual(
    candidate.evidence.map((evidence) => evidence.kind),
    ["completeTargetKey", "compatibleTypes", "targetAwareColumnName"],
  );
  assert.equal("declaredForeignKey" in candidate, false);
});

test("single-column weak, incompatible, unknown, and missing metadata fail closed", () => {
  const targetKey = key(customers, "PK_Customers", ["Id"]);
  const sameNameOnly = table(3, "Orders", [column("Id", 1)]);
  assert.equal(policy(sameNameOnly, customers, [targetKey]), undefined);

  const sameTypeOnly = table(6, "Orders", [column("Reference", 1)]);
  assert.equal(policy(sameTypeOnly, customers, [targetKey]), undefined);

  const incompatible = table(4, "Orders", [
    column("CustomerId", 1, "uniqueidentifier"),
  ]);
  assert.equal(policy(incompatible, customers, [targetKey]), undefined);

  const unknown = table(5, "Orders", [column("CustomerId", 1, "unknown")]);
  assert.equal(policy(unknown, customers, [targetKey]), undefined);
  assert.equal(policy(orders, customers, []), undefined);
  assert.equal(
    policy(orders, customers, [key(customers, "PK_Stale", ["Missing"])]),
    undefined,
  );
});

test("complete composite targets allow same-name ERP context only beside target-aware evidence", () => {
  const compositeCustomers = table(10, "Customers", [
    column("CompanyId", 1),
    column("Id", 2),
  ]);
  const compositeOrders = table(11, "Orders", [
    column("CompanyId", 1),
    column("OrderId", 2),
    column("CustomerId", 3),
  ]);
  const candidate = policy(compositeOrders, compositeCustomers, [
    key(compositeCustomers, "PK_Customers", ["CompanyId", "Id"]),
  ]);
  assert.ok(candidate);
  assert.deepEqual(
    candidate.mappings.map((mapping) => [
      mapping.sourceColumnName,
      mapping.targetColumnName,
    ]),
    [
      ["CompanyId", "CompanyId"],
      ["CustomerId", "Id"],
    ],
  );
  assert.deepEqual(
    candidate.evidence.map((evidence) => evidence.kind),
    [
      "completeTargetKey",
      "compatibleTypes",
      "targetAwareColumnName",
      "compositeContextMatch",
    ],
  );

  const incompleteOrders = table(12, "Orders", [column("CustomerId", 1)]);
  assert.equal(
    policy(incompleteOrders, compositeCustomers, [
      key(compositeCustomers, "PK_Customers", ["CompanyId", "Id"]),
    ]),
    undefined,
  );
});

test("identical composite keys and the classic ERP shape do not produce false confidence", () => {
  const parent = table(20, "TableA", [column("CompanyId", 1), column("Id", 2)]);
  const child = table(21, "TableB", [column("CompanyId", 1), column("Id", 2)]);
  assert.equal(
    policy(child, parent, [key(parent, "PK_TableA", ["CompanyId", "Id"])]),
    undefined,
  );

  const preislisten = table(22, "Preislisten", [
    column("Mandant", 1),
    column("ID", 2),
  ]);
  const artikel = table(23, "PreislistenArtikel", [
    column("Mandant", 1),
    column("ID", 2),
    column("ListeID", 3),
  ]);
  assert.equal(
    policy(artikel, preislisten, [
      key(preislisten, "PK_Preislisten", ["Mandant", "ID"]),
    ]),
    undefined,
  );
});

test("complete unfiltered unique targets qualify while filtered uniqueness does not", () => {
  const unique = key(customers, "UQ_Customers_Id", ["Id"], "uniqueConstraint");
  assert.ok(policy(orders, customers, [unique]));
  const uniqueIndex = key(customers, "UX_Customers_Id", ["Id"], "uniqueIndex");
  assert.ok(policy(orders, customers, [uniqueIndex]));
  assert.equal(
    policy(orders, customers, [
      { ...uniqueIndex, filtered: true, filterDefinition: "Id IS NOT NULL" },
    ]),
    undefined,
  );
});

test("ambiguous target keys, source assignments, and pair directions are suppressed", () => {
  const keyedCustomers = table(30, "Customers", [
    column("Id", 1),
    column("Key", 2),
  ]);
  const ambiguousKeysSource = table(31, "Orders", [
    column("CustomerId", 1),
    column("CustomerKey", 2),
  ]);
  assert.equal(
    policy(ambiguousKeysSource, keyedCustomers, [
      key(keyedCustomers, "PK_Customers", ["Id"]),
      key(keyedCustomers, "UQ_Customers_Key", ["Key"], "uniqueConstraint"),
    ]),
    undefined,
  );

  const ambiguousSource = table(32, "Orders", [
    column("CustomerId", 1),
    column("CustomersId", 2),
  ]);
  assert.equal(
    policy(ambiguousSource, customers, [
      key(customers, "PK_Customers", ["Id"]),
    ]),
    undefined,
  );

  const left = table(33, "Left", [column("RightId", 1), column("Id", 2)]);
  const right = table(34, "Right", [column("LeftId", 1), column("Id", 2)]);
  assert.equal(
    policy(left, right, [
      key(left, "PK_Left", ["Id"]),
      key(right, "PK_Right", ["Id"]),
    ]),
    undefined,
  );
});

test("every stronger provenance suppresses heuristic fallback for the whole pair", () => {
  const targetKey = key(customers, "PK_Customers", ["Id"]);
  const core = {
    source: {
      database,
      schema,
      objectName: orders.name,
      objectId: orders.id!,
    },
    target: {
      database,
      schema,
      objectName: customers.name,
      objectId: customers.id!,
    },
    mappings: [
      {
        sourceColumnName: "CustomerId",
        targetColumnName: "Id",
        ordinal: 1,
      },
    ],
  } as const;
  const stronger: readonly Relationship[] = [
    {
      ...core,
      provenance: RelationshipProvenance.DeclaredForeignKey,
      confidence: RelationshipConfidence.Authoritative,
      declaredForeignKey: {
        constraintId: 1,
        constraintName: "FK_Orders_Customers",
        deleteAction: "NO_ACTION",
        updateAction: "NO_ACTION",
        disabled: false,
        notTrusted: false,
      },
    },
    {
      ...core,
      provenance: RelationshipProvenance.UserConfirmed,
      confidence: RelationshipConfidence.Confirmed,
    },
    {
      ...core,
      provenance: RelationshipProvenance.ProjectDefined,
      confidence: RelationshipConfidence.Confirmed,
    },
    {
      ...core,
      provenance: RelationshipProvenance.LearnedFromQuery,
      confidence: RelationshipConfidence.StrongEvidence,
      observationCount: 3,
    },
  ];
  for (const relationship of stronger)
    assert.equal(
      policy(orders, customers, [targetKey], [relationship]),
      undefined,
    );
});

test("provider uses the canonical JOIN renderer but does not alter RowSource discovery", () => {
  const index = new DatabaseIndex(
    metadata([customers, orders], [key(customers, "PK_Customers", ["Id"])]),
  );
  const scope = {
    activeDatabase: database,
    indexes: new Map([[database.toLocaleLowerCase("en-US"), index]]),
  };
  const sql = "SELECT * FROM qpacc.Orders AS o JOIN qpacc.Customers AS c ON";
  const candidates = createCandidates(resolveSqlContext(sql), scope).filter(
    (candidate) => candidate.kind === "joinPredicate",
  );
  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.ok(candidate);
  assert.equal(candidate.name, "c.Id = o.CustomerId");
  assert.equal(candidate.insertText, "c.Id = o.CustomerId");
  assert.equal(candidate.relationship?.provenance, "heuristicCandidate");
  assert.equal(
    presentationModel(candidate, false).detail,
    " Heuristic relationship JOIN",
  );

  const discoverySql = "SELECT * FROM qpacc.Orders AS o JOIN qpacc.";
  const discovery = createCandidates(resolveSqlContext(discoverySql), scope);
  assert.deepEqual(
    discovery.map((candidate) => [
      candidate.name,
      candidate.priority,
      candidate.relatedRelationshipCount,
    ]),
    [
      ["Customers", undefined, undefined],
      ["Orders", undefined, undefined],
    ],
  );
  assert.equal(index.relationships.length, 0);
});

test("acceptance is text insertion only and explicit stronger truth suppresses later fallback", () => {
  const targetKey = key(customers, "PK_Customers", ["Id"]);
  const candidate = policy(orders, customers, [targetKey]);
  assert.ok(candidate);
  const before = JSON.stringify(metadata([customers, orders], [targetKey]));
  const sql = `SELECT * FROM qpacc.Orders o JOIN qpacc.Customers c ON c.Id = o.CustomerId`;
  assert.match(sql, /c\.Id = o\.CustomerId$/);
  assert.equal(
    JSON.stringify(metadata([customers, orders], [targetKey])),
    before,
  );
  const confirmed: Relationship = {
    provenance: RelationshipProvenance.UserConfirmed,
    confidence: RelationshipConfidence.Confirmed,
    source: candidate.source,
    target: candidate.target,
    mappings: candidate.mappings,
  };
  assert.equal(policy(orders, customers, [targetKey], [confirmed]), undefined);
});
