import assert from "node:assert/strict";
import * as vscode from "vscode";
import { DatabaseIndex } from "../../src/metadata/DatabaseIndex.js";

const database = "IntelliSenseLab";
const index = new DatabaseIndex({
  database,
  schemas: ["billing", "reporting", "dbo", "sales", "reltest"],
  loadedAt: 0,
  objects: [
    {
      id: 1,
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CustomerId",
          normalizedName: "customerid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "CustomerCode",
          normalizedName: "customercode",
          type: { name: "nvarchar", maxLength: 40 },
          nullable: false,
          ordinal: 2,
        },
      ],
    },
    {
      id: 2,
      schema: "sales",
      name: "CustomerOrders",
      normalizedName: "customerorders",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CustomerOrderId",
          normalizedName: "customerorderid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "OrderNumber",
          normalizedName: "ordernumber",
          type: { name: "nvarchar", maxLength: 40 },
          nullable: false,
          ordinal: 2,
        },
      ],
    },
    {
      schema: "dbo",
      name: "CustomerAddresses",
      normalizedName: "customeraddresses",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CustomerAddressId",
          normalizedName: "customeraddressid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "AddressLabel",
          normalizedName: "addresslabel",
          type: { name: "nvarchar", maxLength: 100 },
          nullable: true,
          ordinal: 2,
        },
      ],
    },
    {
      id: 4,
      schema: "billing",
      name: "BillingAddresses",
      normalizedName: "billingaddresses",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "BillingAddressId",
          normalizedName: "billingaddressid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "BillingEmailAddress",
          normalizedName: "billingemailaddress",
          type: { name: "nvarchar", maxLength: 400 },
          nullable: true,
          ordinal: 2,
        },
      ],
    },
    {
      schema: "billing",
      name: "CalculateBillingTotal_0001",
      normalizedName: "calculatebillingtotal_0001",
      kind: "scalarFunction",
      columns: [],
      parameters: [
        {
          name: "@NetAmount",
          type: { name: "decimal", precision: 18, scale: 2 },
          output: false,
          ordinal: 1,
        },
        {
          name: "@TaxRate",
          type: { name: "decimal", precision: 9, scale: 4 },
          output: false,
          ordinal: 2,
        },
      ],
      returnType: { name: "decimal", precision: 18, scale: 2 },
    },
    {
      schema: "reporting",
      name: "GetCustomerAddresses_0001",
      normalizedName: "getcustomeraddresses_0001",
      kind: "tableValuedFunction",
      columns: [],
      parameters: [
        {
          name: "@CustomerId",
          type: { name: "bigint" },
          output: false,
          ordinal: 1,
        },
      ],
    },
    {
      id: 11,
      schema: "reltest",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CustomerId",
          normalizedName: "customerid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "CustomerCode",
          normalizedName: "customercode",
          type: { name: "varchar", maxLength: 50 },
          nullable: false,
          ordinal: 2,
        },
        {
          name: "ExternalKey",
          normalizedName: "externalkey",
          type: { name: "uniqueidentifier" },
          nullable: true,
          ordinal: 3,
        },
        {
          name: "BillingAddressId",
          normalizedName: "billingaddressid",
          type: { name: "bigint" },
          nullable: true,
          ordinal: 4,
        },
      ],
    },
    {
      id: 12,
      schema: "reltest",
      name: "OrderLines",
      normalizedName: "orderlines",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CompanyId",
          normalizedName: "companyid",
          type: { name: "int" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "OrderId",
          normalizedName: "orderid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 2,
        },
      ],
    },
    {
      id: 13,
      schema: "reltest",
      name: "OrderHeaders",
      normalizedName: "orderheaders",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CompanyId",
          normalizedName: "companyid",
          type: { name: "int" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "OrderId",
          normalizedName: "orderid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 2,
        },
      ],
    },
  ],
  keys: [
    {
      database,
      objectId: 11,
      schema: "reltest",
      objectName: "Customers",
      name: "PK_Customers",
      kind: "primaryKey",
      filtered: false,
      columns: [{ columnId: 1, columnName: "CustomerId", ordinal: 1 }],
    },
    {
      database,
      objectId: 11,
      schema: "reltest",
      objectName: "Customers",
      name: "UQ_Customers_CustomerCode",
      kind: "uniqueConstraint",
      filtered: false,
      columns: [{ columnId: 2, columnName: "CustomerCode", ordinal: 1 }],
    },
    {
      database,
      objectId: 11,
      schema: "reltest",
      objectName: "Customers",
      name: "UX_Customers_ExternalKey",
      kind: "uniqueIndex",
      filtered: true,
      filterDefinition: "ExternalKey IS NOT NULL",
      columns: [{ columnId: 3, columnName: "ExternalKey", ordinal: 1 }],
    },
    {
      database,
      objectId: 12,
      schema: "reltest",
      objectName: "OrderLines",
      name: "PK_OrderLines",
      kind: "primaryKey",
      filtered: false,
      columns: [
        { columnId: 1, columnName: "CompanyId", ordinal: 1 },
        { columnId: 2, columnName: "OrderId", ordinal: 2 },
      ],
    },
  ],
  foreignKeys: [
    {
      database,
      id: 10,
      name: "FK_Customers_BillingAddress",
      parentObjectId: 11,
      parentSchema: "reltest",
      parentObjectName: "Customers",
      referencedObjectId: 4,
      referencedSchema: "billing",
      referencedObjectName: "BillingAddresses",
      columns: [
        {
          parentColumnId: 4,
          parentColumnName: "BillingAddressId",
          referencedColumnId: 1,
          referencedColumnName: "BillingAddressId",
          ordinal: 1,
        },
      ],
      deleteAction: "NO_ACTION",
      updateAction: "NO_ACTION",
      disabled: false,
      notTrusted: false,
    },
    {
      database,
      id: 11,
      name: "FK_OrderLines_OrderHeaders",
      parentObjectId: 12,
      parentSchema: "reltest",
      parentObjectName: "OrderLines",
      referencedObjectId: 13,
      referencedSchema: "reltest",
      referencedObjectName: "OrderHeaders",
      columns: [
        {
          parentColumnId: 1,
          parentColumnName: "CompanyId",
          referencedColumnId: 1,
          referencedColumnName: "CompanyId",
          ordinal: 1,
        },
        {
          parentColumnId: 2,
          parentColumnName: "OrderId",
          referencedColumnId: 2,
          referencedColumnName: "OrderId",
          ordinal: 2,
        },
      ],
      deleteAction: "NO_ACTION",
      updateAction: "NO_ACTION",
      disabled: false,
      notTrusted: false,
    },
  ],
});
const reportingDatabase = "IntelliSenseLabReporting";
const reportingIndex = new DatabaseIndex({
  database: reportingDatabase,
  schemas: ["dbo"],
  loadedAt: 0,
  objects: [
    {
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "ReportingCustomerId",
          normalizedName: "reportingcustomerid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "CustomerDisplayName",
          normalizedName: "customerdisplayname",
          type: { name: "nvarchar", maxLength: 200 },
          nullable: false,
          ordinal: 2,
        },
      ],
    },
  ],
});

async function signature(
  sql: string,
  triggerCharacter?: string,
  scheme: "untitled" | "file" = "untitled",
): Promise<vscode.SignatureHelp> {
  let document: vscode.TextDocument;
  if (scheme === "file") {
    const uri = vscode.Uri.file(
      `/tmp/improved-sql-signature-${String(Date.now())}.sql`,
    );
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(sql));
    document = await vscode.workspace.openTextDocument(uri);
  } else
    document = await vscode.workspace.openTextDocument({
      language: "sql",
      content: sql,
    });
  assert.equal(document.languageId, "sql");
  assert.equal(document.uri.scheme, scheme);
  const position = document.positionAt(sql.length);
  const result = await vscode.commands.executeCommand<vscode.SignatureHelp>(
    "vscode.executeSignatureHelpProvider",
    document.uri,
    position,
    triggerCharacter,
  );
  assert.ok(result, `registered provider returned no result for ${sql}`);
  return result;
}

async function completion(
  sql: string,
  cursor = sql.length,
): Promise<readonly string[]> {
  const document = await vscode.workspace.openTextDocument({
    language: "sql",
    content: sql,
  });
  const result = await vscode.commands.executeCommand<
    vscode.CompletionList | readonly vscode.CompletionItem[]
  >(
    "vscode.executeCompletionItemProvider",
    document.uri,
    document.positionAt(cursor),
    ".",
  );
  const items = result instanceof vscode.CompletionList ? result.items : result;
  return items.map((item) =>
    typeof item.label === "string" ? item.label : item.label.label,
  );
}

type MarkedCompletionItem = vscode.CompletionItem & {
  readonly data?: {
    readonly provider?: string;
    readonly semanticKind?: string;
  };
};
async function semanticCompletion(
  sql: string,
  cursor = sql.length,
): Promise<readonly MarkedCompletionItem[]> {
  const document = await vscode.workspace.openTextDocument({
    language: "sql",
    content: sql,
  });
  const result = await vscode.commands.executeCommand<vscode.CompletionList>(
    "improvedSqlIntellisense.test.provideCompletions",
    document,
    document.positionAt(cursor),
  );
  assert.ok(
    result,
    "direct Improved SQL IntelliSense provider returned no list",
  );
  const items = result.items as readonly MarkedCompletionItem[];
  assert.ok(
    items.every((item) => item.data?.provider === "improved-sql-intellisense"),
    "direct provider returned an unmarked completion item",
  );
  return items;
}
const labels = (items: readonly vscode.CompletionItem[]) =>
  items.map((item) =>
    typeof item.label === "string" ? item.label : item.label.label,
  );

type Invocation = {
  readonly triggerKind: vscode.SignatureHelpTriggerKind;
  readonly triggerCharacter?: string;
};
const takeInvocations = () =>
  vscode.commands.executeCommand<readonly Invocation[]>(
    "improvedSqlIntellisense.test.takeSignatureInvocations",
  );
async function waitForInvocation(
  character?: string,
  allowFallback = false,
): Promise<readonly Invocation[]> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const invocations = await takeInvocations();
    if (
      invocations.some(
        (invocation) =>
          (invocation.triggerKind ===
            vscode.SignatureHelpTriggerKind.TriggerCharacter &&
            (!character || invocation.triggerCharacter === character)) ||
          (allowFallback &&
            invocation.triggerKind === vscode.SignatureHelpTriggerKind.Invoke),
      )
    )
      return invocations;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension(
    "Bismarck.improved-sql-intellisense",
  );
  assert.ok(extension, "development extension was not discovered");
  await extension.activate();
  await vscode.commands.executeCommand(
    "improvedSqlIntellisense.test.setCompletionScope",
    {
      activeDatabase: database,
      indexes: new Map([
        [database.toLowerCase(), index],
        [reportingDatabase.toLowerCase(), reportingIndex],
      ]),
    },
  );
  await vscode.commands.executeCommand(
    "improvedSqlIntellisense.test.setSignatureScope",
    {
      activeDatabase: database,
      indexes: new Map([[database.toLowerCase(), index]]),
    },
  );

  for (const expectation of [
    ["SELECT c.customer FROM reltest.Customers c", "CustomerId", "PK"],
    ["SELECT c.customer FROM reltest.Customers c", "CustomerCode", "UQ"],
    ["SELECT c.billing FROM reltest.Customers c", "BillingAddressId", "FK"],
    ["SELECT c.external FROM reltest.Customers c", "ExternalKey", "UQ"],
    ["SELECT ol.company FROM reltest.OrderLines ol", "CompanyId", "PK · FK"],
  ] as const) {
    const sql = expectation[0];
    const cursor = sql.indexOf(" FROM");
    const item = (await semanticCompletion(sql, cursor)).find(
      (candidate) =>
        (typeof candidate.label === "string"
          ? candidate.label
          : candidate.label.label) === expectation[1],
    );
    assert.ok(item, `missing schema-intelligence candidate ${expectation[1]}`);
    assert.ok(
      typeof item.label !== "string" &&
        item.label.detail?.includes(expectation[2]),
    );
    assert.equal(item.insertText, expectation[1]);
    assert.equal(
      item.filterText,
      `${expectation[0].slice("SELECT ".length, expectation[0].indexOf(" FROM")).split(".")[1]} ${expectation[1]}`,
    );
    assert.match(item.sortText ?? "", /^\d{8}$/);
    assert.ok(item.range instanceof vscode.Range);
    if (expectation[2] === "FK") {
      const documentation = item.documentation;
      assert.ok(documentation instanceof vscode.MarkdownString);
      assert.match(documentation.value, /FK_Customers_BillingAddress/);
      assert.match(
        documentation.value,
        /billing\.BillingAddresses\.BillingAddressId/,
      );
    }
    if (expectation[1] === "ExternalKey") {
      const documentation = item.documentation;
      assert.ok(documentation instanceof vscode.MarkdownString);
      assert.match(documentation.value, /UX_Customers_ExternalKey/);
      assert.match(documentation.value, /ExternalKey IS NOT NULL/);
    }
  }
  const compositeSql = "SELECT ol.order FROM reltest.OrderLines ol";
  const compositeItem = (
    await semanticCompletion(compositeSql, compositeSql.indexOf(" FROM"))
  ).find(
    (item) =>
      (typeof item.label === "string" ? item.label : item.label.label) ===
      "OrderId",
  );
  assert.ok(compositeItem);
  assert.ok(compositeItem.documentation instanceof vscode.MarkdownString);
  assert.match(compositeItem.documentation.value, /FK_OrderLines_OrderHeaders/);
  assert.match(
    compositeItem.documentation.value,
    /CompanyId.*OrderHeaders\.CompanyId/s,
  );
  assert.match(
    compositeItem.documentation.value,
    /OrderId.*OrderHeaders\.OrderId/s,
  );

  const nestedSql = `SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o WHERE o.`;
  assert.deepEqual(
    (await completion(nestedSql)).filter((name) =>
      ["CustomerOrderId", "OrderNumber"].includes(name),
    ),
    ["CustomerOrderId", "OrderNumber"],
  );
  const correlated = `SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o WHERE c.`;
  assert.deepEqual(
    (await completion(correlated)).filter((name) =>
      ["CustomerId", "CustomerCode"].includes(name),
    ),
    ["CustomerCode", "CustomerId"],
  );
  const threeLevel = `SELECT * FROM dbo.Customers c
WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o
WHERE EXISTS (SELECT ca. FROM dbo.CustomerAddresses ca WHERE o. IS NULL AND c. IS NULL))`;
  assert.deepEqual(
    (await completion(threeLevel, threeLevel.indexOf("ca.") + 3)).filter(
      (name) => ["CustomerAddressId", "AddressLabel"].includes(name),
    ),
    ["AddressLabel", "CustomerAddressId"],
  );
  assert.deepEqual(
    (
      await completion(
        threeLevel,
        threeLevel.indexOf("WHERE o.") + "WHERE o.".length,
      )
    ).filter((name) => ["CustomerOrderId", "OrderNumber"].includes(name)),
    ["CustomerOrderId", "OrderNumber"],
  );
  assert.deepEqual(
    (await completion(threeLevel, threeLevel.indexOf("c.", 30) + 2)).filter(
      (name) => ["CustomerId", "CustomerCode"].includes(name),
    ),
    ["CustomerCode", "CustomerId"],
  );
  const sibling = `SELECT * FROM dbo.Customers c
WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o)
AND EXISTS (SELECT o. FROM dbo.CustomerAddresses ca)`;
  assert.equal(
    (await completion(sibling, sibling.indexOf("SELECT o.") + 9)).some((name) =>
      ["CustomerOrderId", "OrderNumber"].includes(name),
    ),
    false,
  );
  const leaked = `SELECT * FROM dbo.Customers c
WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o) AND o.`;
  assert.equal(
    (await completion(leaked, leaked.length)).some((name) =>
      ["CustomerOrderId", "OrderNumber"].includes(name),
    ),
    false,
  );
  const crossDatabase = `SELECT * FROM ${reportingDatabase}.dbo.Customers r
WHERE EXISTS (SELECT 1 FROM dbo.CustomerAddresses ca WHERE ca.CustomerAddressId = r.)`;
  assert.deepEqual(
    (await completion(crossDatabase, crossDatabase.indexOf("r.)") + 2)).filter(
      (name) => ["ReportingCustomerId", "CustomerDisplayName"].includes(name),
    ),
    ["CustomerDisplayName", "ReportingCustomerId"],
  );
  const closed = `SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o) AND o.`;
  assert.equal(
    (await completion(closed)).some((name) =>
      ["CustomerOrderId", "OrderNumber"].includes(name),
    ),
    false,
  );
  const derived = `SELECT * FROM dbo.Customers c JOIN (SELECT 1 FROM sales.CustomerOrders o WHERE c.`;
  assert.equal(
    (await completion(derived)).some((name) =>
      ["CustomerId", "CustomerCode"].includes(name),
    ),
    false,
  );
  const apply = `SELECT * FROM dbo.Customers c CROSS APPLY (SELECT 1 FROM sales.CustomerOrders o WHERE c.`;
  assert.deepEqual(
    (await completion(apply)).filter((name) =>
      ["CustomerId", "CustomerCode"].includes(name),
    ),
    ["CustomerCode", "CustomerId"],
  );
  const projectedApply = `SELECT lastOrder.
FROM dbo.Customers AS c
CROSS APPLY
(
  SELECT TOP 1 o.CustomerOrderId, o.OrderNumber
  FROM sales.CustomerOrders AS o
  WHERE o.CustomerOrderId = c.CustomerId
) AS lastOrder`;
  assert.deepEqual(
    (
      await completion(
        projectedApply,
        projectedApply.indexOf("lastOrder.") + "lastOrder.".length,
      )
    ).filter((name) => ["CustomerOrderId", "OrderNumber"].includes(name)),
    ["CustomerOrderId", "OrderNumber"],
  );
  const closedExists = `SELECT *
FROM dbo.Customers AS c
WHERE EXISTS
(
  SELECT 1
  FROM sales.CustomerOrders AS o
  WHERE o.CustomerOrderId = c.
);`;
  assert.deepEqual(
    (await completion(closedExists, closedExists.indexOf("c.") + 2)).filter(
      (name) => ["CustomerId", "CustomerCode"].includes(name),
    ),
    ["CustomerCode", "CustomerId"],
  );
  const closedApply = `SELECT *
FROM dbo.Customers AS c
CROSS APPLY
(
  SELECT TOP 1 o.CustomerOrderId, o.OrderNumber
  FROM sales.CustomerOrders AS o
  WHERE o.CustomerOrderId = c.
) AS lastOrder;`;
  assert.deepEqual(
    (await completion(closedApply, closedApply.indexOf("c.") + 2)).filter(
      (name) => ["CustomerId", "CustomerCode"].includes(name),
    ),
    ["CustomerCode", "CustomerId"],
  );
  const outerApply = closedApply.replace("CROSS APPLY", "OUTER APPLY");
  assert.deepEqual(
    (await completion(outerApply, outerApply.indexOf("c.") + 2)).filter(
      (name) => ["CustomerId", "CustomerCode"].includes(name),
    ),
    ["CustomerCode", "CustomerId"],
  );
  for (const sql of [closedExists, closedApply, outerApply]) {
    const items = await semanticCompletion(sql, sql.indexOf("c.") + 2);
    const coreItems = items.filter((item) =>
      ["CustomerCode", "CustomerId"].includes(
        typeof item.label === "string" ? item.label : item.label.label,
      ),
    );
    assert.deepEqual(labels(coreItems), ["CustomerCode", "CustomerId"]);
    assert.ok(
      coreItems.every(
        (item) =>
          item.kind === vscode.CompletionItemKind.Field &&
          item.data?.semanticKind === "column" &&
          typeof item.label !== "string" &&
          item.label.detail?.includes("NOT NULL") === true,
      ),
    );
  }
  const diagnosticDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: closedExists,
  });
  const diagnostic = await vscode.commands.executeCommand<string>(
    "improvedSqlIntellisense.test.diagnoseQueryScope",
    diagnosticDocument,
    diagnosticDocument.positionAt(closedExists.indexOf("c.") + 2),
  );
  assert.match(diagnostic, /Scope kind: correlatedExpressionSubquery/);
  assert.match(diagnostic, /Local RowSources: o -> CustomerOrders/);
  assert.match(diagnostic, /Eligible parents: c \(distance 1\) -> Customers/);
  assert.match(
    diagnostic,
    /Resolved RowSource: IntelliSenseLab\.dbo\.Customers/,
  );
  assert.match(diagnostic, /Semantic candidates: 2/);
  assert.deepEqual(
    labels(await semanticCompletion(threeLevel, threeLevel.indexOf("ca.") + 3)),
    ["AddressLabel", "CustomerAddressId"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        threeLevel,
        threeLevel.indexOf("WHERE o.") + "WHERE o.".length,
      ),
    ),
    ["CustomerOrderId", "OrderNumber"],
  );
  const setCte = `WITH X AS
(
  SELECT c.CustomerId AS Id, c.CustomerCode AS Value FROM dbo.Customers c
  UNION ALL
  SELECT b.BillingAddressId, b.BillingEmailAddress FROM billing.BillingAddresses b
)
SELECT x. FROM X x`;
  assert.deepEqual(
    labels(
      await semanticCompletion(setCte, setCte.indexOf("x.") + "x.".length),
    ),
    ["Id", "Value"],
  );
  const starSet = `WITH Combined AS
(
  SELECT c.* FROM ${database}.dbo.Customers AS c
  UNION ALL
  SELECT c2.* FROM ${database}.dbo.Customers AS c2
)
SELECT x. FROM Combined AS x`;
  const starSetItems = await semanticCompletion(
    starSet,
    starSet.indexOf("x.") + 2,
  );
  assert.deepEqual(labels(starSetItems), ["CustomerCode", "CustomerId"]);
  assert.ok(
    starSetItems.every(
      (item) =>
        item.kind === vscode.CompletionItemKind.Field &&
        item.data?.provider === "improved-sql-intellisense" &&
        item.data.semanticKind === "column" &&
        typeof item.label !== "string" &&
        item.label.detail?.includes("NOT NULL") === true,
    ),
  );
  const exactSecondBranch = `SELECT c.CustomerId, c.CustomerCode
FROM ${database}.dbo.Customers AS c
UNION ALL
SELECT b.CustomerId, b.
FROM ${database}.billing.BillingAddresses AS b`;
  const secondBranchItems = await semanticCompletion(
    exactSecondBranch,
    exactSecondBranch.indexOf("b.\n") + 2,
  );
  assert.deepEqual(labels(secondBranchItems), [
    "BillingAddressId",
    "BillingEmailAddress",
  ]);
  assert.ok(
    secondBranchItems.every(
      (item) =>
        item.kind === vscode.CompletionItemKind.Field &&
        item.data?.provider === "improved-sql-intellisense" &&
        typeof item.label !== "string" &&
        /bigint|nvarchar/.test(item.label.detail ?? ""),
    ),
  );
  const exactCorrelatedSet = `SELECT * FROM ${database}.dbo.Customers AS c
WHERE EXISTS
(
  SELECT 1 FROM ${database}.sales.CustomerOrders AS o
  WHERE o.CustomerOrderId = c.CustomerId
  UNION ALL
  SELECT 1 FROM ${database}.dbo.CustomerAddresses AS ca
  WHERE ca.CustomerAddressId = c.
)`;
  const correlatedSecondItems = await semanticCompletion(
    exactCorrelatedSet,
    exactCorrelatedSet.lastIndexOf("c.") + 2,
  );
  assert.deepEqual(labels(correlatedSecondItems), [
    "CustomerCode",
    "CustomerId",
  ]);
  assert.ok(
    correlatedSecondItems.every(
      (item) => item.data?.provider === "improved-sql-intellisense",
    ),
  );
  const selectExpression = `SELECT cust
FROM ${database}.dbo.Customers AS c`;
  assert.deepEqual(
    labels(
      await semanticCompletion(
        selectExpression,
        selectExpression.indexOf("cust") + 4,
      ),
    ),
    ["CustomerCode", "CustomerId"],
  );
  const whereExpression = `SELECT * FROM ${database}.dbo.Customers AS c
WHERE cust`;
  assert.deepEqual(labels(await semanticCompletion(whereExpression)), [
    "CustomerCode",
    "CustomerId",
  ]);
  const joinExpression = `SELECT * FROM ${database}.dbo.Customers AS c
JOIN ${database}.sales.CustomerOrders AS o ON o. AND c.`;
  assert.deepEqual(
    labels(
      await semanticCompletion(
        joinExpression,
        joinExpression.indexOf("ON o.") + "ON o.".length,
      ),
    ),
    ["CustomerOrderId", "OrderNumber"],
  );
  assert.deepEqual(
    labels(await semanticCompletion(joinExpression, joinExpression.length)),
    ["CustomerCode", "CustomerId"],
  );
  const positionalJoins = `SELECT * FROM ${database}.dbo.Customers c
JOIN ${database}.sales.CustomerOrders o ON c. AND o. AND ca.
JOIN ${database}.dbo.CustomerAddresses ca ON c. AND o. AND ca.
JOIN ${database}.billing.BillingAddresses b ON b.`;
  const positional = async (needle: string, occurrence = 0) => {
    let start = -1;
    for (let index = 0; index <= occurrence; index++)
      start = positionalJoins.indexOf(needle, start + 1);
    return labels(
      await semanticCompletion(positionalJoins, start + needle.length),
    );
  };
  assert.deepEqual(await positional("ON c."), ["CustomerCode", "CustomerId"]);
  assert.deepEqual(await positional("AND o."), [
    "CustomerOrderId",
    "OrderNumber",
  ]);
  assert.deepEqual(await positional("AND ca."), []);
  assert.deepEqual(await positional("ON c.", 1), [
    "CustomerCode",
    "CustomerId",
  ]);
  assert.deepEqual(await positional("AND o.", 1), [
    "CustomerOrderId",
    "OrderNumber",
  ]);
  assert.deepEqual(await positional("AND ca.", 1), [
    "AddressLabel",
    "CustomerAddressId",
  ]);
  assert.deepEqual(await positional("ON b."), [
    "BillingAddressId",
    "BillingEmailAddress",
  ]);
  for (const apply of ["CROSS APPLY", "OUTER APPLY"]) {
    const sql = `SELECT * FROM ${database}.dbo.Customers c
${apply} (SELECT c., future.) x
JOIN ${database}.sales.CustomerOrders future ON 1=1`;
    assert.deepEqual(
      labels(
        await semanticCompletion(
          sql,
          sql.indexOf("SELECT c.") + "SELECT c.".length,
        ),
      ),
      ["CustomerCode", "CustomerId"],
    );
    assert.deepEqual(
      labels(
        await semanticCompletion(
          sql,
          sql.indexOf("future.") + "future.".length,
        ),
      ),
      [],
    );
  }
  for (const clause of ["GROUP BY", "HAVING"]) {
    const sql = `SELECT c.CustomerCode AS Contact FROM ${database}.dbo.Customers c ${clause} cont`;
    assert.deepEqual(labels(await semanticCompletion(sql)), []);
  }
  const orderAlias = `SELECT c.CustomerCode AS Contact FROM ${database}.dbo.Customers c ORDER BY cont`;
  assert.deepEqual(labels(await semanticCompletion(orderAlias)), ["Contact"]);
  const setOrder = `SELECT c.CustomerId AS Id, c.CustomerCode AS Value FROM ${database}.dbo.Customers c
UNION ALL SELECT o.CustomerOrderId AS WrongId, o.OrderNumber AS WrongValue FROM ${database}.sales.CustomerOrders o
ORDER BY val`;
  assert.deepEqual(labels(await semanticCompletion(setOrder)), ["Value"]);
  const functionArgument = `SELECT ${database}.billing.CalculateBillingTotal_0001(cust, 0.19)
FROM ${database}.dbo.Customers c`;
  assert.deepEqual(
    labels(
      await semanticCompletion(
        functionArgument,
        functionArgument.indexOf("cust") + 4,
      ),
    ),
    ["CustomerCode", "CustomerId"],
  );
  const expressionDomain = `SELECT${" "}
FROM ${database}.dbo.Customers c`;
  const expressionItems = await semanticCompletion(
    expressionDomain,
    expressionDomain.indexOf("\n"),
  );
  assert.ok(
    expressionItems.some((item) => item.data?.semanticKind === "column"),
  );
  assert.ok(
    expressionItems.some(
      (item) => item.data?.semanticKind === "rowSourceAlias",
    ),
  );
  assert.ok(
    expressionItems.every(
      (item) =>
        ![
          "table",
          "view",
          "tableValuedFunction",
          "procedure",
          "schema",
          "database",
        ].includes(item.data?.semanticKind ?? ""),
    ),
  );
  const updateExpression = `UPDATE c SET CustomerCode = cust
FROM ${database}.dbo.Customers c`;
  assert.deepEqual(
    labels(
      await semanticCompletion(
        updateExpression,
        updateExpression.indexOf("cust") + 4,
      ),
    ),
    ["CustomerCode", "CustomerId"],
  );
  assert.ok(
    labels(
      await semanticCompletion(`SELECT * FROM ${database}.dbo.Cust`),
    ).includes("Customers"),
  );
  assert.deepEqual(
    labels(await semanticCompletion(`SELECT * FROM ${database}.dbo.Customers`)),
    ["AS c"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Customers AS c;
SELECT * FROM ${database}.dbo.Customers`,
      ),
    ),
    ["AS c"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Customers AS c
JOIN ${database}.dbo.CustomerAddresses`,
      ),
    ),
    ["AS ca"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Customers AS c
JOIN ${database}.dbo.Customers`,
      ),
    ),
    ["AS c2"],
  );
  const setDerived = `SELECT x. FROM
(
  SELECT c.CustomerId AS Id, c.CustomerCode AS Code FROM dbo.Customers c
  UNION
  SELECT b.BillingAddressId, b.BillingEmailAddress FROM billing.BillingAddresses b
) x`;
  assert.deepEqual(
    labels(
      await semanticCompletion(
        setDerived,
        setDerived.indexOf("x.") + "x.".length,
      ),
    ),
    ["Code", "Id"],
  );
  const setBranches = `SELECT c.CustomerId FROM dbo.Customers c
UNION ALL
SELECT b. FROM billing.BillingAddresses b WHERE c.`;
  assert.deepEqual(
    labels(
      await semanticCompletion(
        setBranches,
        setBranches.indexOf("b.") + "b.".length,
      ),
    ),
    ["BillingAddressId", "BillingEmailAddress"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        setBranches,
        setBranches.indexOf("WHERE c.") + "WHERE c.".length,
      ),
    ),
    [],
  );
  const correlatedSet = `SELECT * FROM dbo.Customers c WHERE EXISTS
(
  SELECT o.CustomerOrderId FROM sales.CustomerOrders o
  UNION ALL
  SELECT ca.CustomerAddressId FROM dbo.CustomerAddresses ca WHERE c.
)`;
  assert.deepEqual(
    labels(
      await semanticCompletion(
        correlatedSet,
        correlatedSet.indexOf("WHERE c.") + "WHERE c.".length,
      ),
    ),
    ["CustomerCode", "CustomerId"],
  );
  const crossDatabaseSet = `WITH X AS
(
  SELECT c.CustomerId AS Id, c.CustomerCode AS Value FROM dbo.Customers c
  UNION ALL
  SELECT r.ReportingCustomerId, r.CustomerDisplayName FROM ${reportingDatabase}.dbo.Customers r
)
SELECT x. FROM X x`;
  assert.deepEqual(
    labels(
      await semanticCompletion(
        crossDatabaseSet,
        crossDatabaseSet.indexOf("x.") + "x.".length,
      ),
    ),
    ["Id", "Value"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(threeLevel, threeLevel.indexOf("c.", 30) + 2),
    ),
    ["CustomerCode", "CustomerId"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(crossDatabase, crossDatabase.indexOf("r.)") + 2),
    ),
    ["CustomerDisplayName", "ReportingCustomerId"],
  );
  assert.deepEqual(labels(await semanticCompletion(derived)), []);
  assert.deepEqual(
    labels(await semanticCompletion(sibling, sibling.indexOf("SELECT o.") + 9)),
    [],
  );
  assert.deepEqual(labels(await semanticCompletion(leaked)), []);
  assert.deepEqual(labels(await semanticCompletion(correlated)), [
    "CustomerCode",
    "CustomerId",
  ]);
  assert.deepEqual(
    labels(
      await semanticCompletion(
        projectedApply,
        projectedApply.indexOf("lastOrder.") + "lastOrder.".length,
      ),
    ),
    ["CustomerOrderId", "OrderNumber"],
  );

  const hints = vscode.workspace
    .getConfiguration("editor")
    .get<boolean>("parameterHints.enabled");
  assert.equal(typeof hints, "boolean");
  console.log(
    `Extension Host SQL languageId=sql parameterHints.enabled=${String(hints)}`,
  );

  const scalar = await signature(
    `SELECT ${database}.billing.CalculateBillingTotal_0001(`,
    "(",
  );
  assert.equal(scalar.activeSignature, 0);
  assert.equal(scalar.activeParameter, 0);
  assert.match(scalar.signatures[0]?.label ?? "", /@NetAmount decimal\(18,2\)/);
  assert.match(scalar.signatures[0]?.label ?? "", /→ decimal\(18,2\)$/);
  const fileScalar = await signature(
    `SELECT ${database}.billing.CalculateBillingTotal_0001(`,
    "(",
    "file",
  );
  assert.equal(fileScalar.activeParameter, 0);

  const second = await signature(
    `SELECT ${database}.billing.CalculateBillingTotal_0001(100,`,
    ",",
  );
  assert.equal(second.activeParameter, 1);
  assert.match(String(second.signatures[0]?.parameters[1]?.label), /@TaxRate/);

  const nested = await signature(
    `SELECT ${database}.billing.CalculateBillingTotal_0001(COALESCE(100, 0),`,
    ",",
  );
  assert.equal(nested.activeParameter, 1);

  const tvf = await signature(
    `SELECT * FROM ${database}.reporting.GetCustomerAddresses_0001(`,
    "(",
  );
  assert.equal(tvf.activeParameter, 0);
  assert.match(
    String(tvf.signatures[0]?.parameters[0]?.label),
    /@CustomerId bigint/,
  );
  assert.match(tvf.signatures[0]?.label ?? "", /→ table$/);

  const explicit = await signature(
    `SELECT ${database}.billing.CalculateBillingTotal_0001(`,
  );
  assert.equal(explicit.activeParameter, 0);

  const interactive = await vscode.workspace.openTextDocument({
    language: "sql",
    content: `SELECT ${database}.billing.CalculateBillingTotal_0001`,
  });
  assert.equal(interactive.uri.scheme, "untitled");
  const editor = await vscode.window.showTextDocument(interactive);
  editor.selection = new vscode.Selection(
    interactive.positionAt(interactive.getText().length),
    interactive.positionAt(interactive.getText().length),
  );
  await takeInvocations();
  await vscode.commands.executeCommand("type", { text: "(" });
  const opening = await waitForInvocation("(", true);
  assert.ok(
    opening.length > 0,
    "typing '(' did not automatically invoke Signature Help",
  );
  assert.equal(
    editor.selection.active.character,
    `SELECT ${database}.billing.CalculateBillingTotal_0001(`.length,
    "post-edit selection was not between an auto-closing pair",
  );

  await vscode.commands.executeCommand("type", { text: "100" });
  await takeInvocations();
  await vscode.commands.executeCommand("type", { text: "," });
  const comma = await waitForInvocation(",", true);
  assert.ok(
    comma.length > 0,
    "typing ',' did not automatically retrigger Signature Help",
  );

  await takeInvocations();
  await vscode.commands.executeCommand("editor.action.triggerParameterHints");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const manual = await takeInvocations();
  assert.ok(
    manual.some(
      (invocation) =>
        invocation.triggerKind === vscode.SignatureHelpTriggerKind.Invoke,
    ),
    "editor.action.triggerParameterHints did not invoke the registered provider",
  );

  const automaticTvf = await vscode.workspace.openTextDocument({
    language: "sql",
    content: `SELECT * FROM ${database}.reporting.GetCustomerAddresses_0001`,
  });
  const tvfEditor = await vscode.window.showTextDocument(automaticTvf);
  tvfEditor.selection = new vscode.Selection(
    automaticTvf.positionAt(automaticTvf.getText().length),
    automaticTvf.positionAt(automaticTvf.getText().length),
  );
  await takeInvocations();
  await vscode.commands.executeCommand("type", { text: "(" });
  assert.ok(
    (await waitForInvocation("(", true)).length > 0,
    "typing '(' did not automatically invoke TVF Signature Help",
  );

  const autoClose = await vscode.workspace.openTextDocument({
    language: "sql",
    content: `SELECT ${database}.billing.CalculateBillingTotal_0001`,
  });
  const autoCloseEditor = await vscode.window.showTextDocument(autoClose);
  const autoCloseOffset = autoClose.getText().length;
  await takeInvocations();
  await autoCloseEditor.edit((builder) =>
    builder.insert(autoClose.positionAt(autoCloseOffset), "()"),
  );
  autoCloseEditor.selection = new vscode.Selection(
    autoClose.positionAt(autoCloseOffset + 1),
    autoClose.positionAt(autoCloseOffset + 1),
  );
  assert.ok(
    (await waitForInvocation(undefined, true)).length > 0,
    "auto-closing-pair edit did not invoke Signature Help",
  );

  const falseTrigger = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "SELECT ",
  });
  const falseEditor = await vscode.window.showTextDocument(falseTrigger);
  falseEditor.selection = new vscode.Selection(
    falseTrigger.positionAt(falseTrigger.getText().length),
    falseTrigger.positionAt(falseTrigger.getText().length),
  );
  await takeInvocations();
  await vscode.commands.executeCommand("type", { text: "(" });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(
    (await takeInvocations()).every(
      (invocation) =>
        invocation.triggerKind !== vscode.SignatureHelpTriggerKind.Invoke,
    ),
    "arbitrary parenthesis invoked the catalog-aware fallback",
  );
}
