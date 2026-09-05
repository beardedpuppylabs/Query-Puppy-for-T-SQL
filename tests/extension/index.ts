import assert from "node:assert/strict";
import { join } from "node:path";
import * as vscode from "vscode";
import { DatabaseIndex } from "../../src/metadata/DatabaseIndex.js";
import type { SqlType } from "../../src/metadata/MetadataModels.js";
import { BUILTIN_FUNCTIONS } from "../../src/parser/BuiltinFunctionCatalog.js";
import { collectDocumentSemanticDeclarations } from "../../src/parser/DocumentSemanticAnalyzer.js";
import { SqlDocumentHighlightProvider } from "../../src/navigation/SqlDocumentHighlightProvider.js";
import { SqlDocumentSymbolProvider } from "../../src/navigation/SqlDocumentSymbolProvider.js";
import { SqlReferenceProvider } from "../../src/navigation/SqlReferenceProvider.js";
import {
  RelationshipConfidence,
  RelationshipProvenance,
  type ProjectDefinedRelationship,
  type UserConfirmedRelationship,
} from "../../src/relationships/RelationshipModels.js";

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
    {
      id: 60,
      schema: "reltest",
      name: "ProjectParent",
      normalizedName: "projectparent",
      kind: "table",
      parameters: [],
      columns: ["CompanyId", "ParentId"].map((name, ordinal) => ({
        name,
        normalizedName: name.toLocaleLowerCase("en-US"),
        type: { name: "bigint" },
        nullable: false,
        ordinal: ordinal + 1,
      })),
    },
    {
      id: 61,
      schema: "reltest",
      name: "ProjectChild",
      normalizedName: "projectchild",
      kind: "table",
      parameters: [],
      columns: ["CompanyId", "ChildId", "ParentRef"].map((name, ordinal) => ({
        name,
        normalizedName: name.toLocaleLowerCase("en-US"),
        type: { name: "bigint" },
        nullable: false,
        ordinal: ordinal + 1,
      })),
    },
    {
      id: 70,
      schema: "reltest",
      name: "HeuristicCustomers",
      normalizedName: "heuristiccustomers",
      kind: "table",
      parameters: [],
      columns: ["CompanyId", "Id"].map((name, ordinal) => ({
        name,
        normalizedName: name.toLocaleLowerCase("en-US"),
        type: { name: "int" },
        nullable: false,
        ordinal: ordinal + 1,
      })),
    },
    {
      id: 71,
      schema: "reltest",
      name: "HeuristicOrders",
      normalizedName: "heuristicorders",
      kind: "table",
      parameters: [],
      columns: ["CompanyId", "OrderId", "HeuristicCustomerId"].map(
        (name, ordinal) => ({
          name,
          normalizedName: name.toLocaleLowerCase("en-US"),
          type: { name: "int" },
          nullable: false,
          ordinal: ordinal + 1,
        }),
      ),
    },
    {
      id: 72,
      schema: "reltest",
      name: "HeuristicIdenticalA",
      normalizedName: "heuristicidenticala",
      kind: "table",
      parameters: [],
      columns: ["CompanyId", "Id"].map((name, ordinal) => ({
        name,
        normalizedName: name.toLocaleLowerCase("en-US"),
        type: { name: "int" },
        nullable: false,
        ordinal: ordinal + 1,
      })),
    },
    {
      id: 73,
      schema: "reltest",
      name: "HeuristicIdenticalB",
      normalizedName: "heuristicidenticalb",
      kind: "table",
      parameters: [],
      columns: ["CompanyId", "Id"].map((name, ordinal) => ({
        name,
        normalizedName: name.toLocaleLowerCase("en-US"),
        type: { name: "int" },
        nullable: false,
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
    {
      database,
      objectId: 60,
      schema: "reltest",
      objectName: "ProjectParent",
      name: "UQ_ProjectParent_Company_Parent",
      kind: "uniqueConstraint",
      filtered: false,
      columns: [
        { columnId: 1, columnName: "CompanyId", ordinal: 1 },
        { columnId: 2, columnName: "ParentId", ordinal: 2 },
      ],
    },
    {
      database,
      objectId: 70,
      schema: "reltest",
      objectName: "HeuristicCustomers",
      name: "PK_HeuristicCustomers",
      kind: "primaryKey",
      filtered: false,
      columns: [
        { columnId: 1, columnName: "CompanyId", ordinal: 1 },
        { columnId: 2, columnName: "Id", ordinal: 2 },
      ],
    },
    {
      database,
      objectId: 72,
      schema: "reltest",
      objectName: "HeuristicIdenticalA",
      name: "PK_HeuristicIdenticalA",
      kind: "primaryKey",
      filtered: false,
      columns: [
        { columnId: 1, columnName: "CompanyId", ordinal: 1 },
        { columnId: 2, columnName: "Id", ordinal: 2 },
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
const projectRelationships: readonly ProjectDefinedRelationship[] = [
  {
    provenance: RelationshipProvenance.ProjectDefined,
    confidence: RelationshipConfidence.Confirmed,
    source: {
      database,
      schema: "reltest",
      objectName: "ProjectChild",
      objectId: 61,
    },
    target: {
      database,
      schema: "reltest",
      objectName: "ProjectParent",
      objectId: 60,
    },
    mappings: [
      {
        sourceColumnName: "CompanyId",
        targetColumnName: "CompanyId",
        sourceColumnId: 1,
        targetColumnId: 1,
        ordinal: 1,
      },
      {
        sourceColumnName: "ParentRef",
        targetColumnName: "ParentId",
        sourceColumnId: 3,
        targetColumnId: 2,
        ordinal: 2,
      },
    ],
  },
  {
    provenance: RelationshipProvenance.ProjectDefined,
    confidence: RelationshipConfidence.Confirmed,
    source: {
      database,
      schema: "reltest",
      objectName: "OrderHeaders",
      objectId: 13,
    },
    target: {
      database,
      schema: "reltest",
      objectName: "Customers",
      objectId: 11,
    },
    mappings: [
      {
        sourceColumnName: "CompanyId",
        targetColumnName: "CustomerId",
        sourceColumnId: 1,
        targetColumnId: 1,
        ordinal: 1,
      },
    ],
  },
];
const projectIndex = new DatabaseIndex(index.metadata, projectRelationships);
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

async function definition(
  sql: string,
  cursor: number,
): Promise<readonly vscode.Location[]> {
  const document = await vscode.workspace.openTextDocument({
    language: "sql",
    content: sql,
  });
  const result = await vscode.commands.executeCommand<
    readonly (vscode.Location | vscode.LocationLink)[]
  >(
    "vscode.executeDefinitionProvider",
    document.uri,
    document.positionAt(cursor),
  );
  return result.flatMap((item) =>
    "uri" in item
      ? [item]
      : item.targetUri.toString() === document.uri.toString()
        ? [
            new vscode.Location(
              item.targetUri,
              item.targetSelectionRange ?? item.targetRange,
            ),
          ]
        : [],
  );
}

async function references(
  sql: string,
  cursor: number,
): Promise<readonly vscode.Location[]> {
  const document = await vscode.workspace.openTextDocument({
    language: "sql",
    content: sql,
  });
  const result = await vscode.commands.executeCommand<
    readonly vscode.Location[] | undefined
  >(
    "vscode.executeReferenceProvider",
    document.uri,
    document.positionAt(cursor),
  );
  return (result ?? []).filter(
    (location) => location.uri.toString() === document.uri.toString(),
  );
}

async function documentHighlights(
  sql: string,
  cursor: number,
): Promise<readonly vscode.DocumentHighlight[]> {
  const document = await vscode.workspace.openTextDocument({
    language: "sql",
    content: sql,
  });
  return (
    (await vscode.commands.executeCommand<
      readonly vscode.DocumentHighlight[] | undefined
    >(
      "vscode.executeDocumentHighlights",
      document.uri,
      document.positionAt(cursor),
    )) ?? []
  );
}

async function nativeNavigation(
  sql: string,
  cursor: number,
): Promise<{
  readonly document: vscode.TextDocument;
  readonly definitions: readonly vscode.Location[];
  readonly references: readonly vscode.Location[];
  readonly highlights: readonly vscode.DocumentHighlight[];
}> {
  const document = await vscode.workspace.openTextDocument({
    language: "sql",
    content: sql,
  });
  const position = document.positionAt(cursor);
  const definitionResult =
    (await vscode.commands.executeCommand<
      readonly (vscode.Location | vscode.LocationLink)[] | undefined
    >("vscode.executeDefinitionProvider", document.uri, position)) ?? [];
  const definitions = definitionResult.flatMap((item) =>
    "uri" in item
      ? [item]
      : item.targetUri.toString() === document.uri.toString()
        ? [
            new vscode.Location(
              item.targetUri,
              item.targetSelectionRange ?? item.targetRange,
            ),
          ]
        : [],
  );
  const referenceResult =
    (await vscode.commands.executeCommand<
      readonly vscode.Location[] | undefined
    >("vscode.executeReferenceProvider", document.uri, position)) ?? [];
  const highlights =
    (await vscode.commands.executeCommand<
      readonly vscode.DocumentHighlight[] | undefined
    >("vscode.executeDocumentHighlights", document.uri, position)) ?? [];
  return {
    document,
    definitions,
    references: referenceResult.filter(
      (location) => location.uri.toString() === document.uri.toString(),
    ),
    highlights,
  };
}

async function documentSymbols(sql: string): Promise<{
  readonly document: vscode.TextDocument;
  readonly symbols: readonly vscode.DocumentSymbol[];
}> {
  const document = await vscode.workspace.openTextDocument({
    language: "sql",
    content: sql,
  });
  const result =
    (await vscode.commands.executeCommand<
      readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined
    >("vscode.executeDocumentSymbolProvider", document.uri)) ?? [];
  return {
    document,
    symbols: result.filter(
      (symbol): symbol is vscode.DocumentSymbol => "selectionRange" in symbol,
    ),
  };
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
async function relationshipCodeActions(
  document: vscode.TextDocument,
  cursor: number,
): Promise<readonly (vscode.CodeAction | vscode.Command)[]> {
  return vscode.commands.executeCommand<
    readonly (vscode.CodeAction | vscode.Command)[]
  >(
    "vscode.executeCodeActionProvider",
    document.uri,
    new vscode.Range(document.positionAt(cursor), document.positionAt(cursor)),
    vscode.CodeActionKind.RefactorRewrite.value,
  );
}
async function registeredSemanticCompletion(
  sql: string,
  cursor = sql.length,
  triggerCharacter?: string,
): Promise<readonly MarkedCompletionItem[]> {
  const document = await vscode.workspace.openTextDocument({
    language: "sql",
    content: sql,
  });
  const result = triggerCharacter
    ? await vscode.commands.executeCommand<
        vscode.CompletionList | readonly vscode.CompletionItem[]
      >(
        "vscode.executeCompletionItemProvider",
        document.uri,
        document.positionAt(cursor),
        triggerCharacter,
      )
    : await vscode.commands.executeCommand<
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
const joinPhaseItems = (items: readonly vscode.CompletionItem[]) =>
  items.filter(
    (item) =>
      item.detail?.startsWith("alias for ") ||
      item.documentation === "T-SQL JOIN condition",
  );
const observedDomain = (invocation: AutomaticCompletionInvocation) =>
  invocation.items.map((item) => `${item.semanticKind}:${item.name}`).sort();
const markedDomain = (items: readonly MarkedCompletionItem[]) =>
  items
    .flatMap((item) =>
      item.data?.semanticKind
        ? [`${item.data.semanticKind}:${labels([item])[0] ?? ""}`]
        : [],
    )
    .sort();

type Invocation = {
  readonly triggerKind: vscode.SignatureHelpTriggerKind;
  readonly triggerCharacter?: string;
};
type AutomaticCompletionInvocation = {
  readonly kind: string;
  readonly documentVersion: number;
  readonly offset: number;
  readonly items: readonly {
    readonly name: string;
    readonly semanticKind: string;
  }[];
};
const takeInvocations = () =>
  vscode.commands.executeCommand<readonly Invocation[]>(
    "queryPuppyForTSql.test.takeSignatureInvocations",
  );
const takeAutomaticAliasSuggestInvocations = () =>
  vscode.commands.executeCommand<number>(
    "queryPuppyForTSql.test.takeAutomaticAliasSuggestInvocations",
  );
const takeAutomaticSemanticSuggestInvocations = () =>
  vscode.commands.executeCommand<number>(
    "queryPuppyForTSql.test.takeAutomaticSemanticSuggestInvocations",
  );
const takeAutomaticCompletionInvocations = () =>
  vscode.commands.executeCommand<readonly AutomaticCompletionInvocation[]>(
    "queryPuppyForTSql.test.takeAutomaticCompletionInvocations",
  );
const takeAmbiguityNotifications = () =>
  vscode.commands.executeCommand<readonly string[]>(
    "queryPuppyForTSql.test.takeAmbiguityNotifications",
  );
async function waitForAutomaticAliasSuggest(): Promise<number> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const count = await takeAutomaticAliasSuggestInvocations();
    if (count > 0) return count;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}
async function waitForAutomaticSemanticSuggest(): Promise<number> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const count = await takeAutomaticSemanticSuggestInvocations();
    if (count > 0) return count;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}
async function waitForAutomaticCompletion(
  kind: string,
): Promise<AutomaticCompletionInvocation | undefined> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const invocation = (await takeAutomaticCompletionInvocations()).find(
      (candidate) => candidate.kind === kind,
    );
    if (invocation) return invocation;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
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
  const baseScope = {
    activeDatabase: database,
    indexes: new Map([
      [database.toLowerCase(), index],
      [reportingDatabase.toLowerCase(), reportingIndex],
    ]),
  };
  const untitledDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "SELECT 1",
  });
  const noWorkspaceScope = await vscode.commands.executeCommand<
    typeof baseScope
  >(
    "queryPuppyForTSql.test.applyProjectRelationships",
    untitledDocument,
    baseScope,
  );
  assert.equal(
    noWorkspaceScope.indexes.get(database.toLowerCase()),
    index,
    "an untitled document must not inherit project relationships",
  );
  await vscode.commands.executeCommand(
    "queryPuppyForTSql.test.setCompletionScope",
    baseScope,
  );
  await vscode.commands.executeCommand(
    "queryPuppyForTSql.test.setSignatureScope",
    {
      activeDatabase: database,
      indexes: new Map([[database.toLowerCase(), index]]),
    },
  );

  const definitionSql =
    "WITH CustomerOrders AS (SELECT 1 AS Id) SELECT * FROM CustomerOrders";
  const definitions = await definition(
    definitionSql,
    definitionSql.lastIndexOf("CustomerOrders") + 1,
  );
  assert.equal(definitions.length, 1);
  const firstDefinition = definitions[0];
  assert.ok(firstDefinition);
  assert.equal(firstDefinition.uri.toString().startsWith("untitled:"), true);
  assert.equal(firstDefinition.range.start.line, 0);
  assert.equal(
    firstDefinition.range.start.character,
    definitionSql.indexOf("CustomerOrders"),
  );
  assert.equal(
    firstDefinition.range.end.character,
    definitionSql.indexOf("CustomerOrders") + "CustomerOrders".length,
  );

  const variableNavigationSql =
    "DECLARE @CustomerId int = 42;\nSELECT @CustomerId;";
  const cteNavigationSql =
    ";WITH CustomerData AS (SELECT 1 AS Id) SELECT * FROM CustomerData;";
  const aliasNavigationSql =
    ";WITH CustomerData AS (SELECT 1 AS Id) SELECT cd.Id FROM CustomerData AS cd WHERE cd.Id = 1;";
  for (const navigationCase of [
    {
      label: "local variable",
      sql: variableNavigationSql,
      name: "@CustomerId",
      declaration: variableNavigationSql.indexOf("@CustomerId"),
      reference: variableNavigationSql.lastIndexOf("@CustomerId"),
      occurrences: [
        variableNavigationSql.indexOf("@CustomerId"),
        variableNavigationSql.lastIndexOf("@CustomerId"),
      ],
    },
    {
      label: "CTE",
      sql: cteNavigationSql,
      name: "CustomerData",
      declaration: cteNavigationSql.indexOf("CustomerData"),
      reference: cteNavigationSql.lastIndexOf("CustomerData"),
      occurrences: [
        cteNavigationSql.indexOf("CustomerData"),
        cteNavigationSql.lastIndexOf("CustomerData"),
      ],
    },
    {
      label: "explicit alias",
      sql: aliasNavigationSql,
      name: "cd",
      declaration: aliasNavigationSql.indexOf("cd WHERE"),
      reference: aliasNavigationSql.lastIndexOf("cd.Id"),
      occurrences: [
        aliasNavigationSql.indexOf("cd.Id"),
        aliasNavigationSql.indexOf("cd WHERE"),
        aliasNavigationSql.lastIndexOf("cd.Id"),
      ],
    },
  ]) {
    const fromDeclaration = await nativeNavigation(
      navigationCase.sql,
      navigationCase.declaration,
    );
    const fromReference = await nativeNavigation(
      navigationCase.sql,
      navigationCase.reference,
    );
    const definitionOffsets = (result: typeof fromDeclaration) =>
      result.definitions.map((location) => [
        result.document.offsetAt(location.range.start),
        result.document.offsetAt(location.range.end),
      ]);
    const referenceOffsets = (result: typeof fromDeclaration) =>
      result.references.map((location) =>
        result.document.offsetAt(location.range.start),
      );
    const highlightOffsets = (result: typeof fromDeclaration) =>
      result.highlights.map((highlight) =>
        result.document.offsetAt(highlight.range.start),
      );

    assert.deepEqual(
      definitionOffsets(fromDeclaration),
      [
        [
          navigationCase.declaration,
          navigationCase.declaration + navigationCase.name.length,
        ],
      ],
      `${navigationCase.label} declaration must resolve to itself`,
    );
    assert.deepEqual(
      definitionOffsets(fromReference),
      definitionOffsets(fromDeclaration),
      `${navigationCase.label} reference must resolve to the same declaration`,
    );
    assert.deepEqual(
      referenceOffsets(fromDeclaration),
      navigationCase.occurrences,
      `${navigationCase.label} declaration must return its semantic references`,
    );
    assert.deepEqual(
      referenceOffsets(fromReference),
      navigationCase.occurrences,
      `${navigationCase.label} declaration and reference must return the same references`,
    );
    assert.deepEqual(
      highlightOffsets(fromDeclaration),
      navigationCase.occurrences,
      `${navigationCase.label} declaration must return its semantic highlights`,
    );
    assert.deepEqual(
      highlightOffsets(fromReference),
      navigationCase.occurrences,
      `${navigationCase.label} declaration and reference must return the same highlights`,
    );
  }

  for (const navigationCase of [
    {
      label: "table variable",
      sql: "DECLARE @Rows TABLE (Id int);\nSELECT tv.Id FROM @Rows AS tv;",
      name: "@Rows",
    },
    {
      label: "temporary table",
      sql: "CREATE TABLE #Scratch (Id int);\nSELECT t.Id FROM #Scratch AS t;",
      name: "#Scratch",
    },
  ]) {
    const declaration = navigationCase.sql.indexOf(navigationCase.name);
    const reference = navigationCase.sql.lastIndexOf(navigationCase.name);
    const fromDeclaration = await nativeNavigation(
      navigationCase.sql,
      declaration,
    );
    const fromReference = await nativeNavigation(navigationCase.sql, reference);
    const definitionOffsets = (result: typeof fromDeclaration) =>
      result.definitions.map((location) => [
        result.document.offsetAt(location.range.start),
        result.document.offsetAt(location.range.end),
      ]);
    assert.deepEqual(
      definitionOffsets(fromDeclaration),
      [[declaration, declaration + navigationCase.name.length]],
      `${navigationCase.label} declaration must resolve to itself`,
    );
    assert.deepEqual(
      definitionOffsets(fromReference),
      definitionOffsets(fromDeclaration),
      `${navigationCase.label} reference must resolve to the same declaration`,
    );
  }

  const referenceSql =
    "WITH CustomerOrders AS (SELECT 1 AS Id) SELECT * FROM CustomerOrders";
  const registeredReferences = await references(
    referenceSql,
    referenceSql.lastIndexOf("CustomerOrders") + 1,
  );
  assert.deepEqual(
    registeredReferences.map((location) => location.range.start.character),
    [
      referenceSql.indexOf("CustomerOrders"),
      referenceSql.lastIndexOf("CustomerOrders"),
    ],
    "the registered native Reference Provider must return declaration and use",
  );

  const directCteReferenceDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: referenceSql,
  });
  const directCteReferenceProvider = new SqlReferenceProvider();
  const cteDeclaration = referenceSql.indexOf("CustomerOrders");
  const cteUse = referenceSql.lastIndexOf("CustomerOrders");
  const cteReferencesFromDeclaration =
    await directCteReferenceProvider.provideReferences(
      directCteReferenceDocument,
      directCteReferenceDocument.positionAt(cteDeclaration + 1),
      { includeDeclaration: true },
    );
  const cteReferencesFromUse =
    await directCteReferenceProvider.provideReferences(
      directCteReferenceDocument,
      directCteReferenceDocument.positionAt(cteUse + 1),
      { includeDeclaration: true },
    );
  const cteReferencesWithoutDeclaration =
    await directCteReferenceProvider.provideReferences(
      directCteReferenceDocument,
      directCteReferenceDocument.positionAt(cteDeclaration + 1),
      { includeDeclaration: false },
    );
  assert.deepEqual(
    cteReferencesFromDeclaration?.map(
      (location) => location.range.start.character,
    ),
    [cteDeclaration, cteUse],
  );
  assert.deepEqual(
    cteReferencesFromUse?.map((location) => location.range.start.character),
    [cteDeclaration, cteUse],
  );
  assert.deepEqual(
    cteReferencesWithoutDeclaration?.map(
      (location) => location.range.start.character,
    ),
    [cteUse],
  );

  const providerReferenceSql =
    "SELECT o.Id, o.Name FROM dbo.Orders AS o WHERE o.CustomerId IS NOT NULL";
  const providerReferenceDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: providerReferenceSql,
  });
  const directReferenceProvider = new SqlReferenceProvider();
  const aliasDeclaration = providerReferenceSql.lastIndexOf("o WHERE");
  const aliasUse = providerReferenceSql.indexOf("o.Id");
  const referencesFromDeclaration =
    await directReferenceProvider.provideReferences(
      providerReferenceDocument,
      providerReferenceDocument.positionAt(aliasDeclaration),
      { includeDeclaration: true },
    );
  const referencesFromUse = await directReferenceProvider.provideReferences(
    providerReferenceDocument,
    providerReferenceDocument.positionAt(aliasUse),
    { includeDeclaration: true },
  );
  const referencesWithoutDeclaration =
    await directReferenceProvider.provideReferences(
      providerReferenceDocument,
      providerReferenceDocument.positionAt(aliasUse),
      { includeDeclaration: false },
    );
  assert.deepEqual(
    referencesFromDeclaration?.map(
      (location) => location.range.start.character,
    ),
    referencesFromUse?.map((location) => location.range.start.character),
    "declaration and use must resolve the same alias identity",
  );
  assert.deepEqual(
    referencesFromUse?.map((location) => location.range.start.character),
    [
      providerReferenceSql.indexOf("o.Id"),
      providerReferenceSql.indexOf("o.Name"),
      aliasDeclaration,
      providerReferenceSql.indexOf("o.CustomerId"),
    ],
  );
  assert.deepEqual(
    referencesWithoutDeclaration?.map(
      (location) => location.range.start.character,
    ),
    [
      providerReferenceSql.indexOf("o.Id"),
      providerReferenceSql.indexOf("o.Name"),
      providerReferenceSql.indexOf("o.CustomerId"),
    ],
  );

  const highlightSql =
    "SELECT o.Id, o.Name FROM dbo.Orders AS o WHERE o.CustomerId IS NOT NULL";
  const registeredHighlights = await documentHighlights(
    highlightSql,
    highlightSql.indexOf("o.Id"),
  );
  const aliasHighlightDeclaration = highlightSql.lastIndexOf("o WHERE");
  assert.deepEqual(
    registeredHighlights.map((highlight) => highlight.range.start.character),
    [
      highlightSql.indexOf("o.Id"),
      highlightSql.indexOf("o.Name"),
      aliasHighlightDeclaration,
      highlightSql.indexOf("o.CustomerId"),
    ],
    "the registered native Document Highlight Provider must return one semantic alias set",
  );
  assert.equal(
    registeredHighlights.every(
      (highlight) => highlight.kind === vscode.DocumentHighlightKind.Text,
    ),
    true,
  );

  const directHighlightDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: referenceSql,
  });
  const directHighlightProvider = new SqlDocumentHighlightProvider();
  const highlightsFromDeclaration =
    await directHighlightProvider.provideDocumentHighlights(
      directHighlightDocument,
      directHighlightDocument.positionAt(cteDeclaration + 1),
    );
  const highlightsFromUse =
    await directHighlightProvider.provideDocumentHighlights(
      directHighlightDocument,
      directHighlightDocument.positionAt(cteUse + 1),
    );
  assert.deepEqual(
    highlightsFromDeclaration?.map(
      (highlight) => highlight.range.start.character,
    ),
    [cteDeclaration, cteUse],
  );
  assert.deepEqual(
    highlightsFromUse?.map((highlight) => highlight.range.start.character),
    [cteDeclaration, cteUse],
  );
  assert.equal(
    highlightsFromUse.every(
      (highlight) => highlight.kind === vscode.DocumentHighlightKind.Text,
    ),
    true,
  );

  const outlineSql = [
    "DECLARE @First int = 42;",
    "DECLARE @Rows TABLE (Id int);",
    "CREATE TABLE #Scratch (Id int);",
    "GO",
    "DECLARE @Second bigint = N'Alice';",
    "WITH Orders AS (",
    "  SELECT c.Id FROM dbo.Customers AS c",
    ")",
    "SELECT o.Id FROM Orders AS o;",
  ].join("\n");
  const registeredOutline = await documentSymbols(outlineSql);
  assert.deepEqual(
    registeredOutline.symbols.map((symbol) => [
      symbol.name,
      symbol.detail,
      symbol.kind,
    ]),
    [
      ["@First", "Local variable int = 42", vscode.SymbolKind.Variable],
      ["@Rows", "Table variable", vscode.SymbolKind.Variable],
      ["#Scratch", "Temporary table", vscode.SymbolKind.Object],
      [
        "@Second",
        "Local variable bigint = N'Alice'",
        vscode.SymbolKind.Variable,
      ],
      ["Orders", "CTE", vscode.SymbolKind.Struct],
      ["c", "Row source alias", vscode.SymbolKind.Variable],
      ["o", "Row source alias", vscode.SymbolKind.Variable],
    ],
    "the registered native Document Symbol Provider must return the whole document in source order",
  );
  for (const symbol of registeredOutline.symbols) {
    assert.equal(
      registeredOutline.document.getText(symbol.selectionRange),
      symbol.name,
    );
    assert.deepEqual(symbol.range, symbol.selectionRange);
  }
  assert.equal(
    registeredOutline.symbols.some((symbol) =>
      ["Customers", "Id"].includes(symbol.name),
    ),
    false,
  );

  let outlineCollectionCount = 0;
  const directOutlineProvider = new SqlDocumentSymbolProvider((sql) => {
    outlineCollectionCount++;
    return collectDocumentSemanticDeclarations(sql);
  });
  const directOutline = await directOutlineProvider.provideDocumentSymbols(
    registeredOutline.document,
  );
  await directOutlineProvider.provideDocumentSymbols(
    registeredOutline.document,
  );
  assert.deepEqual(
    directOutline?.map((symbol) => symbol.name),
    registeredOutline.symbols.map((symbol) => symbol.name),
  );
  assert.equal(outlineCollectionCount, 1);
  directOutlineProvider.closeDocument(registeredOutline.document.uri);
  await directOutlineProvider.provideDocumentSymbols(
    registeredOutline.document,
  );
  assert.equal(outlineCollectionCount, 2);

  const invalidDiagnosticSql =
    "DECLARE @CustomerId int;\nGO\nSELECT @CustomerId;";
  const validDiagnosticSql = "DECLARE @CustomerId int;\nSELECT @CustomerId;";
  const semanticDiagnosticDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: invalidDiagnosticSql,
  });
  const queryPuppyDiagnostics = (): readonly vscode.Diagnostic[] =>
    vscode.languages
      .getDiagnostics(semanticDiagnosticDocument.uri)
      .filter((diagnostic) => diagnostic.source === "Query Puppy");
  assert.equal(queryPuppyDiagnostics().length, 1);
  const crossBatchDiagnostic = queryPuppyDiagnostics()[0];
  assert.ok(crossBatchDiagnostic);
  assert.equal(crossBatchDiagnostic.code, "QP1001");
  assert.equal(crossBatchDiagnostic.severity, vscode.DiagnosticSeverity.Error);
  assert.equal(
    semanticDiagnosticDocument.getText(crossBatchDiagnostic.range),
    "@CustomerId",
  );

  const semanticDiagnosticEditor = await vscode.window.showTextDocument(
    semanticDiagnosticDocument,
  );
  assert.equal(
    await semanticDiagnosticEditor.edit((builder) =>
      builder.replace(
        new vscode.Range(
          semanticDiagnosticDocument.positionAt(0),
          semanticDiagnosticDocument.positionAt(
            semanticDiagnosticDocument.getText().length,
          ),
        ),
        validDiagnosticSql,
      ),
    ),
    true,
  );
  assert.deepEqual(queryPuppyDiagnostics(), []);
  assert.equal(
    await semanticDiagnosticEditor.edit((builder) =>
      builder.replace(
        new vscode.Range(
          semanticDiagnosticDocument.positionAt(0),
          semanticDiagnosticDocument.positionAt(
            semanticDiagnosticDocument.getText().length,
          ),
        ),
        invalidDiagnosticSql,
      ),
    ),
    true,
  );
  assert.equal(queryPuppyDiagnostics().length, 1);
  const diagnosticUri = semanticDiagnosticDocument.uri;
  await vscode.commands.executeCommand(
    "workbench.action.revertAndCloseActiveEditor",
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(
    vscode.languages
      .getDiagnostics(diagnosticUri)
      .filter((diagnostic) => diagnostic.source === "Query Puppy"),
    [],
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
  const completionDetail = (item: vscode.CompletionItem | undefined) =>
    item && typeof item.label !== "string"
      ? (item.label.detail ?? "")
      : (item?.detail ?? "");
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

  const temporaryWorkspacePath =
    process.env["QUERY_PUPPY_TEST_RELATIONSHIP_WORKSPACE"];
  assert.ok(temporaryWorkspacePath, "relationship test workspace is missing");
  const temporaryWorkspaceUri = vscode.Uri.file(temporaryWorkspacePath);
  assert.ok(
    vscode.workspace.getWorkspaceFolder(temporaryWorkspaceUri),
    "relationship test folder must be an owning workspace root",
  );
  try {
    const openWorkspaceSql = async (
      filename: string,
      sql: string,
      workspacePath = temporaryWorkspacePath,
    ): Promise<vscode.TextDocument> => {
      const uri = vscode.Uri.file(join(workspacePath, filename));
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(sql));
      return vscode.workspace.openTextDocument(uri);
    };
    type LearnedEvidence = {
      readonly source: { readonly object: string };
      readonly target: { readonly object: string };
      readonly mappings: readonly {
        readonly source: string;
        readonly target: string;
      }[];
      readonly observationCount: number;
    };
    type LearnedEvidenceState = {
      readonly kind: "valid" | "invalid";
      readonly evidence?: readonly LearnedEvidence[];
      readonly seenOccurrences?: readonly {
        readonly document: string;
        readonly relationship: string;
        readonly ordinal: number;
        readonly order: number;
      }[];
    };
    const learnedEvidence = (document: vscode.TextDocument) =>
      vscode.commands.executeCommand<readonly LearnedEvidence[]>(
        "queryPuppyForTSql.test.learnedRelationshipEvidence",
        document,
      );
    const learnedEvidenceState = (document: vscode.TextDocument) =>
      vscode.commands.executeCommand<LearnedEvidenceState>(
        "queryPuppyForTSql.test.learnedRelationshipEvidenceState",
        document,
      );
    const applyLearnedCandidates = (
      document: vscode.TextDocument,
      scope: typeof baseScope,
    ) =>
      vscode.commands.executeCommand<typeof baseScope>(
        "queryPuppyForTSql.test.applyLearnedRelationshipCandidates",
        document,
        scope,
      );
    const waitForLearnedCount = async (
      document: vscode.TextDocument,
      count: number,
    ): Promise<readonly LearnedEvidence[]> => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const current = await learnedEvidence(document);
        if (
          current.length === (count === 0 ? 0 : 1) &&
          (count === 0 || current[0]?.observationCount === count)
        )
          return current;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return learnedEvidence(document);
    };
    const observeWorkspaceSql = async (
      filename: string,
      sql: string,
      workspacePath = temporaryWorkspacePath,
    ): Promise<vscode.TextDocument> => {
      const document = await openWorkspaceSql(filename, "", workspacePath);
      const editor = await vscode.window.showTextDocument(document, {
        preview: false,
      });
      assert.equal(
        await editor.edit((builder) =>
          builder.insert(new vscode.Position(0, 0), sql),
        ),
        true,
      );
      assert.equal(await document.save(), true);
      return document;
    };
    const joinSql = `SELECT *
FROM reltest.ProjectParent AS p
JOIN reltest.ProjectChild AS c
  ON c.CompanyId = p.CompanyId
 AND c.ParentRef = p.ParentId`;

    let learnedDocument = await observeWorkspaceSql(
      "learned-relationship.sql",
      joinSql,
    );
    const firstEvidence = await waitForLearnedCount(learnedDocument, 1);
    assert.deepEqual(firstEvidence, [
      {
        source: {
          database,
          schema: "reltest",
          object: "ProjectChild",
        },
        target: {
          database,
          schema: "reltest",
          object: "ProjectParent",
        },
        mappings: [
          { source: "CompanyId", target: "CompanyId" },
          { source: "ParentRef", target: "ParentId" },
        ],
        observationCount: 1,
      },
    ]);
    for (let invocation = 0; invocation < 3; invocation++)
      await vscode.commands.executeCommand(
        "queryPuppyForTSql.test.provideCompletions",
        learnedDocument,
        learnedDocument.positionAt(joinSql.length),
      );
    assert.equal(
      (await learnedEvidence(learnedDocument))[0]?.observationCount,
      1,
      "completion invocations must not count as observations",
    );
    const learnedEditor = await vscode.window.showTextDocument(
      learnedDocument,
      {
        preview: false,
      },
    );
    assert.equal(
      await learnedEditor.edit((builder) =>
        builder.insert(learnedDocument.positionAt(0), "-- unrelated edit\n"),
      ),
      true,
    );
    assert.equal(await learnedDocument.save(), true);
    assert.equal(
      (await waitForLearnedCount(learnedDocument, 1))[0]?.observationCount,
      1,
      "an unrelated edit must not recount an unchanged JOIN",
    );
    const learnedDocumentUri = learnedDocument.uri;
    await vscode.window.showTextDocument(learnedDocument, { preview: false });
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    learnedDocument =
      await vscode.workspace.openTextDocument(learnedDocumentUri);
    await vscode.window.showTextDocument(learnedDocument, { preview: false });
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.observeLearnedRelationshipEvidence",
      learnedDocument,
    );
    assert.equal(
      (await learnedEvidence(learnedDocument))[0]?.observationCount,
      1,
      "closing and reopening an unchanged file must retain persisted dedupe",
    );

    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.clearLearnedRelationshipEvidence",
      learnedDocument,
    );
    const clearedState = await learnedEvidenceState(learnedDocument);
    assert.equal(clearedState.kind, "valid");
    assert.deepEqual(clearedState.evidence, []);
    assert.deepEqual(clearedState.seenOccurrences, []);
    const learningConfiguration = vscode.workspace.getConfiguration(
      "queryPuppyForTSql.relationshipLearning",
      learnedDocument.uri,
    );
    const previousWorkspaceLearning =
      learningConfiguration.inspect<boolean>("enabled")?.workspaceValue;
    await learningConfiguration.update(
      "enabled",
      false,
      vscode.ConfigurationTarget.Workspace,
    );
    assert.deepEqual(
      await vscode.commands.executeCommand(
        "queryPuppyForTSql.test.observeLearnedRelationshipEvidence",
        learnedDocument,
      ),
      { kind: "skipped", reason: "relationship learning disabled" },
    );
    const disabledState = await learnedEvidenceState(learnedDocument);
    assert.deepEqual(disabledState.evidence, []);
    assert.deepEqual(disabledState.seenOccurrences, []);
    await learningConfiguration.update(
      "enabled",
      true,
      vscode.ConfigurationTarget.Workspace,
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.observeLearnedRelationshipEvidence",
      learnedDocument,
    );
    assert.equal(
      (await waitForLearnedCount(learnedDocument, 1))[0]?.observationCount,
      1,
      "clear must reset counts and dedupe so the unchanged JOIN can be learned again",
    );
    await learningConfiguration.update(
      "enabled",
      previousWorkspaceLearning,
      vscode.ConfigurationTarget.Workspace,
    );

    const secondOccurrence = `;

SELECT *
FROM reltest.ProjectParent AS parent
JOIN reltest.ProjectChild AS child
  ON parent.ParentId = child.ParentRef
 AND parent.CompanyId = child.CompanyId`;
    const secondOccurrenceEditor = await vscode.window.showTextDocument(
      learnedDocument,
      { preview: false },
    );
    assert.equal(
      await secondOccurrenceEditor.edit((builder) =>
        builder.insert(
          learnedDocument.positionAt(learnedDocument.getText().length),
          secondOccurrence,
        ),
      ),
      true,
    );
    assert.equal(await learnedDocument.save(), true);
    assert.equal(
      (await waitForLearnedCount(learnedDocument, 2))[0]?.observationCount,
      2,
      "a second actual occurrence in one document must increment exactly once",
    );
    const belowThresholdScope = await applyLearnedCandidates(
      learnedDocument,
      baseScope,
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      belowThresholdScope,
    );
    assert.equal(
      predicateLabels(
        await joinPredicates(
          "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
        ),
      ).includes("c.CompanyId = p.CompanyId AND c.ParentRef = p.ParentId"),
      false,
      "two observations must remain below the production candidate threshold",
    );

    const unrelatedWorkspacePath =
      process.env["QUERY_PUPPY_TEST_UNRELATED_WORKSPACE"];
    assert.ok(unrelatedWorkspacePath, "unrelated test workspace is missing");
    const unrelatedLearnedDocument = await observeWorkspaceSql(
      "learned-isolated.sql",
      joinSql,
      unrelatedWorkspacePath,
    );
    assert.equal(
      (await waitForLearnedCount(unrelatedLearnedDocument, 1))[0]
        ?.observationCount,
      1,
      "the sibling workspace must own an independent evidence record",
    );

    const thirdLearnedDocument = await observeWorkspaceSql(
      "learned-third.sql",
      joinSql,
    );
    assert.equal(
      (await waitForLearnedCount(thirdLearnedDocument, 3))[0]?.observationCount,
      3,
    );
    let learnedScope = await applyLearnedCandidates(
      thirdLearnedDocument,
      baseScope,
    );
    const countThreeIndex = learnedScope.indexes.get(database.toLowerCase());
    assert.equal(
      (
        await applyLearnedCandidates(thirdLearnedDocument, baseScope)
      ).indexes.get(database.toLowerCase()),
      countThreeIndex,
      "unchanged evidence and metadata must reuse the learned overlay",
    );
    const refreshedIndex = new DatabaseIndex({
      ...index.metadata,
      loadedAt: index.metadata.loadedAt + 1,
    });
    const refreshedScope = await applyLearnedCandidates(thirdLearnedDocument, {
      ...baseScope,
      indexes: new Map([[database.toLowerCase(), refreshedIndex]]),
    });
    assert.notEqual(
      refreshedScope.indexes.get(database.toLowerCase()),
      countThreeIndex,
      "a replacement metadata index must invalidate the learned overlay",
    );
    assert.equal(
      refreshedScope.indexes
        .get(database.toLowerCase())
        ?.relationships.some(
          (relationship) => relationship.provenance === "learnedFromQuery",
        ),
      true,
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      learnedScope,
    );
    let learnedJoin = await joinPredicates(
      "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
    );
    assert.deepEqual(predicateLabels(learnedJoin), [
      "c.CompanyId = p.CompanyId AND c.ParentRef = p.ParentId",
    ]);
    assert.match(completionDetail(learnedJoin[0]), /Learned relationship JOIN/);
    assert.ok(learnedJoin[0]?.documentation instanceof vscode.MarkdownString);
    assert.match(learnedJoin[0].documentation.value, /repeated JOIN usage/i);
    assert.match(learnedJoin[0].documentation.value, /Observed in \*\*3\*\*/);
    assert.match(learnedJoin[0].documentation.value, /StrongEvidence/);
    assert.match(
      learnedJoin[0].documentation.value,
      /not a SQL Server foreign key/i,
    );
    assert.doesNotMatch(
      learnedJoin[0].documentation.value,
      /seenOccurrences|document hash|occurrence ordinal/i,
    );

    const siblingLearnedScope = await applyLearnedCandidates(
      unrelatedLearnedDocument,
      baseScope,
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      siblingLearnedScope,
    );
    assert.deepEqual(
      predicateLabels(
        await joinPredicates(
          "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
        ),
      ),
      [],
      "one observation in a sibling workspace must not inherit workspace A candidates",
    );

    for (let occurrence = 4; occurrence <= 8; occurrence++) {
      const extra = await observeWorkspaceSql(
        `learned-extra-${String(occurrence)}.sql`,
        joinSql,
      );
      assert.equal(
        (await waitForLearnedCount(extra, occurrence))[0]?.observationCount,
        occurrence,
      );
    }
    learnedScope = await applyLearnedCandidates(learnedDocument, baseScope);
    assert.notEqual(
      learnedScope.indexes.get(database.toLowerCase()),
      countThreeIndex,
      "evidence changes must invalidate the learned overlay",
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      learnedScope,
    );
    learnedJoin = await joinPredicates(
      "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
    );
    assert.ok(learnedJoin[0]?.documentation instanceof vscode.MarkdownString);
    assert.match(learnedJoin[0].documentation.value, /Observed in \*\*8\*\*/);

    await learningConfiguration.update(
      "enabled",
      false,
      vscode.ConfigurationTarget.Workspace,
    );
    const disabledCandidateScope = await applyLearnedCandidates(
      learnedDocument,
      baseScope,
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      disabledCandidateScope,
    );
    assert.equal(
      (
        await joinPredicates(
          "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
        )
      ).length,
      1,
      "disabling acquisition must keep qualifying existing candidates visible",
    );
    await learningConfiguration.update(
      "enabled",
      previousWorkspaceLearning,
      vscode.ConfigurationTarget.Workspace,
    );

    const learnedRelationshipFile = vscode.Uri.joinPath(
      temporaryWorkspaceUri,
      ".query-puppy",
      "relationships.json",
    );
    await assert.rejects(async () =>
      vscode.workspace.fs.stat(learnedRelationshipFile),
    );

    const acceptedLearnedSql = accept(
      "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
      learnedJoin[0]!,
    );
    const acceptedLearnedDocument = await openWorkspaceSql(
      "accepted-learned-completion.sql",
      acceptedLearnedSql,
    );
    assert.match(acceptedLearnedSql, /c\.ParentRef = p\.ParentId/);
    await assert.rejects(async () =>
      vscode.workspace.fs.stat(learnedRelationshipFile),
    );
    assert.equal(
      (await learnedEvidence(learnedDocument))[0]?.observationCount,
      8,
      "completion acceptance must not delete or confirm learned evidence",
    );

    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.clearLearnedRelationshipEvidence",
      learnedDocument,
    );
    const clearedCandidateScope = await applyLearnedCandidates(
      learnedDocument,
      baseScope,
    );
    assert.equal(
      clearedCandidateScope.indexes.get(database.toLowerCase()),
      index,
      "clear must drop the learned overlay without rebuilding physical metadata",
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      clearedCandidateScope,
    );
    assert.deepEqual(
      predicateLabels(
        await joinPredicates(
          "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
        ),
      ),
      [],
      "clear must remove a learned candidate on the next completion",
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.observeLearnedRelationshipEvidence",
      learnedDocument,
    );
    assert.equal(
      (await waitForLearnedCount(learnedDocument, 2))[0]?.observationCount,
      2,
    );
    const rebuiltThird = await observeWorkspaceSql(
      "learned-rebuilt-third.sql",
      joinSql,
    );
    assert.equal(
      (await waitForLearnedCount(rebuiltThird, 3))[0]?.observationCount,
      3,
    );

    const joinDocument = acceptedLearnedDocument;
    assert.equal(joinDocument.languageId, "sql");
    const acceptedRelationshipOffset = joinDocument
      .getText()
      .indexOf("c.ParentRef");
    assert.notEqual(acceptedRelationshipOffset, -1);
    const actionPosition = joinDocument.positionAt(acceptedRelationshipOffset);
    const directActions = await vscode.commands.executeCommand<
      readonly vscode.CodeAction[]
    >(
      "queryPuppyForTSql.test.provideRelationshipCodeActions",
      joinDocument,
      new vscode.Range(actionPosition, actionPosition),
    );
    assert.equal(
      directActions.filter(
        (action) => action.title === "Save JOIN as Query Puppy relationship",
      ).length,
      1,
      "direct save-JOIN provider is missing",
    );
    const actions = await relationshipCodeActions(
      joinDocument,
      acceptedRelationshipOffset,
    );
    const saveActions = actions.filter(
      (action) => action.title === "Save JOIN as Query Puppy relationship",
    );
    assert.equal(
      saveActions.length,
      1,
      "native save-JOIN Code Action is missing",
    );
    const saveAction = saveActions[0];
    assert.ok(saveAction && "command" in saveAction);
    assert.equal(typeof saveAction.command, "object");
    if (typeof saveAction.command !== "object")
      throw new Error("save-JOIN Code Action has no executable command");
    const commandArguments: readonly unknown[] =
      saveAction.command.arguments ?? [];
    await vscode.commands.executeCommand(
      saveAction.command.command,
      ...commandArguments,
    );

    const relationshipFile = learnedRelationshipFile;
    const persisted = JSON.parse(
      new TextDecoder().decode(
        await vscode.workspace.fs.readFile(relationshipFile),
      ),
    ) as {
      readonly version: number;
      readonly relationships: readonly {
        readonly provenance?: string;
        readonly source: { readonly object: string };
        readonly target: { readonly object: string };
        readonly mappings: readonly {
          readonly source: string;
          readonly target: string;
        }[];
        readonly declaredForeignKey?: unknown;
      }[];
    };
    assert.equal(persisted.version, 1);
    assert.deepEqual(persisted.relationships, [
      {
        provenance: "userConfirmed",
        source: {
          database,
          schema: "reltest",
          object: "ProjectChild",
        },
        target: {
          database,
          schema: "reltest",
          object: "ProjectParent",
        },
        mappings: [
          { source: "CompanyId", target: "CompanyId" },
          { source: "ParentRef", target: "ParentId" },
        ],
      },
    ]);
    assert.equal(
      "declaredForeignKey" in persisted.relationships[0]!,
      false,
      "saved project knowledge must not fabricate FK metadata",
    );
    const reversedSql = `SELECT *
FROM reltest.ProjectParent p
JOIN reltest.ProjectChild c
  ON p.ParentId = c.ParentRef
 AND p.CompanyId = c.CompanyId`;
    const reversedDocument = await openWorkspaceSql(
      "reversed-duplicate.sql",
      reversedSql,
    );
    assert.equal(
      (
        await relationshipCodeActions(
          reversedDocument,
          reversedSql.indexOf("p.ParentId"),
        )
      ).some(
        (action) => action.title === "Save JOIN as Query Puppy relationship",
      ),
      false,
      "reversed operands and AND order must not create a duplicate action",
    );

    const unrelatedUri = vscode.Uri.file(
      join(unrelatedWorkspacePath, "unrelated.sql"),
    );
    await vscode.workspace.fs.writeFile(
      unrelatedUri,
      new TextEncoder().encode(joinSql),
    );
    const unrelatedDocument =
      await vscode.workspace.openTextDocument(unrelatedUri);
    const unrelatedScope = await vscode.commands.executeCommand<
      typeof baseScope
    >(
      "queryPuppyForTSql.test.applyProjectRelationships",
      unrelatedDocument,
      baseScope,
    );
    assert.equal(
      unrelatedScope.indexes.get(database.toLowerCase()),
      index,
      "a sibling workspace root must not inherit the saved relationship",
    );

    const confirmedProjectScope = await vscode.commands.executeCommand<
      typeof baseScope
    >(
      "queryPuppyForTSql.test.applyProjectRelationships",
      joinDocument,
      baseScope,
    );
    assert.notEqual(
      confirmedProjectScope.indexes.get(database.toLowerCase()),
      index,
      "the save must invalidate and rebuild the workspace relationship overlay",
    );
    const confirmedScope = await applyLearnedCandidates(
      joinDocument,
      confirmedProjectScope,
    );
    const confirmedProvenances = confirmedScope.indexes
      .get(database.toLowerCase())
      ?.relationships.map((relationship) => relationship.provenance);
    assert.equal(
      confirmedProvenances?.filter(
        (provenance) => provenance === "userConfirmed",
      ).length,
      1,
    );
    assert.equal(
      confirmedProvenances.includes("learnedFromQuery"),
      false,
      "explicit confirmation must suppress the exact learned duplicate",
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      confirmedScope,
    );
    const confirmedJoin = await joinPredicates(
      "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
    );
    assert.deepEqual(predicateLabels(confirmedJoin), [
      "c.CompanyId = p.CompanyId AND c.ParentRef = p.ParentId",
    ]);
    assert.match(
      completionDetail(confirmedJoin[0]),
      /User-confirmed relationship JOIN/,
    );
    assert.ok(confirmedJoin[0]?.documentation instanceof vscode.MarkdownString);
    assert.match(
      confirmedJoin[0].documentation.value,
      /User-confirmed relationship/,
    );
    assert.doesNotMatch(
      confirmedJoin[0].documentation.value,
      /ON DELETE|constraint/i,
    );

    const confirmedObservationEditor = await vscode.window.showTextDocument(
      learnedDocument,
      { preview: false },
    );
    assert.equal(
      await confirmedObservationEditor.edit((builder) =>
        builder.insert(learnedDocument.positionAt(0), "-- confirmed now\n"),
      ),
      true,
    );
    assert.equal(await learnedDocument.save(), true);
    assert.deepEqual(
      await waitForLearnedCount(learnedDocument, 0),
      [],
      "UserConfirmed truth must remove and stop redundant local evidence",
    );
    assert.equal(
      (await learnedEvidence(unrelatedLearnedDocument))[0]?.observationCount,
      1,
      "confirmation in workspace A must not alter workspace B evidence",
    );

    for (const [filename, unsafeSql] of [
      [
        "unsafe-function.sql",
        "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON ISNULL(c.ParentRef, 0) = p.ParentId",
      ],
      [
        "unsafe-or.sql",
        "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON c.ParentRef = p.ParentId OR c.CompanyId = p.CompanyId",
      ],
    ] as const) {
      const unsafeDocument = await openWorkspaceSql(filename, unsafeSql);
      assert.equal(
        (
          await relationshipCodeActions(
            unsafeDocument,
            unsafeSql.indexOf("ON") + 3,
          )
        ).some(
          (action) => action.title === "Save JOIN as Query Puppy relationship",
        ),
        false,
      );
    }

    const fkSql =
      "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON oh.CustomerId = c.CustomerId";
    const fkDocument = await openWorkspaceSql("declared-fk.sql", fkSql);
    assert.equal(
      (
        await relationshipCodeActions(
          fkDocument,
          fkSql.indexOf("oh.CustomerId"),
        )
      ).some(
        (action) => action.title === "Save JOIN as Query Puppy relationship",
      ),
      false,
      "an exact declared FK must suppress redundant persistence",
    );
    const observedFkDocument = await observeWorkspaceSql(
      "learned-declared-fk.sql",
      fkSql,
    );
    assert.deepEqual(
      await learnedEvidence(observedFkDocument),
      [],
      "an authoritative declared FK must not create learned evidence",
    );

    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      baseScope,
    );
    const heuristicInput =
      "SELECT * FROM reltest.HeuristicOrders ho JOIN reltest.HeuristicCustomers hc ON";
    const heuristicItem = (await joinPredicates(heuristicInput))[0];
    assert.ok(heuristicItem, "activated heuristic completion is missing");
    const acceptedHeuristicSql = accept(heuristicInput, heuristicItem);
    const acceptedHeuristicDocument = await openWorkspaceSql(
      "accepted-heuristic-completion.sql",
      acceptedHeuristicSql,
      unrelatedWorkspacePath,
    );
    const unrelatedRelationshipFile = vscode.Uri.joinPath(
      vscode.Uri.file(unrelatedWorkspacePath),
      ".query-puppy",
      "relationships.json",
    );
    await assert.rejects(async () =>
      vscode.workspace.fs.stat(unrelatedRelationshipFile),
    );
    const unrelatedEvidenceBefore = await learnedEvidence(
      unrelatedLearnedDocument,
    );
    assert.deepEqual(
      await learnedEvidence(acceptedHeuristicDocument),
      unrelatedEvidenceBefore,
      "accepting a heuristic completion must not acquire learned evidence",
    );
    const heuristicActionOffset = acceptedHeuristicSql.indexOf("hc.CompanyId");
    const heuristicActions = await relationshipCodeActions(
      acceptedHeuristicDocument,
      heuristicActionOffset,
    );
    const saveHeuristicAction = heuristicActions.find(
      (action) => action.title === "Save JOIN as Query Puppy relationship",
    );
    assert.ok(
      saveHeuristicAction && "command" in saveHeuristicAction,
      "accepted heuristic predicate must use the existing save-JOIN action",
    );
    if (
      !("command" in saveHeuristicAction) ||
      typeof saveHeuristicAction.command !== "object"
    )
      throw new Error("heuristic save-JOIN action has no command");
    const heuristicCommandArguments: readonly unknown[] =
      saveHeuristicAction.command.arguments ?? [];
    await vscode.commands.executeCommand(
      saveHeuristicAction.command.command,
      ...heuristicCommandArguments,
    );
    const persistedHeuristic = JSON.parse(
      new TextDecoder().decode(
        await vscode.workspace.fs.readFile(unrelatedRelationshipFile),
      ),
    ) as {
      readonly relationships: readonly {
        readonly provenance?: string;
        readonly source: { readonly object: string };
        readonly target: { readonly object: string };
      }[];
    };
    assert.deepEqual(persistedHeuristic.relationships, [
      {
        provenance: "userConfirmed",
        source: {
          database,
          schema: "reltest",
          object: "HeuristicOrders",
        },
        target: {
          database,
          schema: "reltest",
          object: "HeuristicCustomers",
        },
        mappings: [
          { source: "CompanyId", target: "CompanyId" },
          { source: "HeuristicCustomerId", target: "Id" },
        ],
      },
    ]);
    const promotedHeuristicScope = await vscode.commands.executeCommand<
      typeof baseScope
    >(
      "queryPuppyForTSql.test.applyProjectRelationships",
      acceptedHeuristicDocument,
      baseScope,
    );
    assert.ok(promotedHeuristicScope);
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      promotedHeuristicScope,
    );
    const promotedHeuristicJoin = await joinPredicates(heuristicInput);
    assert.equal(promotedHeuristicJoin.length, 1);
    assert.match(
      completionDetail(promotedHeuristicJoin[0]),
      /User-confirmed relationship JOIN/,
    );
    assert.doesNotMatch(
      completionDetail(promotedHeuristicJoin[0]),
      /Heuristic/,
    );
    assert.deepEqual(
      await learnedEvidence(unrelatedLearnedDocument),
      unrelatedEvidenceBefore,
      "explicit heuristic promotion must not mutate learned evidence",
    );
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      baseScope,
    );

    const untitledJoin = await vscode.workspace.openTextDocument({
      language: "sql",
      content: joinSql,
    });
    assert.equal(
      (
        await relationshipCodeActions(
          untitledJoin,
          joinSql.indexOf("c.ParentRef"),
        )
      ).length,
      0,
      "no-workspace SQL must not offer project persistence",
    );
    assert.deepEqual(
      await vscode.commands.executeCommand(
        "queryPuppyForTSql.test.observeLearnedRelationshipEvidence",
        untitledJoin,
      ),
      { kind: "skipped", reason: "no owning workspace" },
    );
    assert.deepEqual(await learnedEvidence(untitledJoin), []);
    assert.equal(
      await applyLearnedCandidates(untitledJoin, baseScope),
      baseScope,
      "no-workspace SQL must not receive a learned relationship overlay",
    );
  } finally {
    await vscode.commands.executeCommand(
      "queryPuppyForTSql.test.setCompletionScope",
      baseScope,
    );
  }

  const previousStatement = `SELECT *
FROM reltest.Customers AS staleCustomer
WHERE staleCustomer.CustomerId = 1
ORDER BY staleCustomer.CustomerId`;
  for (const separator of ["\n\n", ";\n\n"]) {
    const sql = `${previousStatement}${separator}SELECT *\nFROM `;
    const items = await semanticCompletion(sql);
    const semanticKinds = items.flatMap((item) =>
      item.data?.semanticKind ? [item.data.semanticKind] : [],
    );
    assert.ok(labels(items).includes("dbo.Customers"));
    assert.ok(labels(items).includes("reltest.Customers"));
    assert.ok(labels(items).includes("GetCustomerAddresses_0001"));
    assert.equal(
      semanticKinds.some((kind) =>
        ["column", "rowSourceAlias", "scalarFunction", "procedure"].includes(
          kind,
        ),
      ),
      false,
      `stale/expression candidate leaked across ${JSON.stringify(separator)}`,
    );
  }

  const aliasedWhere = "SELECT * FROM reltest.Customers AS c WHERE Customer";
  const aliasedCustomerId = (await semanticCompletion(aliasedWhere)).find(
    (item) => item.filterText === "CustomerId",
  );
  assert.ok(aliasedCustomerId);
  assert.equal(aliasedCustomerId.insertText, "c.CustomerId");
  assert.equal(
    accept(aliasedWhere, aliasedCustomerId),
    "SELECT * FROM reltest.Customers AS c WHERE c.CustomerId",
  );

  const unaliasedWhere = "SELECT * FROM reltest.Customers WHERE Customer";
  const unaliasedCustomerId = (await semanticCompletion(unaliasedWhere)).find(
    (item) => item.filterText === "CustomerId",
  );
  assert.ok(unaliasedCustomerId);
  assert.equal(unaliasedCustomerId.insertText, "CustomerId");

  for (const sql of [
    "SELECT * FROM reltest.Customers AS c WHERE c.",
    "SELECT * FROM reltest.Customers AS c WHERE c.Cust",
  ]) {
    const item = (await semanticCompletion(sql)).find(
      (candidate) => candidate.filterText === "CustomerId",
    );
    assert.ok(item);
    assert.equal(item.insertText, "CustomerId");
    assert.equal(
      accept(sql, item),
      "SELECT * FROM reltest.Customers AS c WHERE c.CustomerId",
    );
  }

  const ambiguousAliases =
    "SELECT * FROM reltest.Customers AS c JOIN reltest.OrderHeaders AS oh ON CustomerId";
  const ambiguousCustomerIds = (
    await semanticCompletion(ambiguousAliases)
  ).filter(
    (item) =>
      item.data?.semanticKind === "column" && item.filterText === "CustomerId",
  );
  assert.deepEqual(
    ambiguousCustomerIds.map((item) => item.insertText),
    ["c.CustomerId", "oh.CustomerId"],
  );

  const correlatedAliases =
    "SELECT * FROM reltest.Customers AS c WHERE EXISTS (SELECT 1 FROM reltest.OrderHeaders AS oh WHERE Customer)";
  const correlatedCursor =
    correlatedAliases.indexOf("Customer)") + "Customer".length;
  const correlatedItems = await semanticCompletion(
    correlatedAliases,
    correlatedCursor,
  );
  assert.ok(correlatedItems.some((item) => item.insertText === "c.CustomerId"));
  assert.ok(
    correlatedItems.some((item) => item.insertText === "oh.CustomerId"),
  );

  const derivedAlias =
    "SELECT * FROM (SELECT CustomerId AS Id FROM reltest.Customers) AS d WHERE I";
  assert.equal(
    (await semanticCompletion(derivedAlias)).find(
      (item) => item.filterText === "Id",
    )?.insertText,
    "d.Id",
  );
  const cteAlias =
    "WITH x AS (SELECT CustomerId AS Id FROM reltest.Customers) SELECT * FROM x AS q WHERE I";
  assert.equal(
    (await semanticCompletion(cteAlias)).find(
      (item) => item.filterText === "Id",
    )?.insertText,
    "q.Id",
  );
  const projectionAlias =
    "SELECT c.CustomerId AS DisplayId FROM reltest.Customers AS c ORDER BY Display";
  assert.equal(
    (await semanticCompletion(projectionAlias)).find(
      (item) => item.filterText === "DisplayId",
    )?.insertText,
    "DisplayId",
  );

  const variableSql =
    "DECLARE @Mandant int = 1; DECLARE @Artikelnummer varchar(50); SELECT @";
  const registeredVariableItems = await registeredSemanticCompletion(
    variableSql,
    variableSql.length,
    "@",
  );
  const triggeredVariables = registeredVariableItems.filter((item) =>
    ["@Artikelnummer", "@Mandant"].includes(labels([item])[0] ?? ""),
  );
  assert.deepEqual(
    labels(triggeredVariables),
    ["@Artikelnummer", "@Mandant"],
    JSON.stringify(
      registeredVariableItems.map((item) => ({
        label: labels([item])[0],
        data: item.data,
      })),
    ),
  );
  const mandantVariable = triggeredVariables.find(
    (item) => labels([item])[0] === "@Mandant",
  );
  assert.ok(mandantVariable);
  assert.equal(mandantVariable.kind, vscode.CompletionItemKind.Variable);
  assert.ok(mandantVariable.documentation instanceof vscode.MarkdownString);
  assert.match(mandantVariable.documentation.value, /variable/i);
  assert.match(mandantVariable.documentation.value, /Type: `int`/);
  assert.equal(mandantVariable.insertText, "@Mandant");
  assert.equal(
    accept(variableSql, mandantVariable),
    "DECLARE @Mandant int = 1; DECLARE @Artikelnummer varchar(50); SELECT @Mandant",
  );
  assert.equal(
    (await semanticCompletion("DECLARE @Mandant int = 1;\nGO\nSELECT @")).some(
      (item) => labels([item])[0] === "@Mandant",
    ),
    false,
  );

  const expandStar = async (sql: string, expected: string): Promise<void> => {
    const document = await vscode.workspace.openTextDocument({
      language: "sql",
      content: sql,
    });
    const editor = await vscode.window.showTextDocument(document);
    const cursor = sql.indexOf("*") + 1;
    editor.selection = new vscode.Selection(
      document.positionAt(cursor),
      document.positionAt(cursor),
    );
    for (let attempt = 0; attempt < 20; attempt++) {
      await vscode.commands.executeCommand(
        "queryPuppyForTSql.expandSelectStar",
      );
      if (document.getText() === expected) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(document.getText(), expected);
  };
  await expandStar(
    "SELECT *\nFROM reltest.Customers AS c",
    `SELECT c.CustomerId,
       c.CustomerCode,
       c.ExternalKey,
       c.BillingAddressId,
       c.PrimaryAddressId,
       c.ShippingAddressId,
       c.DisplayName,
       c.RegionId,
       c.CreatedAt,
       c.Amount
FROM reltest.Customers AS c`,
  );
  await expandStar(
    "SELECT c.*\nFROM reltest.Customers AS c",
    `SELECT c.CustomerId,
       c.CustomerCode,
       c.ExternalKey,
       c.BillingAddressId,
       c.PrimaryAddressId,
       c.ShippingAddressId,
       c.DisplayName,
       c.RegionId,
       c.CreatedAt,
       c.Amount
FROM reltest.Customers AS c`,
  );
  const enterDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "SELECT *\nFROM reltest.Customers AS c",
  });
  const enterEditor = await vscode.window.showTextDocument(enterDocument);
  enterEditor.selection = new vscode.Selection(
    enterDocument.positionAt("SELECT *".length),
    enterDocument.positionAt("SELECT *".length),
  );
  await vscode.commands.executeCommand("type", { text: "\n" });
  assert.match(enterDocument.getText(), /^SELECT \*\n/);

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
  const heuristicSql =
    "SELECT * FROM reltest.HeuristicOrders ho JOIN reltest.HeuristicCustomers hc ON";
  const heuristicJoin = await joinPredicates(heuristicSql);
  assert.deepEqual(predicateLabels(heuristicJoin), [
    "hc.CompanyId = ho.CompanyId AND hc.Id = ho.HeuristicCustomerId",
  ]);
  assert.match(
    completionDetail(heuristicJoin[0]),
    /Heuristic relationship JOIN/,
  );
  assert.ok(heuristicJoin[0]?.documentation instanceof vscode.MarkdownString);
  assert.match(heuristicJoin[0].documentation.value, /Suggested relationship/);
  assert.match(heuristicJoin[0].documentation.value, /complete primary key/);
  assert.match(
    heuristicJoin[0].documentation.value,
    /known compatible SQL types/,
  );
  assert.match(heuristicJoin[0].documentation.value, /target name/i);
  assert.match(
    heuristicJoin[0].documentation.value,
    /Confidence: \*\*Candidate\*\*/,
  );
  assert.match(
    heuristicJoin[0].documentation.value,
    /not a SQL Server foreign key/,
  );
  assert.doesNotMatch(
    heuristicJoin[0].documentation.value,
    /ON DELETE|constraint ID|StrongEvidence|Confirmed/,
  );
  assert.equal(
    accept(heuristicSql, heuristicJoin[0]!),
    `${heuristicSql} hc.CompanyId = ho.CompanyId AND hc.Id = ho.HeuristicCustomerId`,
  );
  assert.equal(
    (
      await joinPredicates(
        "SELECT * FROM reltest.HeuristicIdenticalA a JOIN reltest.HeuristicIdenticalB b ON",
      )
    ).length,
    0,
    "identical composite key names must not produce a heuristic candidate",
  );
  const confirmedHeuristicRelationship: UserConfirmedRelationship = {
    provenance: RelationshipProvenance.UserConfirmed,
    confidence: RelationshipConfidence.Confirmed,
    source: {
      database,
      schema: "reltest",
      objectName: "HeuristicOrders",
      objectId: 71,
    },
    target: {
      database,
      schema: "reltest",
      objectName: "HeuristicCustomers",
      objectId: 70,
    },
    mappings: [
      {
        sourceColumnName: "CompanyId",
        targetColumnName: "CompanyId",
        ordinal: 1,
      },
      {
        sourceColumnName: "HeuristicCustomerId",
        targetColumnName: "Id",
        ordinal: 2,
      },
    ],
  };
  await vscode.commands.executeCommand(
    "queryPuppyForTSql.test.setCompletionScope",
    {
      ...baseScope,
      indexes: new Map([
        [
          database.toLowerCase(),
          new DatabaseIndex(index.metadata, [confirmedHeuristicRelationship]),
        ],
        [reportingDatabase.toLowerCase(), reportingIndex],
      ]),
    },
  );
  const strongerHeuristicJoin = await joinPredicates(heuristicSql);
  assert.equal(strongerHeuristicJoin.length, 1);
  assert.match(
    completionDetail(strongerHeuristicJoin[0]),
    /User-confirmed relationship JOIN/,
  );
  assert.doesNotMatch(completionDetail(strongerHeuristicJoin[0]), /Heuristic/);
  await vscode.commands.executeCommand(
    "queryPuppyForTSql.test.setCompletionScope",
    baseScope,
  );
  assert.deepEqual(
    predicateLabels(
      await joinPredicates(
        "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders ON",
      ),
    ),
    ["OrderHeaders.CustomerId = c.CustomerId"],
    "accepting ON without a Smart Alias must preserve FK intelligence",
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
  assert.equal(
    (
      await joinPredicates(
        "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
      )
    ).length,
    0,
    "a project relationship must not be inferred without an explicit definition",
  );
  await vscode.commands.executeCommand(
    "queryPuppyForTSql.test.setCompletionScope",
    {
      activeDatabase: database,
      indexes: new Map([
        [database.toLowerCase(), projectIndex],
        [reportingDatabase.toLowerCase(), reportingIndex],
      ]),
    },
  );
  const projectJoin = await joinPredicates(
    "SELECT * FROM reltest.ProjectParent p JOIN reltest.ProjectChild c ON",
  );
  assert.deepEqual(predicateLabels(projectJoin), [
    "c.CompanyId = p.CompanyId AND c.ParentRef = p.ParentId",
  ]);
  assert.match(completionDetail(projectJoin[0]), /Project relationship JOIN/);
  assert.ok(projectJoin[0]?.documentation instanceof vscode.MarkdownString);
  assert.match(
    projectJoin[0].documentation.value,
    /Project-defined relationship/,
  );
  assert.match(
    projectJoin[0].documentation.value,
    /not a SQL Server foreign key/,
  );
  assert.doesNotMatch(
    projectJoin[0].documentation.value,
    /ON DELETE|constraint/i,
  );
  const mixedTrust = await joinPredicates(
    "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON",
  );
  assert.deepEqual(predicateLabels(mixedTrust).slice(0, 2), [
    "oh.CustomerId = c.CustomerId",
    "oh.CompanyId = c.CustomerId",
  ]);
  assert.match(completionDetail(mixedTrust[0]), /FK JOIN/);
  assert.match(completionDetail(mixedTrust[1]), /Project relationship JOIN/);
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
    "CustomerId",
    "BillingAddressId",
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
  const secondUdfArgument = await typeAwareLabels(
    "SELECT billing.CalculateBillingTotal_0001(0, ol.|) FROM reltest.OrderLines AS ol;",
  );
  assert.equal(secondUdfArgument[0], "AmountExact");
  assert.ok(secondUdfArgument.includes("CompanyId"));
  const nestedUdfArgument = await typeAwareLabels(
    "SELECT billing.CalculateBillingTotal_0001(0, billing.CalculateBillingTotal_0001(ol.|, 0.19)) FROM reltest.OrderLines AS ol;",
  );
  assert.equal(nestedUdfArgument[0], "AmountExact");
  assert.ok(nestedUdfArgument.includes("OrderId"));
  const registeredUdfSql =
    "SELECT billing.CalculateBillingTotal_0001(ol., 0.19) FROM reltest.OrderLines AS ol;";
  const registeredUdfCursor = registeredUdfSql.indexOf("ol.") + 3;
  const registeredUdfItems = await registeredSemanticCompletion(
    registeredUdfSql,
    registeredUdfCursor,
    ".",
  );
  const registeredUdfMembers = registeredUdfItems.filter(
    (item) => item.kind === vscode.CompletionItemKind.Field,
  );
  assert.ok(
    registeredUdfMembers.length > 0,
    `catalog UDF argument returned no registered provider members: ${JSON.stringify(labels(registeredUdfItems))}`,
  );
  assert.equal(registeredUdfMembers[0]?.filterText, "AmountExact");
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
  const registeredUpdateSql =
    "UPDATE s SET ExternalReference = c. FROM IntelliSenseLab.reltest.CompletionLayoutStress AS s CROSS JOIN IntelliSenseLab.reltest.Customers AS c;";
  const registeredUpdateCursor = registeredUpdateSql.indexOf("c.") + 2;
  const registeredUpdateItems = await registeredSemanticCompletion(
    registeredUpdateSql,
    registeredUpdateCursor,
    ".",
  );
  const registeredUpdateMembers = registeredUpdateItems.filter(
    (item) => item.kind === vscode.CompletionItemKind.Field,
  );
  assert.ok(
    registeredUpdateMembers.length > 0,
    `UPDATE RHS returned no registered provider members: ${JSON.stringify(labels(registeredUpdateItems))}`,
  );
  assert.equal(registeredUpdateMembers[0]?.filterText, "ExternalKey");
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
  assert.deepEqual(labels(aliasAfterWhitespace), ["AS bp"]);
  const aliasAfterWhitespaceItem = aliasAfterWhitespace[0];
  assert.ok(aliasAfterWhitespaceItem);
  assert.deepEqual(aliasAfterWhitespaceItem.label, {
    label: "AS bp",
    description: "alias for BelegePositionen",
  });
  assert.equal(
    aliasAfterWhitespaceItem.kind,
    vscode.CompletionItemKind.Variable,
  );
  assert.equal(aliasAfterWhitespaceItem.filterText, "AS bp");
  assert.equal(aliasAfterWhitespaceItem.insertText, "AS bp");
  assert.equal(
    aliasAfterWhitespaceItem.detail,
    "alias for dbo.BelegePositionen",
  );
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
        (item) => item.detail === "alias for dbo.BelegePositionen",
      ),
    ),
    ["AS bp"],
  );

  const aliasAfterAsSql = `SELECT * FROM ${database}.dbo.BelegePositionen AS `;
  const aliasAfterAs = (await semanticCompletion(aliasAfterAsSql)).filter(
    (item) => item.data?.semanticKind === "rowSourceAlias",
  );
  assert.deepEqual(labels(aliasAfterAs), ["bp"]);
  const aliasAfterAsItem = aliasAfterAs[0];
  assert.ok(aliasAfterAsItem);
  assert.deepEqual(aliasAfterAsItem.label, {
    label: "bp",
    description: "alias for BelegePositionen",
  });
  assert.equal(aliasAfterAsItem.kind, vscode.CompletionItemKind.Variable);
  assert.equal(aliasAfterAsItem.filterText, "bp");
  assert.equal(aliasAfterAsItem.insertText, "bp");
  assert.deepEqual(
    aliasAfterAsItem.range,
    new vscode.Range(0, aliasAfterAsSql.length, 0, aliasAfterAsSql.length),
  );
  assert.deepEqual(
    labels(
      (await registeredSemanticCompletion(aliasAfterAsSql)).filter(
        (item) => item.detail === "alias for dbo.BelegePositionen",
      ),
    ),
    ["bp"],
  );

  const deepAlias = (
    await semanticCompletion(
      `SELECT * FROM ${database}.dbo.BelegePositionenDetails `,
    )
  ).filter((item) => item.data?.semanticKind === "rowSourceAlias");
  assert.deepEqual(labels(deepAlias), ["AS bpd"]);

  const collisionAlias = (
    await semanticCompletion(
      `SELECT * FROM ${database}.dbo.Belege AS bpd JOIN ${database}.dbo.BelegePositionenDetails `,
    )
  ).filter((item) => item.data?.semanticKind === "rowSourceAlias");
  assert.deepEqual(labels(collisionAlias), ["AS bpd2"]);

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
  assert.deepEqual(labels(crossDatabaseAlias), ["AS ap"]);

  const joinObjectPhase = `SELECT * FROM ${database}.reltest.Customers AS c JOIN ${database}.reltest.OrderHeaders `;
  assert.deepEqual(
    labels(
      (await semanticCompletion(joinObjectPhase)).filter(
        (item) => item.data?.semanticKind,
      ),
    ),
    ["AS oh", "ON"],
    "completed unaliased JOIN source must prefer Smart Alias and retain ON",
  );
  assert.deepEqual(
    labels(joinPhaseItems(await registeredSemanticCompletion(joinObjectPhase))),
    ["AS oh", "ON"],
    "registered provider must expose the same JOIN continuation domain",
  );
  const joinAsPhase = `${joinObjectPhase}AS `;
  assert.deepEqual(
    labels(joinPhaseItems(await registeredSemanticCompletion(joinAsPhase))),
    ["oh"],
    "explicit AS requires an alias and must suppress ON/object discovery",
  );
  for (const sql of [`${joinObjectPhase}oh `, `${joinObjectPhase}AS oh `])
    assert.deepEqual(
      labels(joinPhaseItems(await registeredSemanticCompletion(sql))),
      ["ON"],
      `${sql} must expose only the JOIN continuation keyword`,
    );
  const crossJoinPhase = `SELECT * FROM ${database}.reltest.Customers AS c CROSS JOIN ${database}.reltest.OrderHeaders `;
  assert.deepEqual(
    labels(joinPhaseItems(await registeredSemanticCompletion(crossJoinPhase))),
    ["AS oh"],
    "CROSS JOIN may be aliased but must not offer ON",
  );

  for (const sql of [
    `SELECT * FROM ${database}.dbo.BelegePositionen`,
    `SELECT * FROM ${database}.dbo.BelegePositionen AS`,
    `SELECT * FROM ${database}.dbo.Belege AS b JOIN ${database}.dbo.BelegePositionen`,
    `SELECT * FROM ${database}.dbo.Belege AS b JOIN ${database}.dbo.BelegePositionen AS`,
  ]) {
    const document = await vscode.workspace.openTextDocument({
      language: "sql",
      content: sql,
    });
    const editor = await vscode.window.showTextDocument(document);
    const end = document.positionAt(document.getText().length);
    editor.selection = new vscode.Selection(end, end);
    await takeAutomaticAliasSuggestInvocations();
    await takeAutomaticCompletionInvocations();
    const beforeVersion = document.version;
    const explicitAs = /\bAS$/i.test(sql);
    const join = /\bJOIN\b/i.test(sql);
    const expectedAlias = explicitAs ? "bp" : "AS bp";
    await vscode.commands.executeCommand("type", { text: " " });
    assert.equal(
      await waitForAutomaticAliasSuggest(),
      1,
      `typing alias-position whitespace did not trigger suggestions for ${sql}`,
    );
    const invocation = await waitForAutomaticCompletion("smartAlias");
    assert.ok(invocation, `no registered Smart Alias domain for ${sql}`);
    assert.equal(invocation.documentVersion, beforeVersion + 1, sql);
    assert.ok(
      invocation.items.some(
        (item) =>
          item.semanticKind === "rowSourceAlias" && item.name === expectedAlias,
      ),
      `first-space Smart Alias domain is missing ${expectedAlias} for ${sql}`,
    );
    assert.equal(
      invocation.items.some(
        (item) =>
          ["table", "view", "tableValuedFunction", "synonym"].includes(
            item.semanticKind,
          ) && item.name === "BelegePositionen",
      ),
      false,
      `first-space Smart Alias retained the stale object domain for ${sql}`,
    );
    assert.deepEqual(
      invocation.items,
      [
        { name: expectedAlias, semanticKind: "rowSourceAlias" },
        ...(join && !explicitAs
          ? [{ name: "ON", semanticKind: "keyword" }]
          : []),
      ],
      `${sql} automatic phase domain is not exact or deterministically ordered`,
    );
    assert.deepEqual(
      observedDomain(invocation),
      markedDomain(await semanticCompletion(document.getText())),
      `${sql} automatic and manual Query Puppy domains differ`,
    );
    await vscode.commands.executeCommand("hideSuggestWidget");
  }

  const joinContinuationDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: `SELECT * FROM ${database}.dbo.Belege AS b JOIN ${database}.dbo.BelegePositionen AS p`,
  });
  const joinContinuationEditor = await vscode.window.showTextDocument(
    joinContinuationDocument,
  );
  const joinContinuationEnd = joinContinuationDocument.positionAt(
    joinContinuationDocument.getText().length,
  );
  joinContinuationEditor.selection = new vscode.Selection(
    joinContinuationEnd,
    joinContinuationEnd,
  );
  await takeAutomaticCompletionInvocations();
  await vscode.commands.executeCommand("type", { text: " " });
  const joinContinuation = await waitForAutomaticCompletion("joinContinuation");
  assert.ok(joinContinuation, "JOIN continuation did not invoke completion");
  assert.deepEqual(joinContinuation.items, [
    { name: "ON", semanticKind: "keyword" },
  ]);
  await vscode.commands.executeCommand("hideSuggestWidget");

  const continuedOnDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: `SELECT * FROM ${database}.reltest.Addresses AS a JOIN ${database}.reltest.Customers AS c ON a.AddressId = c.BillingAddressId AND`,
  });
  const continuedOnEditor =
    await vscode.window.showTextDocument(continuedOnDocument);
  const continuedOnEnd = continuedOnDocument.positionAt(
    continuedOnDocument.getText().length,
  );
  continuedOnEditor.selection = new vscode.Selection(
    continuedOnEnd,
    continuedOnEnd,
  );
  await takeAutomaticCompletionInvocations();
  await vscode.commands.executeCommand("type", { text: " " });
  const continuedOn = await waitForAutomaticCompletion("joinOnContinuation");
  assert.ok(continuedOn, "continued JOIN ON did not invoke completion");
  assert.deepEqual(
    continuedOn.items
      .filter((item) => item.semanticKind === "joinPredicate")
      .map((item) => item.name),
    ["c.PrimaryAddressId = a.AddressId", "c.ShippingAddressId = a.AddressId"],
  );
  await vscode.commands.executeCommand("hideSuggestWidget");

  const onTriggerDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: `SELECT * FROM ${database}.dbo.Belege AS b JOIN ${database}.dbo.BelegePositionen AS p ON`,
  });
  const onTriggerEditor =
    await vscode.window.showTextDocument(onTriggerDocument);
  const onTriggerEnd = onTriggerDocument.positionAt(
    onTriggerDocument.getText().length,
  );
  onTriggerEditor.selection = new vscode.Selection(onTriggerEnd, onTriggerEnd);
  await takeAutomaticSemanticSuggestInvocations();
  await takeAutomaticCompletionInvocations();
  await vscode.commands.executeCommand("type", { text: " " });
  assert.equal(
    await waitForAutomaticSemanticSuggest(),
    1,
    "typing whitespace after JOIN ON did not trigger semantic suggestions",
  );
  const onInvocation = await waitForAutomaticCompletion("joinOn");
  assert.ok(
    onInvocation,
    "JOIN ON did not deliver a registered completion domain",
  );
  assert.ok(
    onInvocation.items.some(
      (item) =>
        item.semanticKind === "joinPredicate" &&
        item.name === "p.BelegId = b.BelegId",
    ),
    "automatic JOIN ON domain is missing the real FK predicate",
  );
  assert.deepEqual(
    observedDomain(onInvocation),
    markedDomain(await semanticCompletion(onTriggerDocument.getText())),
    "automatic and manual JOIN ON domains differ",
  );
  await vscode.commands.executeCommand("hideSuggestWidget");

  await takeAutomaticSemanticSuggestInvocations();
  for (const sql of ["UPDATE", "INSERT INTO", "DELETE FROM"]) {
    const document = await vscode.workspace.openTextDocument({
      language: "sql",
      content: sql,
    });
    const editor = await vscode.window.showTextDocument(document);
    const end = document.positionAt(document.getText().length);
    editor.selection = new vscode.Selection(end, end);
    await takeAutomaticCompletionInvocations();
    await vscode.commands.executeCommand("type", { text: " " });
    const manual = await semanticCompletion(`${sql} `);
    assert.ok(
      manual.some(
        (item) =>
          item.data?.semanticKind === "table" && labels([item])[0] === "Belege",
      ),
      `${sql} manual blank target domain is missing tables`,
    );
    assert.equal(
      manual.some((item) => item.data?.semanticKind === "builtinFunction"),
      false,
      `${sql} blank target domain leaked scalar built-ins`,
    );
    await vscode.commands.executeCommand("hideSuggestWidget");
  }
  assert.equal(
    await takeAutomaticSemanticSuggestInvocations(),
    0,
    "blank DML target whitespace must not force the multi-provider Suggest Widget",
  );
  assert.deepEqual(
    await takeAutomaticCompletionInvocations(),
    [],
    "blank DML target whitespace must not schedule a Query Puppy automatic invocation",
  );

  for (const sql of [
    `UPDATE ${database}.dbo.BelegePos`,
    `INSERT INTO ${database}.dbo.BelegePos`,
    `DELETE FROM ${database}.dbo.BelegePos`,
  ])
    assert.deepEqual(
      labels(
        (await semanticCompletion(sql)).filter(
          (item) => item.data?.semanticKind === "table",
        ),
      ),
      ["BelegePositionen", "BelegePositionenDetails"],
      sql,
    );
  assert.equal(
    (
      await semanticCompletion(
        `UPDATE ${database}.dbo.Belege SET Belegnummer = BelegePos`,
      )
    ).some((item) => item.data?.semanticKind === "table"),
    false,
    "UPDATE RHS must not switch to DML target object completion",
  );

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
    ["AS c"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Customers AS c;
SELECT * FROM ${database}.dbo.Customers `,
      ),
    ),
    ["AS c"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Customers AS c
JOIN ${database}.dbo.CustomerAddresses `,
      ),
    ),
    ["AS ca", "ON"],
  );
  assert.deepEqual(
    labels(
      await semanticCompletion(
        `SELECT * FROM ${database}.dbo.Customers AS c
JOIN ${database}.dbo.Customers `,
      ),
    ),
    ["AS c2", "ON"],
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

  const registeredCatalogItems = await registeredSemanticCompletion("SELECT ");
  const builtinNames = new Set(
    BUILTIN_FUNCTIONS.map((builtin) => builtin.name),
  );
  assert.deepEqual(
    labels(registeredCatalogItems).filter((name) => builtinNames.has(name)),
    BUILTIN_FUNCTIONS.map((builtin) => builtin.name),
  );

  const builtinItems = await registeredSemanticCompletion("SELECT dat");
  assert.deepEqual(
    labels(builtinItems).filter((name) => builtinNames.has(name)),
    [
      "DATEADD",
      "DATEDIFF",
      "DATEFROMPARTS",
      "DATENAME",
      "DATEPART",
      "GETDATE",
      "SYSDATETIME",
      "SYSUTCDATETIME",
    ],
  );
  assert.equal(
    (await semanticCompletion("SELECT * FROM dat")).some(
      (item) => item.data?.semanticKind === "builtinFunction",
    ),
    false,
  );
  const datepartItems =
    await registeredSemanticCompletion("SELECT DATEPART(mi");
  const matchingDateparts = new Set(["microsecond", "millisecond", "minute"]);
  assert.deepEqual(
    labels(datepartItems).filter((name) => matchingDateparts.has(name)),
    ["microsecond", "millisecond", "minute"],
  );
  for (const sql of [
    "SELECT ROW_NUMBER() OVER (PARTITION BY c. FROM dbo.Customers AS c",
    "SELECT ROW_NUMBER() OVER (ORDER BY c. FROM dbo.Customers AS c",
  ]) {
    const cursor = sql.indexOf("c.") + 2;
    const members = await semanticCompletion(sql, cursor);
    assert.deepEqual(
      labels(members).filter((name) =>
        ["CustomerCode", "CustomerId"].includes(name),
      ),
      ["CustomerCode", "CustomerId"],
    );
  }
  const overItems = await registeredSemanticCompletion(
    "SELECT ROW_NUMBER() OVER (",
  );
  assert.deepEqual(
    labels(overItems).filter((name) =>
      ["ORDER BY", "PARTITION BY"].includes(name),
    ),
    ["ORDER BY", "PARTITION BY"],
  );
  for (const name of [
    "ABS",
    "CHARINDEX",
    "COALESCE",
    "CONCAT",
    "COUNT",
    "DATEADD",
    "DATEDIFF",
    "DATEFROMPARTS",
    "DATENAME",
    "ROUND",
    "ROW_NUMBER",
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
  const signatureProcedureIndex = new DatabaseIndex({
    ...index.metadata,
    objects: [
      ...index.objects,
      {
        schema: "billing",
        name: "UpdateBillingAddress_0001",
        normalizedName: "updatebillingaddress_0001",
        kind: "procedure",
        columns: [],
        parameters: [
          {
            name: "@CustomerId",
            type: { name: "bigint" },
            output: false,
            ordinal: 1,
          },
          {
            name: "@BillingAddressId",
            type: { name: "bigint" },
            output: false,
            ordinal: 2,
          },
          {
            name: "@RowsAffected",
            type: { name: "int" },
            output: true,
            ordinal: 3,
          },
        ],
      },
    ],
  });
  await vscode.commands.executeCommand(
    "queryPuppyForTSql.test.setSignatureScope",
    {
      activeDatabase: database,
      indexes: new Map([[database.toLowerCase(), signatureProcedureIndex]]),
    },
  );
  const unqualifiedCatalog = await signature(
    "SELECT CalculateBillingTotal_0001(",
    "(",
  );
  assert.equal(unqualifiedCatalog.activeParameter, 0);
  assert.match(
    unqualifiedCatalog.signatures[0]?.label ?? "",
    /^billing\.CalculateBillingTotal_0001\(/,
  );

  const procedure = await signature("EXEC billing.UpdateBillingAddress_0001 ");
  assert.equal(procedure.activeParameter, 0);
  assert.match(
    procedure.signatures[0]?.label ?? "",
    /^EXEC billing\.UpdateBillingAddress_0001 /,
  );
  assert.deepEqual(
    procedure.signatures[0]?.parameters.map((parameter) => parameter.label),
    [
      "@CustomerId bigint",
      "@BillingAddressId bigint",
      "@RowsAffected int OUTPUT",
    ],
  );
  const namedProcedure = await signature(
    "EXEC billing.UpdateBillingAddress_0001 @CustomerId = 1, @BillingAddressId = ",
  );
  assert.equal(namedProcedure.activeParameter, 1);
  const positionalProcedure = await signature(
    "EXEC billing.UpdateBillingAddress_0001 1, ",
    ",",
  );
  assert.equal(positionalProcedure.activeParameter, 1);

  const automaticProcedure = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "EXEC billing.UpdateBillingAddress_0001",
  });
  const automaticProcedureEditor =
    await vscode.window.showTextDocument(automaticProcedure);
  const automaticProcedureEnd = automaticProcedure.positionAt(
    automaticProcedure.getText().length,
  );
  automaticProcedureEditor.selection = new vscode.Selection(
    automaticProcedureEnd,
    automaticProcedureEnd,
  );
  await takeInvocations();
  await vscode.commands.executeCommand("type", { text: " " });
  assert.ok(
    (await waitForInvocation(undefined, true)).some(
      (invocation) =>
        invocation.triggerKind === vscode.SignatureHelpTriggerKind.Invoke,
    ),
    "typing procedure-argument whitespace did not invoke Signature Help",
  );

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

  const duplicateSchemaIndex = new DatabaseIndex({
    database,
    schemas: ["qpacc", "billing", "shipping"],
    loadedAt: 0,
    objects: [
      ...["qpacc", "billing", "shipping"].map((schema, ordinal) => ({
        id: 800 + ordinal,
        schema,
        name: "Addresses",
        normalizedName: "addresses",
        kind: "table" as const,
        parameters: [],
        columns: [
          {
            name: `${schema}Only`,
            normalizedName: `${schema}only`,
            type: { name: "int" },
            nullable: false,
            ordinal: 1,
          },
        ],
      })),
      {
        id: 810,
        schema: "qpacc",
        name: "UniqueOrders",
        normalizedName: "uniqueorders",
        kind: "table" as const,
        parameters: [],
        columns: [],
      },
    ],
  });
  await vscode.commands.executeCommand(
    "queryPuppyForTSql.test.setCompletionScope",
    {
      activeDatabase: database,
      indexes: new Map([[database.toLowerCase(), duplicateSchemaIndex]]),
    },
  );
  const duplicateItems = (
    await semanticCompletion("SELECT * FROM Addr")
  ).filter((item) => item.data?.semanticKind === "table");
  assert.deepEqual(labels(duplicateItems), [
    "billing.Addresses",
    "qpacc.Addresses",
    "shipping.Addresses",
  ]);
  assert.deepEqual(
    duplicateItems.map((item) => item.insertText),
    ["billing.Addresses", "qpacc.Addresses", "shipping.Addresses"],
  );
  assert.deepEqual(
    labels(await semanticCompletion("SELECT * FROM qpacc.Addr")),
    ["Addresses"],
  );
  assert.deepEqual(labels(await semanticCompletion("SELECT * FROM Unique")), [
    "UniqueOrders",
  ]);
  await takeAmbiguityNotifications();
  const ambiguousDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "SELECT * FROM Addresses AS a WHERE a.",
  });
  for (let invocation = 0; invocation < 2; invocation++) {
    const result = await vscode.commands.executeCommand<
      vscode.CompletionList | readonly vscode.CompletionItem[]
    >(
      "vscode.executeCompletionItemProvider",
      ambiguousDocument.uri,
      ambiguousDocument.positionAt(ambiguousDocument.getText().length),
      ".",
    );
    const items =
      result instanceof vscode.CompletionList ? result.items : result;
    assert.equal(
      items.some(
        (item) =>
          (item as MarkedCompletionItem).data?.semanticKind === "column",
      ),
      false,
    );
  }
  assert.deepEqual(await takeAmbiguityNotifications(), [
    'Query Puppy: "Addresses" is ambiguous across schemas. Qualify it with a schema to enable semantic suggestions.',
  ]);
}
