import assert from "node:assert/strict";
import test from "node:test";

import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type {
  DatabaseMetadata,
  ForeignKeyMetadata,
} from "../src/metadata/MetadataModels.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";
import {
  isDeclaredForeignKeyRelationship,
  productionRelationshipRank,
  relationshipFromForeignKey,
  RelationshipConfidence,
  RelationshipProvenance,
  type HeuristicCandidateRelationship,
  type LearnedFromQueryRelationship,
  type ProjectDefinedRelationship,
  type Relationship,
  type UserConfirmedRelationship,
} from "../src/relationships/RelationshipModels.js";

const objects: DatabaseMetadata["objects"] = [
  {
    id: 1,
    schema: "dbo",
    name: "OrderHeaders",
    normalizedName: "orderheaders",
    kind: "table",
    parameters: [],
    columns: [],
  },
  {
    id: 2,
    schema: "dbo",
    name: "OrderLines",
    normalizedName: "orderlines",
    kind: "table",
    parameters: [],
    columns: [],
  },
  {
    id: 3,
    schema: "dbo",
    name: "Products",
    normalizedName: "products",
    kind: "table",
    parameters: [],
    columns: [],
  },
];

const foreignKey: ForeignKeyMetadata = {
  database: "Db",
  id: 42,
  name: "FK_OrderLines_OrderHeaders",
  parentObjectId: 2,
  parentSchema: "dbo",
  parentObjectName: "OrderLines",
  referencedObjectId: 1,
  referencedSchema: "dbo",
  referencedObjectName: "OrderHeaders",
  columns: [
    {
      parentColumnId: 2,
      parentColumnName: "OrderId",
      referencedColumnId: 2,
      referencedColumnName: "OrderId",
      ordinal: 2,
    },
    {
      parentColumnId: 1,
      parentColumnName: "CompanyId",
      referencedColumnId: 1,
      referencedColumnName: "CompanyId",
      ordinal: 1,
    },
  ],
  deleteAction: "CASCADE",
  updateAction: "NO_ACTION",
  disabled: false,
  notTrusted: true,
};

const metadata: DatabaseMetadata = {
  database: "Db",
  schemas: ["dbo"],
  objects,
  foreignKeys: [foreignKey],
  loadedAt: 0,
};

const relationshipCore = {
  source: {
    database: "Db",
    schema: "dbo",
    objectName: "OrderLines",
    objectId: 2,
  },
  target: {
    database: "Db",
    schema: "dbo",
    objectName: "Products",
    objectId: 3,
  },
  mappings: [
    {
      sourceColumnName: "ProductId",
      targetColumnName: "ProductId",
      ordinal: 1,
    },
  ],
} as const;

test("declared foreign keys map to authoritative canonical relationships", () => {
  const relationship = relationshipFromForeignKey(foreignKey);
  assert.equal(
    relationship.provenance,
    RelationshipProvenance.DeclaredForeignKey,
  );
  assert.equal(relationship.confidence, RelationshipConfidence.Authoritative);
  assert.deepEqual(
    relationship.mappings.map((mapping) => [
      mapping.ordinal,
      mapping.sourceColumnName,
      mapping.targetColumnName,
    ]),
    [
      [1, "CompanyId", "CompanyId"],
      [2, "OrderId", "OrderId"],
    ],
  );
  assert.deepEqual(relationship.declaredForeignKey, {
    constraintId: 42,
    constraintName: "FK_OrderLines_OrderHeaders",
    deleteAction: "CASCADE",
    updateAction: "NO_ACTION",
    disabled: false,
    notTrusted: true,
  });
});

test("one canonical relationship instance serves both graph directions", () => {
  const index = new DatabaseIndex(metadata);
  const headers = index.findObject("dbo", "OrderHeaders")!;
  const lines = index.findObject("dbo", "OrderLines")!;
  const relationship = index.relationshipsBetween(headers, lines)[0];
  assert.ok(relationship);
  assert.equal(index.relationships.length, 1);
  assert.equal(index.outgoingRelationships(lines)[0], relationship);
  assert.equal(index.incomingRelationships(headers)[0], relationship);
  assert.equal(index.relationshipsBetween(lines, headers)[0], relationship);
});

test("multiple declared relationships remain distinct and input-order independent", () => {
  const alternate: ForeignKeyMetadata = {
    ...foreignKey,
    id: 7,
    name: "FK_OrderLines_OrderHeaders_Alternate",
    columns: [
      {
        parentColumnId: 3,
        parentColumnName: "AlternateOrderId",
        referencedColumnId: 2,
        referencedColumnName: "OrderId",
        ordinal: 1,
      },
    ],
  };
  const names = (foreignKeys: readonly ForeignKeyMetadata[]) => {
    const index = new DatabaseIndex({ ...metadata, foreignKeys });
    const headers = index.findObject("dbo", "OrderHeaders")!;
    const lines = index.findObject("dbo", "OrderLines")!;
    return index
      .relationshipsBetween(headers, lines)
      .flatMap((relationship) =>
        isDeclaredForeignKeyRelationship(relationship)
          ? [relationship.declaredForeignKey.constraintName]
          : [],
      );
  };
  const forward = names([foreignKey, alternate]);
  const reverse = names([alternate, foreignKey]);
  assert.equal(forward.length, 2);
  assert.deepEqual(forward, reverse);
});

test("future relationship provenances remain explicit and cannot fabricate FK details", () => {
  const projectDefined: ProjectDefinedRelationship = {
    ...relationshipCore,
    provenance: RelationshipProvenance.ProjectDefined,
    confidence: RelationshipConfidence.Confirmed,
  };
  const userConfirmed: UserConfirmedRelationship = {
    ...relationshipCore,
    provenance: RelationshipProvenance.UserConfirmed,
    confidence: RelationshipConfidence.Confirmed,
  };
  const learned: LearnedFromQueryRelationship = {
    ...relationshipCore,
    provenance: RelationshipProvenance.LearnedFromQuery,
    confidence: RelationshipConfidence.StrongEvidence,
  };
  const heuristic: HeuristicCandidateRelationship = {
    ...relationshipCore,
    provenance: RelationshipProvenance.HeuristicCandidate,
    confidence: RelationshipConfidence.Candidate,
  };
  const futureRelationships: readonly Relationship[] = [
    projectDefined,
    userConfirmed,
    learned,
    heuristic,
  ];
  for (const relationship of futureRelationships) {
    assert.equal(isDeclaredForeignKeyRelationship(relationship), false);
    assert.equal("declaredForeignKey" in relationship, false);
  }
  assert.equal(heuristic.confidence, RelationshipConfidence.Candidate);

  type InvalidHeuristicAuthority = Extract<
    Relationship,
    {
      provenance: typeof RelationshipProvenance.HeuristicCandidate;
      confidence: typeof RelationshipConfidence.Authoritative;
    }
  >;
  // @ts-expect-error The discriminated union makes this combination impossible.
  const invalidHeuristicAuthority: InvalidHeuristicAuthority = heuristic;
  assert.equal(invalidHeuristicAuthority, heuristic);
});

test("contract: confirmed relationships enter production while learned and heuristic sources stay excluded", () => {
  const projectDefined: ProjectDefinedRelationship = {
    ...relationshipCore,
    provenance: RelationshipProvenance.ProjectDefined,
    confidence: RelationshipConfidence.Confirmed,
  };
  const index = new DatabaseIndex({ ...metadata, foreignKeys: [] }, [
    projectDefined,
  ]);
  const lines = index.findObject("dbo", "OrderLines")!;
  const products = index.findObject("dbo", "Products")!;
  assert.equal(index.relationshipsBetween(lines, products)[0], projectDefined);
  const sql = "SELECT * FROM dbo.OrderLines ol JOIN dbo.Products p ON";
  const candidates = createCandidates(resolveSqlContext(sql), index);
  assert.equal(
    candidates.some((candidate) => candidate.kind === "joinPredicate"),
    true,
  );
  const userConfirmed: UserConfirmedRelationship = {
    ...relationshipCore,
    provenance: RelationshipProvenance.UserConfirmed,
    confidence: RelationshipConfidence.Confirmed,
  };
  const confirmedIndex = new DatabaseIndex({ ...metadata, foreignKeys: [] }, [
    userConfirmed,
  ]);
  assert.equal(
    createCandidates(resolveSqlContext(sql), confirmedIndex).some(
      (candidate) => candidate.kind === "joinPredicate",
    ),
    true,
  );
  assert.equal("declaredForeignKey" in userConfirmed, false);

  for (const relationship of [
    {
      ...relationshipCore,
      provenance: RelationshipProvenance.LearnedFromQuery,
      confidence: RelationshipConfidence.StrongEvidence,
    } as const,
    {
      ...relationshipCore,
      provenance: RelationshipProvenance.HeuristicCandidate,
      confidence: RelationshipConfidence.Candidate,
    } as const,
  ]) {
    const futureIndex = new DatabaseIndex({ ...metadata, foreignKeys: [] }, [
      relationship,
    ]);
    assert.equal(
      createCandidates(resolveSqlContext(sql), futureIndex).some(
        (candidate) => candidate.kind === "joinPredicate",
      ),
      false,
    );
  }

  const declaredRelationship = relationshipFromForeignKey(foreignKey);
  assert.deepEqual(
    [declaredRelationship, userConfirmed, projectDefined].map(
      productionRelationshipRank,
    ),
    [0, 1, 2],
  );
});
