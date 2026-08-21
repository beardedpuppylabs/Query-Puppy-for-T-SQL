/*
  Query Puppy for T-SQL 0.11.0 manual acceptance fixture extension.
  Run manually in SQL Server Management Studio, Azure Data Studio, or the mssql
  editor as an administrator/test-owner account. Codex must not execute this.

  The script is intentionally additive:
  - creates only qpacc/qpacc_ref fixtures in IntelliSenseLab
  - creates only qpacc/qpacc_archive fixtures in IntelliSenseLabReporting
  - repairs only missing qpacc constraints through guarded ALTER TABLE statements
  - does not drop, rename, truncate, or modify fixture data
*/

IF DB_ID(N'IntelliSenseLab') IS NULL
    CREATE DATABASE [IntelliSenseLab];
GO

USE [IntelliSenseLab];
GO

IF SCHEMA_ID(N'qpacc') IS NULL EXEC(N'CREATE SCHEMA [qpacc]');
IF SCHEMA_ID(N'qpacc_ref') IS NULL EXEC(N'CREATE SCHEMA [qpacc_ref]');
GO

IF OBJECT_ID(N'qpacc_ref.Regions', N'U') IS NULL
CREATE TABLE qpacc_ref.Regions
(
    RegionId int NOT NULL CONSTRAINT PK_qpacc_ref_Regions PRIMARY KEY,
    RegionCode varchar(20) NOT NULL CONSTRAINT UQ_qpacc_ref_Regions_RegionCode UNIQUE,
    RegionName nvarchar(100) NULL
);
GO

IF OBJECT_ID(N'qpacc.Addresses', N'U') IS NULL
CREATE TABLE qpacc.Addresses
(
    AddressId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_qpacc_Addresses PRIMARY KEY,
    AddressCode varchar(50) NOT NULL CONSTRAINT UQ_qpacc_Addresses_AddressCode UNIQUE,
    City nvarchar(100) NULL,
    AddressLine nvarchar(200) NULL
);
GO

IF OBJECT_ID(N'qpacc.Customers', N'U') IS NULL
CREATE TABLE qpacc.Customers
(
    CustomerId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_qpacc_Customers PRIMARY KEY,
    CustomerNumber varchar(30) NOT NULL CONSTRAINT UQ_qpacc_Customers_CustomerNumber UNIQUE,
    DisplayName nvarchar(200) NULL,
    EmailAddress nvarchar(255) NULL,
    ExternalKey uniqueidentifier NULL,
    PrimaryAddressId bigint NULL,
    BillingAddressId bigint NULL,
    ShippingAddressId bigint NULL,
    RegionId int NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_qpacc_Customers_CreatedAt DEFAULT (sysdatetime()),
    Amount decimal(18,2) NULL,
    CONSTRAINT FK_qpacc_Customers_PrimaryAddress FOREIGN KEY (PrimaryAddressId) REFERENCES qpacc.Addresses(AddressId),
    CONSTRAINT FK_qpacc_Customers_BillingAddress FOREIGN KEY (BillingAddressId) REFERENCES qpacc.Addresses(AddressId),
    CONSTRAINT FK_qpacc_Customers_ShippingAddress FOREIGN KEY (ShippingAddressId) REFERENCES qpacc.Addresses(AddressId),
    CONSTRAINT FK_qpacc_Customers_Region FOREIGN KEY (RegionId) REFERENCES qpacc_ref.Regions(RegionId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'qpacc.Customers') AND name = N'UX_qpacc_Customers_ExternalKey')
    CREATE UNIQUE INDEX UX_qpacc_Customers_ExternalKey ON qpacc.Customers(ExternalKey) WHERE ExternalKey IS NOT NULL;
GO

IF OBJECT_ID(N'qpacc.OrderHeaders', N'U') IS NULL
CREATE TABLE qpacc.OrderHeaders
(
    CompanyId int NOT NULL,
    OrderId bigint NOT NULL,
    CustomerId bigint NOT NULL,
    OrderNumber varchar(50) NOT NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_qpacc_OrderHeaders_CreatedAt DEFAULT (sysdatetime()),
    CONSTRAINT PK_qpacc_OrderHeaders PRIMARY KEY (CompanyId, OrderId),
    CONSTRAINT UQ_qpacc_OrderHeaders_OrderNumber UNIQUE (OrderNumber),
    CONSTRAINT FK_qpacc_OrderHeaders_Customers FOREIGN KEY (CustomerId) REFERENCES qpacc.Customers(CustomerId)
);
GO

IF OBJECT_ID(N'qpacc.OrderLines', N'U') IS NULL
BEGIN
    CREATE TABLE qpacc.OrderLines
    (
        CompanyId int NOT NULL,
        OrderId bigint NOT NULL,
        [LineNo] int NOT NULL,
        ProductCode varchar(50) NOT NULL,
        Quantity decimal(18,4) NOT NULL,
        AmountExact decimal(38,18) NULL
    );
END;
GO

IF OBJECT_ID(N'qpacc.OrderLines', N'U') IS NULL
    THROW 51000, N'qpacc.OrderLines was not created. Resolve the preceding CREATE TABLE error and rerun this script.', 1;
GO

IF OBJECT_ID(N'qpacc.PK_qpacc_OrderLines', N'PK') IS NULL
BEGIN
    ALTER TABLE qpacc.OrderLines
        ADD CONSTRAINT PK_qpacc_OrderLines PRIMARY KEY (CompanyId, OrderId, [LineNo]);
END;
GO

IF OBJECT_ID(N'qpacc.PK_qpacc_OrderLines', N'PK') IS NULL
    THROW 51003, N'qpacc.OrderLines exists but its expected composite primary key was not created.', 1;
GO

IF OBJECT_ID(N'qpacc.FK_qpacc_OrderLines_OrderHeaders', N'F') IS NULL
BEGIN
    ALTER TABLE qpacc.OrderLines
        ADD CONSTRAINT FK_qpacc_OrderLines_OrderHeaders
        FOREIGN KEY (CompanyId, OrderId)
        REFERENCES qpacc.OrderHeaders(CompanyId, OrderId);
END;
GO

IF OBJECT_ID(N'qpacc.FK_qpacc_OrderLines_OrderHeaders', N'F') IS NULL
    THROW 51004, N'qpacc.OrderLines exists but its expected composite foreign key was not created.', 1;
GO

IF OBJECT_ID(N'qpacc.CustomerAliases', N'U') IS NULL
CREATE TABLE qpacc.CustomerAliases
(
    CustomerAliasId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_qpacc_CustomerAliases PRIMARY KEY,
    CustomerId bigint NOT NULL CONSTRAINT UQ_qpacc_CustomerAliases_CustomerId UNIQUE,
    AliasCode varchar(50) NOT NULL,
    CONSTRAINT FK_qpacc_CustomerAliases_Customers FOREIGN KEY (CustomerId) REFERENCES qpacc.Customers(CustomerId) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'qpacc.Products', N'U') IS NULL
CREATE TABLE qpacc.Products
(
    ProductId bigint NOT NULL CONSTRAINT PK_qpacc_Products PRIMARY KEY,
    ProductCode varchar(50) NOT NULL,
    ProductName nvarchar(200) NULL,
    CategoryCode varchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'qpacc.Products') AND name = N'UX_qpacc_Products_ProductCode')
    CREATE UNIQUE INDEX UX_qpacc_Products_ProductCode ON qpacc.Products(ProductCode) INCLUDE(ProductName, CategoryCode);
GO

IF OBJECT_ID(N'qpacc.LegacyCustomerLinks', N'U') IS NULL
CREATE TABLE qpacc.LegacyCustomerLinks
(
    LegacyLinkId bigint NOT NULL CONSTRAINT PK_qpacc_LegacyCustomerLinks PRIMARY KEY,
    CustomerId bigint NOT NULL
);
GO

IF OBJECT_ID(N'qpacc.FK_qpacc_LegacyCustomerLinks_Customers', N'F') IS NULL
BEGIN
    ALTER TABLE qpacc.LegacyCustomerLinks WITH NOCHECK
        ADD CONSTRAINT FK_qpacc_LegacyCustomerLinks_Customers
        FOREIGN KEY(CustomerId) REFERENCES qpacc.Customers(CustomerId);
    ALTER TABLE qpacc.LegacyCustomerLinks NOCHECK CONSTRAINT FK_qpacc_LegacyCustomerLinks_Customers;
END;
GO

IF OBJECT_ID(N'qpacc.CompletionLayoutStress', N'U') IS NULL
CREATE TABLE qpacc.CompletionLayoutStress
(
    Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_qpacc_CompletionLayoutStress PRIMARY KEY,
    Amount decimal(38,18) NOT NULL,
    BinaryPayload varbinary(max) NULL,
    Code varchar(20) NOT NULL,
    CustomerId bigint NOT NULL,
    DisplayName nvarchar(400) NULL,
    ExternalReference uniqueidentifier NULL,
    OccurredAt datetimeoffset(7) NOT NULL,
    Payload nvarchar(max) NULL,
    UniqueCustomerId bigint NOT NULL CONSTRAINT UQ_qpacc_CompletionLayoutStress_UniqueCustomerId UNIQUE,
    VeryLongERPBusinessTransactionPostingReferenceIdentifier nvarchar(200) NULL,
    RowVersion rowversion NOT NULL,
    ComputedDisplayName AS (DisplayName)
);
GO

IF OBJECT_ID(N'qpacc.TypedTargets', N'U') IS NULL
CREATE TABLE qpacc.TypedTargets
(
    CustomerId bigint NOT NULL,
    ExternalReference uniqueidentifier NULL,
    Amount decimal(18,2) NULL
);
GO

IF OBJECT_ID(N'qpacc.Belege', N'U') IS NULL
CREATE TABLE qpacc.Belege
(
    BelegId bigint NOT NULL CONSTRAINT PK_qpacc_Belege PRIMARY KEY,
    Belegnummer varchar(50) NOT NULL,
    KundenId bigint NULL,
    Belegdatum datetime2(3) NOT NULL,
    Gesamtbetrag decimal(18,2) NULL
);
GO

IF OBJECT_ID(N'qpacc.BelegePositionen', N'U') IS NULL
CREATE TABLE qpacc.BelegePositionen
(
    BelegPositionId bigint NOT NULL CONSTRAINT PK_qpacc_BelegePositionen PRIMARY KEY,
    BelegId bigint NOT NULL,
    Positionsnummer int NOT NULL,
    Artikelnummer varchar(50) NULL,
    Menge decimal(18,4) NULL,
    Einzelpreis decimal(18,2) NULL,
    CONSTRAINT UQ_qpacc_BelegePositionen_Beleg_Position UNIQUE (BelegId, Positionsnummer),
    CONSTRAINT FK_qpacc_BelegePositionen_Belege FOREIGN KEY (BelegId) REFERENCES qpacc.Belege(BelegId)
);
GO

IF OBJECT_ID(N'qpacc.BelegePositionenDetails', N'U') IS NULL
CREATE TABLE qpacc.BelegePositionenDetails
(
    BelegPositionDetailId bigint NOT NULL CONSTRAINT PK_qpacc_BelegePositionenDetails PRIMARY KEY,
    BelegPositionId bigint NOT NULL,
    DetailCode varchar(50) NOT NULL,
    DetailValue nvarchar(400) NULL,
    CONSTRAINT FK_qpacc_BelegePositionenDetails_BelegePositionen FOREIGN KEY (BelegPositionId) REFERENCES qpacc.BelegePositionen(BelegPositionId)
);
GO

CREATE OR ALTER FUNCTION qpacc.CalculateBillingTotal_Manual
(
    @NetAmount decimal(18,2),
    @TaxRate decimal(9,4)
)
RETURNS decimal(18,2)
AS
BEGIN
    RETURN CONVERT(decimal(18,2), @NetAmount * (1 + @TaxRate));
END;
GO

CREATE OR ALTER FUNCTION qpacc.GetCustomerAddresses_Manual
(
    @CustomerId bigint
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        c.CustomerId,
        c.BillingAddressId,
        c.ShippingAddressId,
        c.EmailAddress
    FROM qpacc.Customers AS c
    WHERE c.CustomerId = @CustomerId
);
GO

CREATE OR ALTER VIEW qpacc.ActiveCustomerAddresses
AS
    SELECT
        c.CustomerId,
        c.PrimaryAddressId,
        c.BillingAddressId,
        c.ShippingAddressId,
        c.EmailAddress
    FROM qpacc.Customers AS c;
GO

CREATE OR ALTER PROCEDURE qpacc.FindCustomerAddress_Manual
    @Search nvarchar(400),
    @MaxRows int = 20,
    @RowsAffected int OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @RowsAffected = 0;
    SELECT TOP (@MaxRows)
        c.CustomerId,
        c.EmailAddress
    FROM qpacc.Customers AS c
    WHERE c.EmailAddress LIKE N'%' + @Search + N'%';
END;
GO

DECLARE @MissingIntelliSenseLabObjects nvarchar(2048) = N'';
SELECT @MissingIntelliSenseLabObjects = @MissingIntelliSenseLabObjects
    + CASE WHEN @MissingIntelliSenseLabObjects = N'' THEN N'' ELSE N', ' END
    + QUOTENAME(expected.SchemaName) + N'.' + QUOTENAME(expected.ObjectName)
FROM
(
    VALUES
        (N'qpacc_ref', N'Regions', N'U'),
        (N'qpacc', N'Addresses', N'U'),
        (N'qpacc', N'Customers', N'U'),
        (N'qpacc', N'OrderHeaders', N'U'),
        (N'qpacc', N'OrderLines', N'U'),
        (N'qpacc', N'CustomerAliases', N'U'),
        (N'qpacc', N'Products', N'U'),
        (N'qpacc', N'LegacyCustomerLinks', N'U'),
        (N'qpacc', N'CompletionLayoutStress', N'U'),
        (N'qpacc', N'TypedTargets', N'U'),
        (N'qpacc', N'Belege', N'U'),
        (N'qpacc', N'BelegePositionen', N'U'),
        (N'qpacc', N'BelegePositionenDetails', N'U'),
        (N'qpacc', N'CalculateBillingTotal_Manual', N'FN'),
        (N'qpacc', N'GetCustomerAddresses_Manual', N'IF'),
        (N'qpacc', N'ActiveCustomerAddresses', N'V'),
        (N'qpacc', N'FindCustomerAddress_Manual', N'P')
) AS expected(SchemaName, ObjectName, ObjectType)
WHERE OBJECT_ID(
    QUOTENAME(expected.SchemaName) + N'.' + QUOTENAME(expected.ObjectName),
    expected.ObjectType
) IS NULL;

IF @MissingIntelliSenseLabObjects <> N''
BEGIN
    SET @MissingIntelliSenseLabObjects =
        N'IntelliSenseLab qpacc acceptance fixture provisioning is incomplete: '
        + @MissingIntelliSenseLabObjects;
    THROW 51001, @MissingIntelliSenseLabObjects, 1;
END;
GO

IF SUSER_ID(N'intellisense_test') IS NOT NULL AND DATABASE_PRINCIPAL_ID(N'intellisense_test') IS NULL
    CREATE USER [intellisense_test] FOR LOGIN [intellisense_test];
IF DATABASE_PRINCIPAL_ID(N'intellisense_test') IS NOT NULL
BEGIN
    GRANT CONNECT TO [intellisense_test];
    GRANT VIEW DEFINITION TO [intellisense_test];
END;
GO

IF DB_ID(N'IntelliSenseLabReporting') IS NULL
    CREATE DATABASE [IntelliSenseLabReporting];
GO

USE [IntelliSenseLabReporting];
GO

IF SCHEMA_ID(N'qpacc') IS NULL EXEC(N'CREATE SCHEMA [qpacc]');
IF SCHEMA_ID(N'qpacc_archive') IS NULL EXEC(N'CREATE SCHEMA [qpacc_archive]');
GO

IF OBJECT_ID(N'qpacc.Customers', N'U') IS NULL
CREATE TABLE qpacc.Customers
(
    ReportingCustomerId bigint NOT NULL CONSTRAINT PK_qpacc_Reporting_Customers PRIMARY KEY,
    CustomerNumber varchar(30) NOT NULL CONSTRAINT UQ_qpacc_Reporting_Customers_CustomerNumber UNIQUE,
    CustomerDisplayName nvarchar(200) NOT NULL,
    ReportingEmailAddress nvarchar(255) NULL,
    ReportAddressId bigint NULL,
    ReportingGroup nvarchar(50) NULL,
    SnapshotDate date NOT NULL,
    LastReportedAt datetime2(3) NOT NULL
);
GO

IF OBJECT_ID(N'qpacc.Auftraege', N'U') IS NULL
CREATE TABLE qpacc.Auftraege
(
    AuftragId bigint NOT NULL CONSTRAINT PK_qpacc_Auftraege PRIMARY KEY,
    Auftragsnummer varchar(50) NOT NULL,
    ReportingCustomerId bigint NOT NULL
);
GO

IF OBJECT_ID(N'qpacc.AuftraegePositionen', N'U') IS NULL
CREATE TABLE qpacc.AuftraegePositionen
(
    AuftragPositionId bigint NOT NULL CONSTRAINT PK_qpacc_AuftraegePositionen PRIMARY KEY,
    AuftragId bigint NOT NULL,
    Positionsnummer int NOT NULL,
    Beschreibung nvarchar(200) NULL,
    CONSTRAINT FK_qpacc_AuftraegePositionen_Auftraege FOREIGN KEY (AuftragId) REFERENCES qpacc.Auftraege(AuftragId)
);
GO

IF OBJECT_ID(N'qpacc_archive.CustomerAddressArchive', N'U') IS NULL
CREATE TABLE qpacc_archive.CustomerAddressArchive
(
    ArchiveId bigint NOT NULL CONSTRAINT PK_qpacc_archive_CustomerAddressArchive PRIMARY KEY,
    ReportingCustomerId bigint NOT NULL,
    ReportAddressId bigint NULL,
    ReportingEmailAddress nvarchar(255) NULL,
    SnapshotDate date NOT NULL,
    ArchiveReason nvarchar(100) NULL
);
GO

CREATE OR ALTER VIEW qpacc.ActiveCustomerAddresses
AS
    SELECT
        c.ReportingCustomerId,
        c.CustomerDisplayName,
        c.ReportingEmailAddress,
        c.ReportAddressId,
        c.SnapshotDate
    FROM qpacc.Customers AS c;
GO

CREATE OR ALTER VIEW qpacc.CustomerAddressReport
AS
    SELECT
        c.ReportingCustomerId,
        c.CustomerNumber,
        c.CustomerDisplayName,
        c.ReportingEmailAddress,
        c.ReportAddressId,
        c.ReportingGroup,
        c.SnapshotDate,
        c.LastReportedAt
    FROM qpacc.Customers AS c;
GO

CREATE OR ALTER FUNCTION qpacc.GetCustomerAddresses
(
    @ReportingCustomerId bigint
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        c.ReportingCustomerId,
        c.CustomerDisplayName,
        c.ReportingEmailAddress,
        c.ReportAddressId,
        c.SnapshotDate
    FROM qpacc.Customers AS c
    WHERE c.ReportingCustomerId = @ReportingCustomerId
);
GO

DECLARE @MissingIntelliSenseLabReportingObjects nvarchar(2048) = N'';
SELECT @MissingIntelliSenseLabReportingObjects = @MissingIntelliSenseLabReportingObjects
    + CASE WHEN @MissingIntelliSenseLabReportingObjects = N'' THEN N'' ELSE N', ' END
    + QUOTENAME(expected.SchemaName) + N'.' + QUOTENAME(expected.ObjectName)
FROM
(
    VALUES
        (N'qpacc', N'Customers', N'U'),
        (N'qpacc', N'Auftraege', N'U'),
        (N'qpacc', N'AuftraegePositionen', N'U'),
        (N'qpacc_archive', N'CustomerAddressArchive', N'U'),
        (N'qpacc', N'ActiveCustomerAddresses', N'V'),
        (N'qpacc', N'CustomerAddressReport', N'V'),
        (N'qpacc', N'GetCustomerAddresses', N'IF')
) AS expected(SchemaName, ObjectName, ObjectType)
WHERE OBJECT_ID(
    QUOTENAME(expected.SchemaName) + N'.' + QUOTENAME(expected.ObjectName),
    expected.ObjectType
) IS NULL;

IF @MissingIntelliSenseLabReportingObjects <> N''
BEGIN
    SET @MissingIntelliSenseLabReportingObjects =
        N'IntelliSenseLabReporting qpacc acceptance fixture provisioning is incomplete: '
        + @MissingIntelliSenseLabReportingObjects;
    THROW 51002, @MissingIntelliSenseLabReportingObjects, 1;
END;
GO

IF SUSER_ID(N'intellisense_test') IS NOT NULL AND DATABASE_PRINCIPAL_ID(N'intellisense_test') IS NULL
    CREATE USER [intellisense_test] FOR LOGIN [intellisense_test];
IF DATABASE_PRINCIPAL_ID(N'intellisense_test') IS NOT NULL
BEGIN
    GRANT CONNECT TO [intellisense_test];
    GRANT VIEW DEFINITION TO [intellisense_test];
END;
GO
