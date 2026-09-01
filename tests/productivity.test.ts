import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import {
  analyzeDocumentSemantics,
  resolveSelectWildcard,
  wildcardColumnExpressions,
} from "../src/parser/DocumentSemanticAnalyzer.js";
import {
  aliasFromObjectName,
  isPotentialSmartAliasTrigger,
  resolveSmartAliasContext,
} from "../src/parser/SmartAlias.js";
import {
  isPotentialJoinContinuationCompletionTrigger,
  isPotentialJoinOnCompletionTrigger,
  PendingCompletionTriggerState,
} from "../src/parser/AutomaticCompletionTrigger.js";
import { resolveRowSourceCompletionPhase } from "../src/parser/RowSourceCompletionPhase.js";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const columns = Array.from({ length: 200 }, (_, index) => ({
  name: `Column${String(index + 1)}`,
  normalizedName: `column${String(index + 1)}`,
  type: { name: "int" },
  nullable: false,
  ordinal: index + 1,
}));
const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo", "sales", "qpacc"],
  loadedAt: 0,
  objects: [
    {
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns,
    },
    {
      schema: "sales",
      name: "CustomerOrders",
      normalizedName: "customerorders",
      kind: "table",
      parameters: [],
      columns: columns.slice(0, 3),
    },
    {
      schema: "dbo",
      name: "Contacts",
      normalizedName: "contacts",
      kind: "table",
      parameters: [],
      columns: columns.slice(0, 2),
    },
    {
      schema: "dbo",
      name: "CustomerAddresses",
      normalizedName: "customeraddresses",
      kind: "table",
      parameters: [],
      columns: columns.slice(0, 4),
    },
    {
      schema: "qpacc",
      name: "OrderHeaders",
      normalizedName: "orderheaders",
      kind: "table",
      parameters: [],
      columns: columns.slice(0, 3),
    },
    ...["Belege", "BelegePositionen", "BelegePositionenDetails"].map(
      (name) => ({
        schema: "dbo",
        name,
        normalizedName: name.toLocaleLowerCase("en-US"),
        kind: "table" as const,
        parameters: [],
        columns: columns.slice(0, 2),
      }),
    ),
  ],
});
const catalog = { activeDatabase: "Db", indexes: new Map([["db", index]]) };

test("contract: projection wildcard resolution is strict and COUNT star is never expandable", () => {
  const sql = "SELECT c.* FROM dbo.Customers AS c";
  const expansion = resolveSelectWildcard(sql, sql.indexOf("*") + 1, catalog);
  assert.ok(expansion);
  assert.equal(expansion.qualification, "qualified");
  assert.equal(expansion.sources.length, 1);
  const source = expansion.sources[0];
  assert.ok(source);
  assert.equal(source.qualifier, "c");
  assert.equal(source.columns.length, 200);
  assert.equal(source.columns[0]?.name, "Column1");
  assert.equal(source.columns[199]?.name, "Column200");
  assert.deepEqual(wildcardColumnExpressions(expansion).slice(0, 2), [
    "c.Column1",
    "c.Column2",
  ]);
  for (const invalid of [
    "SELECT COUNT(*) FROM dbo.Customers",
    "SELECT '*' FROM dbo.Customers",
    "SELECT 2 * 3",
  ])
    assert.equal(
      resolveSelectWildcard(invalid, invalid.indexOf("*") + 1, catalog),
      undefined,
    );
});

test("plain wildcard preserves source order and aliases", () => {
  const sql =
    "SELECT * FROM dbo.Customers c JOIN dbo.Contacts co ON co.Column1 = c.Column1";
  const expansion = resolveSelectWildcard(sql, sql.indexOf("*") + 1, catalog);
  assert.ok(expansion);
  assert.equal(expansion.qualification, "qualified");
  assert.deepEqual(
    expansion.sources.map((source) => source.qualifier),
    ["c", "co"],
  );
  assert.deepEqual(
    expansion.sources.map((source) => source.columns.length),
    [200, 2],
  );
});

test("contract: wildcard qualification follows source count and explicit aliases", () => {
  const single = "SELECT * FROM dbo.Customers";
  const unaliased = resolveSelectWildcard(
    single,
    single.indexOf("*") + 1,
    catalog,
  );
  assert.ok(unaliased);
  assert.equal(unaliased.qualification, "unqualified");
  assert.equal(unaliased.sources[0]?.qualifier, "Customers");
  assert.deepEqual(wildcardColumnExpressions(unaliased).slice(0, 2), [
    "Column1",
    "Column2",
  ]);

  const aliasedSql = "SELECT * FROM dbo.Customers AS c";
  const aliased = resolveSelectWildcard(
    aliasedSql,
    aliasedSql.indexOf("*") + 1,
    catalog,
  );
  assert.ok(aliased);
  assert.equal(aliased.qualification, "qualified");
  assert.equal(aliased.sources[0]?.qualifier, "c");
  assert.deepEqual(wildcardColumnExpressions(aliased).slice(0, 2), [
    "c.Column1",
    "c.Column2",
  ]);

  const mixed =
    "SELECT * FROM dbo.Customers JOIN dbo.Contacts co ON co.Column1 = Customers.Column1";
  const multiple = resolveSelectWildcard(
    mixed,
    mixed.indexOf("*") + 1,
    catalog,
  );
  assert.ok(multiple);
  assert.equal(multiple.qualification, "qualified");
  assert.deepEqual(
    multiple.sources.map((source) => source.qualifier),
    ["Customers", "co"],
  );
  assert.deepEqual(wildcardColumnExpressions(multiple).slice(-2), [
    "co.Column1",
    "co.Column2",
  ]);
  assert.equal(wildcardColumnExpressions(multiple)[0], "Customers.Column1");
});

test("contract: local RowSource wildcard expansion preserves qualification policy", () => {
  const cte =
    "WITH X AS (SELECT Column1, Column2 FROM dbo.Customers) SELECT * FROM X";
  const unaliased = resolveSelectWildcard(
    cte,
    cte.indexOf("*", cte.indexOf("SELECT *")) + 1,
    catalog,
  );
  assert.ok(unaliased);
  assert.equal(unaliased.qualification, "unqualified");

  const aliasedCte = `${cte} AS x`;
  const aliased = resolveSelectWildcard(
    aliasedCte,
    aliasedCte.indexOf("*", aliasedCte.indexOf("SELECT *")) + 1,
    catalog,
  );
  assert.ok(aliased);
  assert.equal(aliased.qualification, "qualified");
  assert.equal(aliased.sources[0]?.qualifier, "x");

  const temp = "CREATE TABLE #T (Id int, Value int); SELECT * FROM #T";
  const tempExpansion = resolveSelectWildcard(
    temp,
    temp.indexOf("*") + 1,
    catalog,
  );
  assert.ok(tempExpansion);
  assert.equal(tempExpansion.qualification, "unqualified");
});

test("contract: wildcard expansion is isolated to its owning sequential statement", () => {
  const sql =
    "SELECT * FROM dbo.Customers AS c\nSELECT * FROM sales.CustomerOrders AS o";
  const first = resolveSelectWildcard(sql, sql.indexOf("*") + 1, catalog);
  const second = resolveSelectWildcard(sql, sql.lastIndexOf("*") + 1, catalog);
  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(
    first.sources.map((source) => source.qualifier),
    ["c"],
  );
  assert.deepEqual(
    second.sources.map((source) => source.qualifier),
    ["o"],
  );
  assert.deepEqual(wildcardColumnExpressions(second), [
    "o.Column1",
    "o.Column2",
    "o.Column3",
  ]);
});

test("smart aliases split names and avoid visible collisions", () => {
  assert.deepEqual(
    [
      "Customers",
      "CustomerOrders",
      "CustomerOrderLines",
      "customer_orders",
    ].map(aliasFromObjectName),
    ["c", "co", "col", "co"],
  );
  const sql = "SELECT * FROM dbo.Customers AS co JOIN sales.CustomerOrders ";
  const semantics = analyzeDocumentSemantics(sql, sql.length, catalog);
  assert.deepEqual(
    resolveSmartAliasContext(sql, sql.length, semantics, catalog),
    {
      objectName: "CustomerOrders",
      sourceName: "sales.CustomerOrders",
      alias: "co2",
      explicitAs: false,
    },
  );
  assert.equal(
    resolveSmartAliasContext("SELECT 1 ", 9, semantics, catalog),
    undefined,
  );
});

test("contract: Smart Alias starts only after a completed RowSource", () => {
  for (const sql of [
    "SELECT * FROM dbo.Belege",
    "SELECT * FROM dbo.BelegePos",
    "SELECT * FROM dbo.BelegePositionen",
  ])
    assert.equal(
      resolveSmartAliasContext(
        sql,
        sql.length,
        analyzeDocumentSemantics(sql, sql.length, catalog),
        catalog,
      ),
      undefined,
    );

  for (const [sql, objectName, alias, explicitAs] of [
    ["SELECT * FROM dbo.BelegePositionen ", "BelegePositionen", "bp", false],
    ["SELECT * FROM dbo.BelegePositionen AS ", "BelegePositionen", "bp", true],
    [
      "SELECT * FROM dbo.BelegePositionenDetails ",
      "BelegePositionenDetails",
      "bpd",
      false,
    ],
    ["SELECT * FROM Db.dbo.BelegePositionen ", "BelegePositionen", "bp", false],
  ] as const) {
    assert.deepEqual(
      resolveSmartAliasContext(
        sql,
        sql.length,
        analyzeDocumentSemantics(sql, sql.length, catalog),
        catalog,
      ),
      { objectName, sourceName: `dbo.${objectName}`, alias, explicitAs },
    );
  }

  for (const sql of [
    "SELECT * FROM dbo.BelegePositionen AS bp",
    "SELECT * FROM dbo.BelegePositionen bp",
  ])
    assert.equal(
      resolveSmartAliasContext(
        sql,
        sql.length,
        analyzeDocumentSemantics(sql, sql.length, catalog),
        catalog,
      ),
      undefined,
    );

  const activeIdentifier = "SELECT * FROM dbo.BelegePositionen";
  assert.equal(
    isPotentialSmartAliasTrigger(activeIdentifier, activeIdentifier.length),
    false,
  );
  for (const sql of [
    "SELECT * FROM dbo.BelegePositionen ",
    "SELECT * FROM dbo.BelegePositionen AS ",
    "SELECT * FROM dbo.Belege b JOIN dbo.BelegePositionen ",
    "SELECT * FROM dbo.Belege b JOIN dbo.BelegePositionen AS ",
  ])
    assert.equal(isPotentialSmartAliasTrigger(sql, sql.length), true);
  for (const sql of [
    "SELECT ",
    "SELECT * FROM dbo.BelegePositionen WHERE ",
    "SELECT * FROM dbo.Belege b JOIN dbo.BelegePositionen bp ",
    "SELECT b.BelegId ",
    "SELECT * FROM dbo.BelegePositionen -- comment ",
    "SELECT 'text '",
  ])
    assert.equal(isPotentialSmartAliasTrigger(sql, sql.length), false);
});

test("automatic JOIN ON completion trigger is scoped to new ON predicates", () => {
  for (const sql of [
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o ON ",
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o ON     ",
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o ON\n  ",
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o ON c.Id = o.Id AND ",
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o ON c.Id = o.Id OR ",
  ])
    assert.equal(
      isPotentialJoinOnCompletionTrigger(sql, sql.length),
      true,
      sql,
    );
  for (const sql of [
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o ON",
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o ON c.",
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o WHERE ",
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o ON 1 ",
    "SELECT * FROM dbo.Customers c JOIN dbo.CustomerOrders o ON c.Id = o.Id WHERE x = 1 AND ",
    "SELECT * FROM dbo.Customers c WHERE x = 1 AND ",
  ])
    assert.equal(
      isPotentialJoinOnCompletionTrigger(sql, sql.length),
      false,
      sql,
    );
});

test("contract: automatic completion state binds to the post-edit document version", () => {
  const state = new PendingCompletionTriggerState();
  const before = "SELECT * FROM dbo.BelegePositionen";
  const after = `${before} `;
  const pending = state.replace("file:///query.sql", 2, after, {
    rangeOffset: before.length,
    text: " ",
  });
  assert.equal(pending?.kind, "smartAlias");
  assert.equal(
    state.takeIfCurrent("file:///query.sql", 1, before.length),
    undefined,
  );
  assert.equal(
    state.takeIfCurrent("file:///query.sql", 2, after.length)?.kind,
    "smartAlias",
  );

  const onPrefix =
    "SELECT * FROM dbo.Customers c JOIN dbo.Orders o ON c.Id = o.Id AND";
  const continued = state.replace("file:///query.sql", 3, `${onPrefix} `, {
    rangeOffset: onPrefix.length,
    text: " ",
  });
  assert.equal(continued?.kind, "joinOnContinuation");

  for (const sql of ["UPDATE ", "INSERT INTO ", "DELETE FROM "])
    assert.equal(
      state.replace("file:///query.sql", 3, sql, {
        rangeOffset: sql.length - 1,
        text: " ",
      }),
      undefined,
      `${sql} must not force the native multi-provider Suggest Widget open`,
    );
  state.replace("file:///query.sql", 4, "DELETE FROM x", {
    rangeOffset: "DELETE FROM ".length,
    text: "x",
  });
  assert.equal(
    state.takeIfCurrent("file:///query.sql", 3, "DELETE FROM ".length),
    undefined,
  );
});

test("contract: JOIN source phases have deterministic alias and ON domains", () => {
  for (const join of [
    "JOIN",
    "INNER JOIN",
    "LEFT JOIN",
    "LEFT OUTER JOIN",
    "RIGHT JOIN",
    "RIGHT OUTER JOIN",
    "FULL JOIN",
    "FULL OUTER JOIN",
  ]) {
    const completedObject = `SELECT * FROM dbo.Customers c ${join} qpacc.OrderHeaders `;
    assert.equal(
      resolveRowSourceCompletionPhase(completedObject, completedObject.length)
        ?.kind,
      "completedObject",
      completedObject,
    );
    assert.equal(
      resolveSmartAliasContext(
        completedObject,
        completedObject.length,
        analyzeDocumentSemantics(
          completedObject,
          completedObject.length,
          catalog,
        ),
        catalog,
      )?.alias,
      "oh",
      completedObject,
    );
    assert.deepEqual(
      createCandidates(resolveSqlContext(completedObject), catalog).map(
        (candidate) => candidate.name,
      ),
      ["ON"],
      completedObject,
    );

    const explicitAs = `${completedObject}AS `;
    assert.equal(
      resolveRowSourceCompletionPhase(explicitAs, explicitAs.length)?.kind,
      "explicitAs",
      explicitAs,
    );
    assert.equal(
      resolveSmartAliasContext(
        explicitAs,
        explicitAs.length,
        analyzeDocumentSemantics(explicitAs, explicitAs.length, catalog),
        catalog,
      )?.alias,
      "oh",
      explicitAs,
    );
    assert.deepEqual(
      createCandidates(resolveSqlContext(explicitAs), catalog),
      [],
      explicitAs,
    );

    for (const source of [
      "qpacc.OrderHeaders oh ",
      "qpacc.OrderHeaders AS oh ",
    ]) {
      const sql = `SELECT * FROM dbo.Customers c ${join} ${source}`;
      assert.equal(
        resolveRowSourceCompletionPhase(sql, sql.length)?.kind,
        "completedAlias",
        sql,
      );
      assert.equal(
        isPotentialJoinContinuationCompletionTrigger(sql, sql.length),
        true,
        sql,
      );
      assert.deepEqual(
        createCandidates(resolveSqlContext(sql), catalog).map(
          (candidate) => candidate.name,
        ),
        ["ON"],
        sql,
      );
    }
  }
  for (const sql of [
    "SELECT * FROM dbo.Customers c CROSS JOIN sales.CustomerOrders ",
    "SELECT * FROM dbo.Customers c CROSS JOIN dbo.CustomerOrders o ",
    "SELECT * FROM dbo.Customers c CROSS APPLY dbo.CustomerOrders o ",
    "SELECT * FROM dbo.Customers c OUTER APPLY dbo.CustomerOrders o ",
  ]) {
    assert.equal(
      isPotentialJoinContinuationCompletionTrigger(sql, sql.length),
      false,
      sql,
    );
    assert.equal(
      createCandidates(resolveSqlContext(sql), catalog).some(
        (candidate) => candidate.name === "ON",
      ),
      false,
      sql,
    );
  }
});

test("contract: completed FROM phases never fall back to RowSource discovery", () => {
  const completed = "SELECT * FROM dbo.Customers ";
  assert.equal(
    resolveRowSourceCompletionPhase(completed, completed.length)?.kind,
    "completedObject",
  );
  assert.equal(
    resolveSmartAliasContext(
      completed,
      completed.length,
      analyzeDocumentSemantics(completed, completed.length, catalog),
      catalog,
    )?.alias,
    "c",
  );
  assert.deepEqual(createCandidates(resolveSqlContext(completed), catalog), []);

  const explicitAs = `${completed}AS `;
  assert.equal(
    resolveRowSourceCompletionPhase(explicitAs, explicitAs.length)?.kind,
    "explicitAs",
  );
  assert.deepEqual(
    createCandidates(resolveSqlContext(explicitAs), catalog),
    [],
  );
});

test("smart alias phase boundaries apply to supported JOIN source forms", () => {
  for (const join of [
    "JOIN",
    "CROSS JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "FULL JOIN",
  ]) {
    const sql = `SELECT * FROM dbo.Customers c ${join} dbo.BelegePositionen `;
    assert.equal(
      resolveSmartAliasContext(
        sql,
        sql.length,
        analyzeDocumentSemantics(sql, sql.length, catalog),
        catalog,
      )?.alias,
      "bp",
    );
  }
});

test("smart alias collision fallback remains deterministic in visible scope", () => {
  const sql =
    "SELECT * FROM dbo.Belege AS bpd JOIN dbo.BelegePositionenDetails ";
  assert.equal(
    resolveSmartAliasContext(
      sql,
      sql.length,
      analyzeDocumentSemantics(sql, sql.length, catalog),
      catalog,
    )?.alias,
    "bpd2",
  );
});

test("smart alias collisions are limited to the current visible query scope", () => {
  const isolated = "SELECT * FROM dbo.Customers ";
  assert.equal(
    resolveSmartAliasContext(
      isolated,
      isolated.length,
      analyzeDocumentSemantics(isolated, isolated.length, catalog),
      catalog,
    )?.alias,
    "c",
  );
  const separate =
    "SELECT * FROM dbo.Customers AS c; SELECT * FROM dbo.Customers ";
  assert.equal(
    resolveSmartAliasContext(
      separate,
      separate.length,
      analyzeDocumentSemantics(separate, separate.length, catalog),
      catalog,
    )?.alias,
    "c",
  );
  const implicitSeparate =
    "SELECT * FROM dbo.Customers AS c ORDER BY c.CustomerId\nSELECT * FROM dbo.Customers ";
  assert.equal(
    resolveSmartAliasContext(
      implicitSeparate,
      implicitSeparate.length,
      analyzeDocumentSemantics(
        implicitSeparate,
        implicitSeparate.length,
        catalog,
      ),
      catalog,
    )?.alias,
    "c",
  );
  const collision = "SELECT * FROM dbo.Customers AS c JOIN dbo.Contacts ";
  assert.equal(
    resolveSmartAliasContext(
      collision,
      collision.length,
      analyzeDocumentSemantics(collision, collision.length, catalog),
      catalog,
    )?.alias,
    "c2",
  );
  for (const [schema, objectName, alias] of [
    ["sales", "CustomerOrders", "co"],
    ["dbo", "CustomerAddresses", "ca"],
  ] as const) {
    const sql = `SELECT * FROM ${schema}.${objectName} `;
    assert.equal(
      resolveSmartAliasContext(
        sql,
        sql.length,
        analyzeDocumentSemantics(sql, sql.length, catalog),
        catalog,
      )?.alias,
      alias,
    );
  }
});
