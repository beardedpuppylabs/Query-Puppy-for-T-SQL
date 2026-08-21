import assert from "node:assert/strict";
import * as vscode from "vscode";
import { DatabaseIndex } from "../../src/metadata/DatabaseIndex.js";
import type { SqlType } from "../../src/metadata/MetadataModels.js";

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
          identity: true,
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
        {
          name: "PrimaryAddressId",
          normalizedName: "primaryaddressid",
          type: { name: "bigint" },
          nullable: true,
          ordinal: 5,
        },
        {
          name: "ShippingAddressId",
          normalizedName: "shippingaddressid",
          type: { name: "bigint" },
          nullable: true,
          ordinal: 6,
        },
        {
          name: "DisplayName",
          normalizedName: "displayname",
          type: { name: "nvarchar", maxLength: 400 },
          nullable: true,
          ordinal: 7,
        },
        {
          name: "RegionId",
          normalizedName: "regionid",
          type: { name: "int" },
          nullable: true,
          ordinal: 8,
        },
        {
          name: "CreatedAt",
          normalizedName: "createdat",
          type: { name: "datetime2", scale: 3 },
          nullable: false,
          ordinal: 9,
        },
        {
          name: "Amount",
          normalizedName: "amount",
          type: { name: "decimal", precision: 18, scale: 4 },
          nullable: false,
          ordinal: 10,
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
        {
          name: "AmountExact",
          normalizedName: "amountexact",
          type: { name: "decimal", precision: 38, scale: 18 },
          nullable: true,
          ordinal: 3,
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
        {
          name: "CustomerId",
          normalizedName: "customerid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 3,
        },
      ],
    },
    {
      id: 14,
      schema: "reltest",
      name: "Addresses",
      normalizedName: "addresses",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "AddressId",
          normalizedName: "addressid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
      ],
    },
    {
      id: 15,
      schema: "reltest",
      name: "Products",
      normalizedName: "products",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "ProductId",
          normalizedName: "productid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
      ],
    },
    {
      id: 16,
      schema: "reltest",
      name: "TypedTargets",
      normalizedName: "typedtargets",
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
          name: "ExternalReference",
          normalizedName: "externalreference",
          type: { name: "uniqueidentifier" },
          nullable: true,
          ordinal: 2,
        },
        {
          name: "Amount",
          normalizedName: "amount",
          type: { name: "decimal", precision: 18, scale: 2 },
          nullable: false,
          ordinal: 3,
        },
      ],
    },
    {
      id: 17,
      schema: "reltest",
      name: "CompletionLayoutStress",
      normalizedName: "completionlayoutstress",
      kind: "table",
      parameters: [],
      columns: [
        ["Amount", { name: "decimal", precision: 38, scale: 18 }, false],
        ["BinaryPayload", { name: "varbinary", maxLength: -1 }, true],
        ["Code", { name: "varchar", maxLength: 20 }, false],
        ["CustomerId", { name: "bigint" }, false],
        ["DisplayName", { name: "nvarchar", maxLength: 400 }, true],
        ["ExternalReference", { name: "uniqueidentifier" }, true],
        ["Id", { name: "bigint" }, false],
        ["OccurredAt", { name: "datetimeoffset", scale: 7 }, false],
        ["Payload", { name: "nvarchar", maxLength: -1 }, true],
        ["UniqueCustomerId", { name: "bigint" }, false],
        [
          "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
          { name: "nvarchar", maxLength: 200 },
          true,
        ],
      ].map(([name, type, nullable], ordinal) => ({
        name: name as string,
        normalizedName: (name as string).toLocaleLowerCase("en-US"),
        type: type as SqlType,
        nullable: nullable as boolean,
        ordinal: ordinal + 1,
      })),
    },
    {
      id: 30,
      schema: "dbo",
      name: "Belege",
      normalizedName: "belege",
      kind: "table",
      parameters: [],
      columns: [
        ["BelegId", { name: "bigint" }, false],
        ["Belegnummer", { name: "varchar", maxLength: 50 }, false],
        ["KundenId", { name: "bigint" }, true],
        ["Belegdatum", { name: "datetime2", scale: 3 }, false],
        ["Gesamtbetrag", { name: "decimal", precision: 18, scale: 2 }, true],
      ].map(([name, type, nullable], ordinal) => ({
        name: name as string,
        normalizedName: (name as string).toLocaleLowerCase("en-US"),
        type: type as SqlType,
        nullable: nullable as boolean,
        ordinal: ordinal + 1,
      })),
    },
    {
      id: 31,
      schema: "dbo",
      name: "BelegePositionen",
      normalizedName: "belegepositionen",
      kind: "table",
      parameters: [],
      columns: [
        ["BelegPositionId", { name: "bigint" }, false],
        ["BelegId", { name: "bigint" }, false],
        ["Positionsnummer", { name: "int" }, false],
        ["Artikelnummer", { name: "varchar", maxLength: 50 }, true],
        ["Menge", { name: "decimal", precision: 18, scale: 4 }, true],
        ["Einzelpreis", { name: "decimal", precision: 18, scale: 2 }, true],
      ].map(([name, type, nullable], ordinal) => ({
        name: name as string,
        normalizedName: (name as string).toLocaleLowerCase("en-US"),
        type: type as SqlType,
        nullable: nullable as boolean,
        ordinal: ordinal + 1,
      })),
    },
    {
      id: 32,
      schema: "dbo",
      name: "BelegePositionenDetails",
      normalizedName: "belegepositionendetails",
      kind: "table",
      parameters: [],
      columns: [
        ["BelegPositionDetailId", { name: "bigint" }, false],
        ["BelegPositionId", { name: "bigint" }, false],
        ["DetailCode", { name: "varchar", maxLength: 50 }, false],
        ["DetailValue", { name: "nvarchar", maxLength: 400 }, true],
      ].map(([name, type, nullable], ordinal) => ({
        name: name as string,
        normalizedName: (name as string).toLocaleLowerCase("en-US"),
        type: type as SqlType,
        nullable: nullable as boolean,
        ordinal: ordinal + 1,
      })),
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
    {
      database,
      objectId: 30,
      schema: "dbo",
      objectName: "Belege",
      name: "PK_Belege",
      kind: "primaryKey",
      filtered: false,
      columns: [{ columnId: 1, columnName: "BelegId", ordinal: 1 }],
    },
    {
      database,
      objectId: 31,
      schema: "dbo",
      objectName: "BelegePositionen",
      name: "PK_BelegePositionen",
      kind: "primaryKey",
      filtered: false,
      columns: [{ columnId: 1, columnName: "BelegPositionId", ordinal: 1 }],
    },
    {
      database,
      objectId: 31,
      schema: "dbo",
      objectName: "BelegePositionen",
      name: "UQ_BelegePositionen_Beleg_Position",
      kind: "uniqueConstraint",
      filtered: false,
      columns: [
        { columnId: 2, columnName: "BelegId", ordinal: 1 },
        { columnId: 3, columnName: "Positionsnummer", ordinal: 2 },
      ],
    },
    {
      database,
      objectId: 32,
      schema: "dbo",
      objectName: "BelegePositionenDetails",
      name: "PK_BelegePositionenDetails",
      kind: "primaryKey",
      filtered: false,
      columns: [
        { columnId: 1, columnName: "BelegPositionDetailId", ordinal: 1 },
      ],
    },
  ],
  foreignKeys: [
    {
      database,
      id: 10,
      name: "FK_reltest_Customers_BillingAddress",
      parentObjectId: 11,
      parentSchema: "reltest",
      parentObjectName: "Customers",
      referencedObjectId: 14,
      referencedSchema: "reltest",
      referencedObjectName: "Addresses",
      columns: [
        {
          parentColumnId: 4,
          parentColumnName: "BillingAddressId",
          referencedColumnId: 1,
          referencedColumnName: "AddressId",
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
      id: 12,
      name: "FK_reltest_Customers_PrimaryAddress",
      parentObjectId: 11,
      parentSchema: "reltest",
      parentObjectName: "Customers",
      referencedObjectId: 14,
      referencedSchema: "reltest",
      referencedObjectName: "Addresses",
      columns: [
        {
          parentColumnId: 5,
          parentColumnName: "PrimaryAddressId",
          referencedColumnId: 1,
          referencedColumnName: "AddressId",
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
      id: 13,
      name: "FK_reltest_Customers_ShippingAddress",
      parentObjectId: 11,
      parentSchema: "reltest",
      parentObjectName: "Customers",
      referencedObjectId: 14,
      referencedSchema: "reltest",
      referencedObjectName: "Addresses",
      columns: [
        {
          parentColumnId: 6,
          parentColumnName: "ShippingAddressId",
          referencedColumnId: 1,
          referencedColumnName: "AddressId",
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
      id: 14,
      name: "FK_reltest_OrderHeaders_Customer",
      parentObjectId: 13,
      parentSchema: "reltest",
      parentObjectName: "OrderHeaders",
      referencedObjectId: 11,
      referencedSchema: "reltest",
      referencedObjectName: "Customers",
      columns: [
        {
          parentColumnId: 3,
          parentColumnName: "CustomerId",
          referencedColumnId: 1,
          referencedColumnName: "CustomerId",
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
    {
      database,
      id: 30,
      name: "FK_BelegePositionen_Belege",
      parentObjectId: 31,
      parentSchema: "dbo",
      parentObjectName: "BelegePositionen",
      referencedObjectId: 30,
      referencedSchema: "dbo",
      referencedObjectName: "Belege",
      columns: [
        {
          parentColumnId: 2,
          parentColumnName: "BelegId",
          referencedColumnId: 1,
          referencedColumnName: "BelegId",
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
      id: 31,
      name: "FK_BelegePositionenDetails_BelegePositionen",
      parentObjectId: 32,
      parentSchema: "dbo",
      parentObjectName: "BelegePositionenDetails",
      referencedObjectId: 31,
      referencedSchema: "dbo",
      referencedObjectName: "BelegePositionen",
      columns: [
        {
          parentColumnId: 2,
          parentColumnName: "BelegPositionId",
          referencedColumnId: 1,
          referencedColumnName: "BelegPositionId",
          ordinal: 1,
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
    {
      id: 40,
      schema: "dbo",
      name: "Auftraege",
      normalizedName: "auftraege",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "AuftragId",
          normalizedName: "auftragid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
      ],
    },
    {
      id: 41,
      schema: "dbo",
      name: "AuftraegePositionen",
      normalizedName: "auftraegepositionen",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "AuftragPositionId",
          normalizedName: "auftragpositionid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "AuftragId",
          normalizedName: "auftragid",
          type: { name: "bigint" },
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
    item.kind === vscode.CompletionItemKind.Field &&
    typeof item.filterText === "string"
      ? item.filterText
      : typeof item.label === "string"
        ? item.label
        : item.label.label,
  );
}

type MarkedCompletionItem = vscode.CompletionItem & {
  readonly data?: {
    readonly provider?: string;
    readonly semanticKind?: string;
    readonly decorative?: string;
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
    "queryPuppyForTSql.test.provideCompletions",
    document,
    document.positionAt(cursor),
  );
  assert.ok(result, "direct Query Puppy for T-SQL provider returned no list");
  const items = result.items as readonly MarkedCompletionItem[];
  assert.ok(
    items.every((item) => item.data?.provider === "query-puppy-for-t-sql"),
    "direct provider returned an unmarked completion item",
  );
  return items;
}
async function registeredSemanticCompletion(
  sql: string,
  cursor = sql.length,
): Promise<readonly MarkedCompletionItem[]> {
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
  );
  const items = result instanceof vscode.CompletionList ? result.items : result;
  return items as readonly MarkedCompletionItem[];
}
const labels = (items: readonly vscode.CompletionItem[]) =>
  items.map((item) =>
    (item as MarkedCompletionItem).data?.semanticKind === "column" &&
    typeof item.filterText === "string"
      ? item.filterText
      : typeof item.label === "string"
        ? item.label
        : item.label.label,
  );

type Invocation = {
  readonly triggerKind: vscode.SignatureHelpTriggerKind;
  readonly triggerCharacter?: string;
};
const takeInvocations = () =>
  vscode.commands.executeCommand<readonly Invocation[]>(
    "queryPuppyForTSql.test.takeSignatureInvocations",
  );
const takeAutomaticAliasSuggestInvocations = () =>
  vscode.commands.executeCommand<number>(
    "queryPuppyForTSql.test.takeAutomaticAliasSuggestInvocations",
  );
async function waitForAutomaticAliasSuggest(): Promise<number> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const count = await takeAutomaticAliasSuggestInvocations();
    if (count > 0) return count;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}
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
    "BeardedPuppyLabs.query-puppy-for-t-sql",
  );
  assert.ok(extension, "development extension was not discovered");
  await extension.activate();
  await vscode.commands.executeCommand(
    "queryPuppyForTSql.test.setCompletionScope",
    {
      activeDatabase: database,
      indexes: new Map([
        [database.toLowerCase(), index],
        [reportingDatabase.toLowerCase(), reportingIndex],
      ]),
    },
  );
  await vscode.commands.executeCommand(
    "queryPuppyForTSql.test.setSignatureScope",
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
    ["SELECT ol.company FROM reltest.OrderLines ol", "CompanyId", "PK·FK"],
  ] as const) {
    const sql = expectation[0];
    const cursor = sql.indexOf(" FROM");
    const item = (await semanticCompletion(sql, cursor)).find(
      (candidate) => candidate.filterText === expectation[1],
    );
    assert.ok(item, `missing schema-intelligence candidate ${expectation[1]}`);
    assert.ok(
      typeof item.label === "string" && item.label.includes(expectation[2]),
    );
    assert.ok(
      typeof item.label === "string" &&
        item.label.indexOf(expectation[2]) < item.label.indexOf("NULL"),
    );
    assert.equal(item.insertText, expectation[1]);
    assert.equal(item.filterText, expectation[1]);
    assert.match(item.sortText ?? "", /^\d{8}$/);
    assert.ok(item.range instanceof vscode.Range);
    if (expectation[2] === "FK") {
      const documentation = item.documentation;
      assert.ok(documentation instanceof vscode.MarkdownString);
      assert.match(documentation.value, /FK_reltest_Customers_BillingAddress/);
      assert.match(documentation.value, /reltest\.Addresses\.AddressId/);
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
  ).find((item) => item.filterText === "OrderId");
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

  const joinPredicates = async (sql: string) =>
    (await semanticCompletion(sql)).filter(
      (item) => item.data?.semanticKind === "joinPredicate",
    );
  const predicateLabels = (items: readonly vscode.CompletionItem[]) =>
    labels(items);
  const offsetAt = (sql: string, position: vscode.Position) => {
    const lines = sql.split("\n");
    return (
      lines
        .slice(0, position.line)
        .reduce((sum, line) => sum + line.length + 1, 0) + position.character
    );
  };
  const accept = (sql: string, item: vscode.CompletionItem): string => {
    const range = item.range;
    assert.ok(range instanceof vscode.Range);
    const text =
      typeof item.insertText === "string"
        ? item.insertText
        : item.insertText?.value;
    assert.ok(text !== undefined);
    const edits = [
      ...(item.additionalTextEdits ?? []),
      vscode.TextEdit.replace(range, text),
    ].sort(
      (left, right) =>
        offsetAt(sql, right.range.start) - offsetAt(sql, left.range.start),
    );
    return edits.reduce(
      (result, edit) =>
        `${result.slice(0, offsetAt(sql, edit.range.start))}${edit.newText}${result.slice(offsetAt(sql, edit.range.end))}`,
      sql,
    );
  };
  const forwardJoin = await joinPredicates(
    "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON",
  );
  assert.deepEqual(predicateLabels(forwardJoin), [
    "oh.CustomerId = c.CustomerId",
  ]);
  assert.equal(forwardJoin[0]?.insertText, "oh.CustomerId = c.CustomerId");
  assert.ok(forwardJoin[0].documentation instanceof vscode.MarkdownString);
  assert.match(
    forwardJoin[0].documentation.value,
    /FK_reltest_OrderHeaders_Customer/,
  );
  assert.equal(
    accept(
      "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON",
      forwardJoin[0],
    ),
    "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON oh.CustomerId = c.CustomerId",
  );
  for (const whitespace of [" ", "     ", "\n        "]) {
    const sql = `SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON${whitespace}`;
    const item = (await joinPredicates(sql))[0];
    assert.ok(
      item,
      `missing JOIN predicate after whitespace ${JSON.stringify(whitespace)}`,
    );
    assert.equal(accept(sql, item), `${sql}oh.CustomerId = c.CustomerId`);
  }
  const partialSql =
    "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON oh.cust";
  const partialItem = (await joinPredicates(partialSql))[0];
  assert.ok(partialItem);
  assert.equal(
    accept(partialSql, partialItem),
    "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON oh.CustomerId = c.CustomerId",
  );
  assert.deepEqual(
    predicateLabels(
      await joinPredicates(
        "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.Customers c ON",
      ),
    ),
    ["c.CustomerId = oh.CustomerId"],
  );
  const compositeDirect =
    "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.OrderLines ol ON";
  const compositeDirectItem = (await joinPredicates(compositeDirect))[0];
  assert.ok(compositeDirectItem);
  assert.equal(
    accept(compositeDirect, compositeDirectItem),
    `${compositeDirect} ol.CompanyId = oh.CompanyId AND ol.OrderId = oh.OrderId`,
  );
  assert.equal(
    (
      await joinPredicates(
        "SELECT * FROM reltest.Customers c JOIN reltest.Addresses a ON",
      )
    ).length,
    3,
  );
  assert.deepEqual(
    predicateLabels(
      await joinPredicates(
        "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.OrderLines ol ON",
      ),
    ),
    ["ol.CompanyId = oh.CompanyId AND ol.OrderId = oh.OrderId"],
  );
  assert.equal(
    (
      await joinPredicates(
        "SELECT * FROM reltest.Customers c JOIN reltest.Products p ON",
      )
    ).length,
    0,
  );
  const rankedTables = await semanticCompletion(
    "SELECT * FROM reltest.Customers c JOIN reltest.",
  );
  const rankedLabels = labels(rankedTables);
  assert.ok(
    rankedLabels.indexOf("Addresses") < rankedLabels.indexOf("Products"),
  );
  const addressesItem = rankedTables.find(
    (item) =>
      (typeof item.label === "string" ? item.label : item.label.label) ===
      "Addresses",
  );
  assert.ok(addressesItem);
  assert.ok(
    typeof addressesItem.label !== "string" &&
      addressesItem.label.detail?.includes("related via 3 FKs"),
  );

  const typeAwareLabels = async (markedSql: string) => {
    const cursor = markedSql.indexOf("|");
    assert.ok(cursor >= 0, "type-aware SQL is missing its cursor marker");
    const sql = markedSql.replace("|", "");
    return labels(
      (await semanticCompletion(sql, cursor)).filter(
        (item) => item.data?.semanticKind,
      ),
    );
  };
  const markedTypeItems = async (markedSql: string) => {
    const cursor = markedSql.indexOf("|");
    assert.ok(cursor >= 0, "type-aware SQL is missing its cursor marker");
    return semanticCompletion(markedSql.replace("|", ""), cursor);
  };
  const isHeader = (item: MarkedCompletionItem) =>
    item.data?.decorative === "typeGroupHeader";
  const bigintMembers = await typeAwareLabels(
    "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.Customers c ON oh.CustomerId = c.|",
  );
  assert.deepEqual(bigintMembers.slice(0, 4), [
    "BillingAddressId",
    "CustomerId",
    "PrimaryAddressId",
    "ShippingAddressId",
  ]);
  assert.ok(
    bigintMembers.indexOf("RegionId") < bigintMembers.indexOf("CustomerCode"),
  );
  assert.ok(
    bigintMembers.indexOf("ExternalKey") >
      bigintMembers.indexOf("CustomerCode"),
  );
  assert.equal(bigintMembers.includes("ExternalKey"), true);

  const groupedBigint = await markedTypeItems(
    "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.Customers c ON oh.CustomerId = c.|",
  );
  const groupedLabels = labels(groupedBigint);
  assert.ok(
    groupedLabels.some((label) => label.includes("Type match · bigint")),
  );
  assert.ok(
    groupedLabels.some((label) => label.includes("Compatible numeric")),
  );
  assert.ok(
    groupedLabels.some((label) => label.includes("Other visible columns")),
  );
  const headers = groupedBigint.filter(isHeader);
  assert.equal(headers.length, 3);
  const groupedBilling = groupedBigint.find(
    (item) =>
      item.data?.semanticKind === "column" &&
      item.filterText === "BillingAddressId",
  );
  const groupedCustomer = groupedBigint.find(
    (item) =>
      item.data?.semanticKind === "column" && item.filterText === "CustomerId",
  );
  assert.ok(groupedBilling && typeof groupedBilling.label === "string");
  assert.match(groupedBilling.label, /FK\s+bigint\s+NULL/);
  assert.ok(groupedCustomer && typeof groupedCustomer.label === "string");
  assert.match(groupedCustomer.label, /PK\s+bigint\s+NOT NULL/);
  for (const header of headers) {
    assert.equal(header.insertText, "");
    assert.equal(header.preselect, false);
    assert.ok(header.range instanceof vscode.Range);
    assert.equal(header.range.isEmpty, true);
  }
  assert.equal(groupedBigint.find((item) => !isHeader(item))?.preselect, true);

  const varcharMembers = await typeAwareLabels(
    "SELECT * FROM reltest.Customers c WHERE c.CustomerCode = c.|",
  );
  assert.equal(varcharMembers[0], "CustomerCode");
  assert.ok(
    varcharMembers.indexOf("DisplayName") <
      varcharMembers.indexOf("ExternalKey"),
  );
  const guidMembers = await typeAwareLabels(
    "SELECT * FROM reltest.Customers c WHERE c.ExternalKey = c.|",
  );
  assert.equal(guidMembers[0], "ExternalKey");
  const dateMembers = await typeAwareLabels(
    "SELECT * FROM reltest.Customers c WHERE c.CreatedAt = c.|",
  );
  assert.equal(dateMembers[0], "CreatedAt");

  const functionMembers = await typeAwareLabels(
    "SELECT billing.CalculateBillingTotal_0001(c.|, 0.19) FROM reltest.Customers c",
  );
  assert.equal(functionMembers[0], "Amount");
  const incompleteBuiltinTemporal = await markedTypeItems(
    "SELECT DATEADD(day, 1, s.|\nFROM reltest.CompletionLayoutStress AS s CROSS JOIN reltest.Customers AS c;",
  );
  const temporalSemantic = incompleteBuiltinTemporal.filter(
    (item) => item.data?.semanticKind === "column",
  );
  assert.deepEqual(labels(temporalSemantic), [
    "OccurredAt",
    "Amount",
    "BinaryPayload",
    "Code",
    "CustomerId",
    "DisplayName",
    "ExternalReference",
    "Id",
    "Payload",
    "UniqueCustomerId",
    "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
  ]);
  assert.equal(
    temporalSemantic.some((item) => item.filterText === "ExternalKey"),
    false,
  );
  const occurredAt = temporalSemantic[0];
  assert.ok(occurredAt && typeof occurredAt.label === "string");
  assert.match(occurredAt.label, /datetimeoffset\(7\)\s+NOT NULL/);
  assert.equal(occurredAt.filterText, "OccurredAt");
  assert.equal(occurredAt.insertText, "OccurredAt");
  assert.ok(occurredAt.documentation instanceof vscode.MarkdownString);
  assert.match(occurredAt.documentation.value, /datetimeoffset\(7\)/);
  assert.ok(
    labels(incompleteBuiltinTemporal).some((label) =>
      label.includes("Compatible date/time"),
    ),
  );

  const incompleteBuiltinNumeric = await typeAwareLabels(
    "SELECT DATEADD(day, c.|\nFROM reltest.Customers AS c;",
  );
  assert.ok(
    incompleteBuiltinNumeric.indexOf("RegionId") <
      incompleteBuiltinNumeric.indexOf("CustomerCode"),
  );
  assert.ok(incompleteBuiltinNumeric.includes("ExternalKey"));

  const incompleteBuiltinString = await typeAwareLabels(
    "SELECT SUBSTRING(c.|\nFROM reltest.Customers AS c;",
  );
  assert.deepEqual(incompleteBuiltinString.slice(0, 2), [
    "CustomerCode",
    "DisplayName",
  ]);
  assert.ok(incompleteBuiltinString.includes("ExternalKey"));

  const incompleteBuiltinNested = await typeAwareLabels(
    "SELECT DATEADD(day, DATEDIFF(day, s.|\nFROM reltest.CompletionLayoutStress AS s;",
  );
  assert.equal(incompleteBuiltinNested[0], "OccurredAt");

  const incompleteUdf = await typeAwareLabels(
    "SELECT billing.CalculateBillingTotal_0001(s.|\nFROM reltest.CompletionLayoutStress AS s;",
  );
  assert.equal(incompleteUdf[0], "Amount");
  assert.ok(incompleteUdf.includes("OccurredAt"));
  const updateMembers = await typeAwareLabels(
    "UPDATE c SET ExternalKey = c.| FROM reltest.Customers c",
  );
  assert.equal(updateMembers[0], "ExternalKey");
  const updateAliasItems = await markedTypeItems(
    "UPDATE s SET ExternalReference = c.| FROM IntelliSenseLab.reltest.CompletionLayoutStress AS s CROSS JOIN IntelliSenseLab.reltest.Customers AS c;",
  );
  assert.equal(
    labels(updateAliasItems.filter((item) => item.data?.semanticKind))[0],
    "ExternalKey",
  );
  assert.ok(
    labels(updateAliasItems.filter((item) => item.data?.semanticKind)).includes(
      "CustomerId",
    ),
  );
  assert.ok(
    labels(updateAliasItems).some((label) =>
      label.includes("Type match · uniqueidentifier"),
    ),
  );
  assert.equal(
    labels(updateAliasItems).some((label) =>
      label.includes("uniqueidentifier("),
    ),
    false,
  );
  const groupedExternal = updateAliasItems.find(
    (item) =>
      item.data?.semanticKind === "column" && item.filterText === "ExternalKey",
  );
  assert.ok(groupedExternal && typeof groupedExternal.label === "string");
  assert.match(groupedExternal.label, /UQ\s+uniqueidentifier\s+NULL/);
  assert.ok(groupedExternal.documentation instanceof vscode.MarkdownString);
  assert.match(groupedExternal.documentation.value, /UX_Customers_ExternalKey/);
  const ordinaryExternal = (
    await markedTypeItems(
      "SELECT c.| FROM IntelliSenseLab.reltest.Customers AS c;",
    )
  ).find(
    (item) =>
      item.data?.semanticKind === "column" && item.filterText === "ExternalKey",
  );
  assert.ok(ordinaryExternal);
  assert.equal(ordinaryExternal.label, groupedExternal.label);
  assert.equal(ordinaryExternal.filterText, groupedExternal.filterText);
  assert.equal(ordinaryExternal.insertText, groupedExternal.insertText);
  assert.ok(ordinaryExternal.documentation instanceof vscode.MarkdownString);
  assert.equal(
    ordinaryExternal.documentation.value,
    groupedExternal.documentation.value,
  );
  const multipleUpdate = await typeAwareLabels(
    "UPDATE s SET CustomerId = c.CustomerId, ExternalReference = c.| FROM IntelliSenseLab.reltest.CompletionLayoutStress AS s CROSS JOIN IntelliSenseLab.reltest.Customers AS c;",
  );
  assert.equal(multipleUpdate[0], "ExternalKey");
  const multipleUpdateItems = await markedTypeItems(
    "UPDATE s SET CustomerId = c.CustomerId, ExternalReference = c.| FROM IntelliSenseLab.reltest.CompletionLayoutStress AS s CROSS JOIN IntelliSenseLab.reltest.Customers AS c;",
  );
  const multipleExternal = multipleUpdateItems.find(
    (item) =>
      item.data?.semanticKind === "column" && item.filterText === "ExternalKey",
  );
  assert.ok(multipleExternal);
  assert.equal(multipleExternal.label, groupedExternal.label);
  assert.ok(multipleExternal.documentation instanceof vscode.MarkdownString);
  assert.equal(
    multipleExternal.documentation.value,
    groupedExternal.documentation.value,
  );
  const firstAssignment = await markedTypeItems(
    "UPDATE s SET CustomerId = c.|, ExternalReference = c.ExternalKey FROM IntelliSenseLab.reltest.CompletionLayoutStress AS s CROSS JOIN IntelliSenseLab.reltest.Customers AS c;",
  );
  assert.ok(
    labels(firstAssignment).some((label) =>
      label.includes("Type match · bigint"),
    ),
  );
  assert.equal(
    labels(firstAssignment).some((label) => label.includes("bigint(")),
    false,
  );
  const numericUpdate = await typeAwareLabels(
    "UPDATE s SET CustomerId = c.| FROM IntelliSenseLab.reltest.CompletionLayoutStress AS s CROSS JOIN IntelliSenseLab.reltest.Customers AS c;",
  );
  assert.deepEqual(numericUpdate.slice(0, 4), [
    "BillingAddressId",
    "CustomerId",
    "PrimaryAddressId",
    "ShippingAddressId",
  ]);
  const thirdAssignment = await markedTypeItems(
    "UPDATE s SET CustomerId = c.CustomerId, ExternalReference = c.ExternalKey, Amount = ol.| FROM IntelliSenseLab.reltest.CompletionLayoutStress AS s CROSS JOIN IntelliSenseLab.reltest.Customers AS c CROSS JOIN IntelliSenseLab.reltest.OrderLines AS ol;",
  );
  assert.ok(
    labels(thirdAssignment).some((label) =>
      label.includes("Type match · decimal(38,18)"),
    ),
  );
  assert.equal(
    labels(thirdAssignment.filter((item) => item.data?.semanticKind))[0],
    "AmountExact",
  );
  const insertMembers = await typeAwareLabels(
    "INSERT INTO reltest.TypedTargets (CustomerId, ExternalReference, Amount) SELECT c.CustomerId, c.ExternalKey, c.| FROM reltest.Customers c",
  );
  assert.equal(insertMembers[0], "Amount");

  const containsTyped = await typeAwareLabels(
    "SELECT * FROM reltest.Customers c WHERE c.CustomerId = c.id|",
  );
  assert.deepEqual(containsTyped, [
    "BillingAddressId",
    "CustomerId",
    "PrimaryAddressId",
    "ShippingAddressId",
    "RegionId",
  ]);
  const unknownTyped = await typeAwareLabels(
    "SELECT c.| FROM reltest.Customers c",
  );
  assert.deepEqual(
    unknownTyped,
    [...unknownTyped].sort((a, b) => a.localeCompare(b)),
  );
  const untypedStress = await markedTypeItems(
    "SELECT s.| FROM reltest.CompletionLayoutStress AS s;",
  );
  assert.equal(untypedStress.some(isHeader), false);
  assert.deepEqual(labels(untypedStress), [
    "Amount",
    "BinaryPayload",
    "Code",
    "CustomerId",
    "DisplayName",
    "ExternalReference",
    "Id",
    "OccurredAt",
    "Payload",
    "UniqueCustomerId",
    "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
  ]);
  assert.deepEqual(
    untypedStress.map((item) => item.filterText),
    [
      "Amount",
      "BinaryPayload",
      "Code",
      "CustomerId",
      "DisplayName",
      "ExternalReference",
      "Id",
      "OccurredAt",
      "Payload",
      "UniqueCustomerId",
      "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
    ],
  );
  const longColumn = untypedStress.at(-1);
  assert.ok(longColumn);
  assert.ok(typeof longColumn.label === "string");
  const longVisibleName = longColumn.label.slice(0, 32);
  assert.equal(longVisibleName.length, 32);
  assert.match(longVisibleName, /…$/);
  assert.match(longColumn.label, /nvarchar\(100\)\s+NULL/);
  assert.equal(
    longColumn.filterText,
    "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
  );
  assert.equal(
    longColumn.insertText,
    "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
  );
  assert.ok(longColumn.documentation instanceof vscode.MarkdownString);
  assert.match(
    longColumn.documentation.value.replace(/\s+/g, ""),
    /VeryLongERPBusinessTransactionPostingReferenceIdentifier/,
  );
  assert.match(longColumn.documentation.value, /Posting\s{2}\nReference/);
  const longContains = await markedTypeItems(
    "SELECT s.reference| FROM reltest.CompletionLayoutStress AS s;",
  );
  assert.deepEqual(
    longContains.map((item) => item.filterText),
    [
      "ExternalReference",
      "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
    ],
  );
  assert.equal(
    longContains.find(
      (item) =>
        item.filterText ===
        "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
    )?.filterText,
    "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
  );

  const physicalByName = (
    items: readonly MarkedCompletionItem[],
    name: string,
  ) => items.find((item) => item.filterText === name);
  const visibleLabel = (item: MarkedCompletionItem | undefined) =>
    typeof item?.label === "string" ? item.label : (item?.label.label ?? "");
  const ordinaryCustomers = await markedTypeItems(
    "SELECT c.| FROM reltest.Customers AS c;",
  );
  const insertTargets = await markedTypeItems(
    "INSERT INTO reltest.Customers (|",
  );
  const updateTargets = await markedTypeItems("UPDATE reltest.Customers SET |");
  const insertedMembers = await markedTypeItems(
    "UPDATE reltest.Customers SET DisplayName=N'x' OUTPUT inserted.|",
  );
  const deletedMembers = await markedTypeItems(
    "DELETE FROM reltest.Customers OUTPUT deleted.|",
  );
  const equivalentFields = (
    left: MarkedCompletionItem,
    right: MarkedCompletionItem,
  ) => {
    assert.equal(right.label, left.label);
    assert.equal(right.filterText, left.filterText);
    assert.equal(right.insertText, left.insertText);
    assert.ok(left.documentation instanceof vscode.MarkdownString);
    assert.ok(right.documentation instanceof vscode.MarkdownString);
    assert.equal(right.documentation.value, left.documentation.value);
  };
  for (const name of ["CustomerCode", "ExternalKey", "BillingAddressId"]) {
    const ordinary = physicalByName(ordinaryCustomers, name);
    assert.ok(ordinary, `ordinary physical candidate missing ${name}`);
    for (const dmlItems of [insertTargets, updateTargets]) {
      const dml = physicalByName(dmlItems, name);
      assert.ok(dml, `writable DML candidate missing ${name}`);
      equivalentFields(ordinary, dml);
    }
  }
  assert.equal(physicalByName(insertTargets, "CustomerId"), undefined);
  assert.equal(physicalByName(updateTargets, "CustomerId"), undefined);
  for (const [items, source] of [
    [insertedMembers, "inserted"],
    [deletedMembers, "deleted"],
  ] as const)
    for (const name of [
      "CustomerId",
      "CustomerCode",
      "ExternalKey",
      "BillingAddressId",
    ]) {
      const ordinary = physicalByName(ordinaryCustomers, name);
      const pseudo = physicalByName(items, name);
      assert.ok(ordinary, `ordinary physical candidate missing ${name}`);
      assert.ok(pseudo, `${source} physical candidate missing ${name}`);
      equivalentFields(ordinary, pseudo);
    }
  assert.match(
    visibleLabel(physicalByName(insertedMembers, "CustomerId")),
    /PK/,
  );
  assert.match(
    visibleLabel(physicalByName(insertTargets, "CustomerCode")),
    /UQ/,
  );
  assert.match(
    visibleLabel(physicalByName(updateTargets, "BillingAddressId")),
    /FK/,
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
    ["ReportingCustomerId", "CustomerDisplayName"],
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
    labels(await semanticCompletion(derived)).some((name) =>
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
    ["CustomerId", "CustomerCode"],
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
    ["CustomerId", "CustomerCode"],
  );
  const outerApply = closedApply.replace("CROSS APPLY", "OUTER APPLY");
  assert.deepEqual(
    (await completion(outerApply, outerApply.indexOf("c.") + 2)).filter(
      (name) => ["CustomerId", "CustomerCode"].includes(name),
    ),
    ["CustomerId", "CustomerCode"],
  );
  for (const sql of [closedExists, closedApply, outerApply]) {
    const items = await semanticCompletion(sql, sql.indexOf("c.") + 2);
    const coreItems = items.filter(
      (item) =>
        item.data?.semanticKind === "column" &&
        ["CustomerCode", "CustomerId"].includes(
          typeof item.filterText === "string" ? item.filterText : "",
        ),
    );
    assert.deepEqual(labels(coreItems), ["CustomerId", "CustomerCode"]);
    assert.ok(
      coreItems.every(
        (item) =>
          item.kind === vscode.CompletionItemKind.Field &&
          item.data?.semanticKind === "column" &&
          typeof item.label === "string" &&
          item.label.includes("NOT NULL"),
      ),
    );
  }
  const diagnosticDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: closedExists,
  });
  const diagnostic = await vscode.commands.executeCommand<string>(
    "queryPuppyForTSql.test.diagnoseQueryScope",
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
        item.data?.provider === "query-puppy-for-t-sql" &&
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
        item.data?.provider === "query-puppy-for-t-sql" &&
        typeof item.label === "string" &&
        /bigint|nvarchar/.test(item.label),
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
  assert.deepEqual(
    labels(correlatedSecondItems.filter((item) => item.data?.semanticKind)),
    ["CustomerId", "CustomerCode"],
  );
  assert.ok(
    correlatedSecondItems.every(
      (item) => item.data?.provider === "query-puppy-for-t-sql",
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
      (
        await semanticCompletion(
          functionArgument,
          functionArgument.indexOf("cust") + 4,
        )
      ).filter((item) => item.data?.semanticKind),
    ),
    ["CustomerId", "CustomerCode"],
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
      (
        await semanticCompletion(
          updateExpression,
          updateExpression.indexOf("cust") + 4,
        )
      ).filter((item) => item.data?.semanticKind),
    ),
    ["CustomerCode", "CustomerId"],
  );
  assert.ok(
    labels(
      await semanticCompletion(`SELECT * FROM ${database}.dbo.Cust`),
    ).includes("Customers"),
  );
  const prefixFamilyItems = await semanticCompletion(
    `SELECT * FROM ${database}.dbo.Belege`,
  );
  assert.deepEqual(labels(prefixFamilyItems), [
    "Belege",
    "BelegePositionen",
    "BelegePositionenDetails",
  ]);
  for (const name of ["BelegePositionen", "BelegePositionenDetails"]) {
    const item = prefixFamilyItems.find(
      (candidate) => candidate.insertText === name,
    );
    assert.ok(item);
    assert.equal(item.data?.semanticKind, "table");
    assert.equal(item.filterText, `Belege ${name}`);
    assert.equal(item.insertText, name);
    assert.ok(item.range instanceof vscode.Range);
  }
  assert.equal(
    prefixFamilyItems.some(
      (item) => item.data?.semanticKind === "rowSourceAlias",
    ),
    false,
  );
  const aliasAfterWhitespaceSql = `SELECT * FROM ${database}.dbo.BelegePositionen `;
  const aliasAfterWhitespace = (
    await semanticCompletion(aliasAfterWhitespaceSql)
  ).filter((item) => item.data?.semanticKind === "rowSourceAlias");
  assert.deepEqual(labels(aliasAfterWhitespace), ["bp"]);
  const aliasAfterWhitespaceItem = aliasAfterWhitespace[0];
  assert.ok(aliasAfterWhitespaceItem);
  assert.equal(aliasAfterWhitespaceItem.filterText, "bp");
  assert.ok(
    aliasAfterWhitespaceItem.insertText instanceof vscode.SnippetString,
  );
  assert.equal(aliasAfterWhitespaceItem.insertText.value, "${1:bp}");
  assert.deepEqual(
    aliasAfterWhitespaceItem.range,
    new vscode.Range(
      0,
      aliasAfterWhitespaceSql.length,
      0,
      aliasAfterWhitespaceSql.length,
    ),
  );
  assert.deepEqual(
    labels(
      (await registeredSemanticCompletion(aliasAfterWhitespaceSql)).filter(
        (item) => item.detail === "alias for BelegePositionen",
      ),
    ),
    ["bp"],
  );

  const aliasAfterAsSql = `SELECT * FROM ${database}.dbo.BelegePositionen AS `;
  const aliasAfterAs = (await semanticCompletion(aliasAfterAsSql)).filter(
    (item) => item.data?.semanticKind === "rowSourceAlias",
  );
  assert.deepEqual(labels(aliasAfterAs), ["bp"]);
  const aliasAfterAsItem = aliasAfterAs[0];
  assert.ok(aliasAfterAsItem);
  assert.equal(aliasAfterAsItem.filterText, "bp");
  assert.ok(aliasAfterAsItem.insertText instanceof vscode.SnippetString);
  assert.equal(aliasAfterAsItem.insertText.value, "${1:bp}");
  assert.deepEqual(
    aliasAfterAsItem.range,
    new vscode.Range(0, aliasAfterAsSql.length, 0, aliasAfterAsSql.length),
  );
  assert.deepEqual(
    labels(
      (await registeredSemanticCompletion(aliasAfterAsSql)).filter(
        (item) => item.detail === "alias for BelegePositionen",
      ),
    ),
    ["bp"],
  );

  const deepAlias = (
    await semanticCompletion(
      `SELECT * FROM ${database}.dbo.BelegePositionenDetails `,
    )
  ).filter((item) => item.data?.semanticKind === "rowSourceAlias");
  assert.deepEqual(labels(deepAlias), ["bpd"]);

  const collisionAlias = (
    await semanticCompletion(
      `SELECT * FROM ${database}.dbo.Belege AS bpd JOIN ${database}.dbo.BelegePositionenDetails `,
    )
  ).filter((item) => item.data?.semanticKind === "rowSourceAlias");
  assert.deepEqual(labels(collisionAlias), ["bpd2"]);

  for (const sql of [
    `SELECT * FROM ${database}.dbo.BelegePositionen AS bp`,
    `SELECT * FROM ${database}.dbo.BelegePositionen bp`,
  ])
    assert.equal(
      (await semanticCompletion(sql)).some(
        (item) => item.data?.semanticKind === "rowSourceAlias",
      ),
      false,
    );

  const crossDatabaseAlias = (
    await semanticCompletion(
      `SELECT * FROM ${reportingDatabase}.dbo.AuftraegePositionen `,
    )
  ).filter((item) => item.data?.semanticKind === "rowSourceAlias");
  assert.deepEqual(labels(crossDatabaseAlias), ["ap"]);

  for (const sql of [
    `SELECT * FROM ${database}.dbo.BelegePositionen`,
    `SELECT * FROM ${database}.dbo.BelegePositionen AS`,
  ]) {
    const document = await vscode.workspace.openTextDocument({
      language: "sql",
      content: sql,
    });
    const editor = await vscode.window.showTextDocument(document);
    const end = document.positionAt(document.getText().length);
    editor.selection = new vscode.Selection(end, end);
    await takeAutomaticAliasSuggestInvocations();
    await vscode.commands.executeCommand("type", { text: " " });
    assert.ok(
      (await waitForAutomaticAliasSuggest()) > 0,
      `typing alias-position whitespace did not trigger suggestions for ${sql}`,
    );
    await vscode.commands.executeCommand("hideSuggestWidget");
  }

  const unrelatedWhitespace = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "SELECT",
  });
  const unrelatedEditor =
    await vscode.window.showTextDocument(unrelatedWhitespace);
  const unrelatedEnd = unrelatedWhitespace.positionAt(
    unrelatedWhitespace.getText().length,
  );
  unrelatedEditor.selection = new vscode.Selection(unrelatedEnd, unrelatedEnd);
  await takeAutomaticAliasSuggestInvocations();
  await vscode.commands.executeCommand("type", { text: " " });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(await takeAutomaticAliasSuggestInvocations(), 0);
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Belege AS b WHERE b.`,
      ),
    ),
    ["Belegdatum", "BelegId", "Belegnummer", "Gesamtbetrag", "KundenId"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.BelegePositionen`,
      ),
    ),
    ["BelegePositionen", "BelegePositionenDetails"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(`SELECT * FROM ${database}.dbo.Positionen`),
    ),
    ["BelegePositionen", "BelegePositionenDetails"],
  );
  assert.deepEqual(
    labels(await semanticCompletion(`SELECT * FROM ${database}.dbo.DETAILS`)),
    ["BelegePositionenDetails"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.BelegePositionen AS p WHERE p.`,
      ),
    ),
    [
      "Artikelnummer",
      "BelegId",
      "BelegPositionId",
      "Einzelpreis",
      "Menge",
      "Positionsnummer",
    ],
  );
  const simultaneousFamily = `SELECT * FROM ${database}.dbo.Belege AS b
JOIN ${database}.dbo.BelegePositionen AS p ON p.BelegId = b.BelegId
WHERE b. AND p.`;
  assert.deepEqual(
    labels(
      await semanticCompletion(
        simultaneousFamily,
        simultaneousFamily.indexOf("b.", simultaneousFamily.indexOf("WHERE")) +
          2,
      ),
    ),
    ["Belegdatum", "BelegId", "Belegnummer", "Gesamtbetrag", "KundenId"],
  );
  assert.deepEqual(labels(await semanticCompletion(simultaneousFamily)), [
    "Artikelnummer",
    "BelegId",
    "BelegPositionId",
    "Einzelpreis",
    "Menge",
    "Positionsnummer",
  ]);
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.BelegePositionenDetails AS d WHERE d.`,
      ),
    ),
    ["BelegPositionDetailId", "BelegPositionId", "DetailCode", "DetailValue"],
  );
  assert.deepEqual(
    predicateLabels(
      await joinPredicates(
        `SELECT * FROM ${database}.dbo.Belege AS b JOIN ${database}.dbo.BelegePositionen AS p ON`,
      ),
    ),
    ["p.BelegId = b.BelegId"],
  );
  assert.deepEqual(
    predicateLabels(
      await joinPredicates(
        `SELECT * FROM ${database}.dbo.BelegePositionen AS p JOIN ${database}.dbo.BelegePositionenDetails AS d ON`,
      ),
    ),
    ["d.BelegPositionId = p.BelegPositionId"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${reportingDatabase}.dbo.Auftraege`,
      ),
    ),
    ["Auftraege", "AuftraegePositionen"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(`SELECT * FROM ${database}.dbo.Customers `),
    ),
    ["c"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Customers AS c;
SELECT * FROM ${database}.dbo.Customers `,
      ),
    ),
    ["c"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Customers AS c
JOIN ${database}.dbo.CustomerAddresses `,
      ),
    ),
    ["ca"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Customers AS c
JOIN ${database}.dbo.Customers `,
      ),
    ),
    ["c2"],
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
      (
        await semanticCompletion(
          crossDatabase,
          crossDatabase.indexOf("r.)") + 2,
        )
      ).filter((item) => item.data?.semanticKind),
    ),
    ["ReportingCustomerId", "CustomerDisplayName"],
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

  const builtinItems = await semanticCompletion("SELECT dat");
  assert.deepEqual(
    labels(
      builtinItems.filter(
        (item) => item.data?.semanticKind === "builtinFunction",
      ),
    ),
    ["DATEADD", "DATEDIFF", "DATEFROMPARTS"],
  );
  assert.equal(
    (await semanticCompletion("SELECT * FROM dat")).some(
      (item) => item.data?.semanticKind === "builtinFunction",
    ),
    false,
  );
  for (const name of [
    "CHARINDEX",
    "DATEADD",
    "DATEDIFF",
    "DATEFROMPARTS",
    "ROUND",
    "STRING_AGG",
    "SUBSTRING",
  ]) {
    const builtin = await signature(`SELECT ${name}(`, "(");
    assert.equal(builtin.activeParameter, 0, name);
    assert.match(builtin.signatures[0]?.label ?? "", new RegExp(`^${name}\\(`));
  }
  const builtinSecond = await signature("SELECT SUBSTRING(Name,", ",");
  assert.equal(builtinSecond.activeParameter, 1);
  const builtinNested = await signature(
    "SELECT DATEADD(day, DATEDIFF(day, StartDate, EndDate),",
    ",",
  );
  assert.equal(builtinNested.activeParameter, 2);

  const automaticBuiltin = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "SELECT DATEADD",
  });
  const automaticBuiltinEditor =
    await vscode.window.showTextDocument(automaticBuiltin);
  automaticBuiltinEditor.selection = new vscode.Selection(
    automaticBuiltin.positionAt(automaticBuiltin.getText().length),
    automaticBuiltin.positionAt(automaticBuiltin.getText().length),
  );
  await takeInvocations();
  await vscode.commands.executeCommand("type", { text: "(" });
  assert.ok(
    (await waitForInvocation("(", true)).length > 0,
    "typing '(' did not automatically invoke built-in Signature Help",
  );

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
