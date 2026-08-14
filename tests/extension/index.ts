import assert from "node:assert/strict";
import * as vscode from "vscode";
import { DatabaseIndex } from "../../src/metadata/DatabaseIndex.js";

const database = "IntelliSenseLab";
const index = new DatabaseIndex({
  database,
  schemas: ["billing", "reporting", "dbo", "sales"],
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
    assert.deepEqual(labels(items), ["CustomerCode", "CustomerId"]);
    assert.ok(
      items.every(
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
