/*
  Idempotent disposable fixture for tests/integration/intellisense-lab.test.ts.
  Run as an administrator on the same test SQL Server. This script creates no
  application data and grants the restricted integration login metadata access.
*/
IF DB_ID(N'IntelliSenseLabReporting') IS NULL
    CREATE DATABASE [IntelliSenseLabReporting];
GO

USE [IntelliSenseLabReporting];
GO

IF SCHEMA_ID(N'reporting') IS NULL EXEC(N'CREATE SCHEMA [reporting]');
IF SCHEMA_ID(N'sales') IS NULL EXEC(N'CREATE SCHEMA [sales]');
IF SCHEMA_ID(N'billing') IS NULL EXEC(N'CREATE SCHEMA [billing]');
GO

IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
    CREATE TABLE dbo.Customers
    (
        CustomerId bigint NOT NULL PRIMARY KEY,
        PrimaryAddressId bigint NULL,
        EmailAddress nvarchar(255) NULL
    );
GO

IF OBJECT_ID(N'billing.BillingAddresses', N'U') IS NULL
    CREATE TABLE billing.BillingAddresses
    (
        BillingAddressId bigint NOT NULL PRIMARY KEY,
        CustomerId bigint NOT NULL,
        AddressLine nvarchar(200) NULL
    );
GO

IF OBJECT_ID(N'sales.CustomerOrders', N'U') IS NULL
    CREATE TABLE sales.CustomerOrders
    (
        OrderId bigint NOT NULL PRIMARY KEY,
        CustomerId bigint NOT NULL,
        OrderNumber nvarchar(50) NOT NULL
    );
GO

CREATE OR ALTER VIEW reporting.CustomerAddressReport
AS
    SELECT
        c.CustomerId,
        c.PrimaryAddressId AS ReportAddressId,
        c.EmailAddress
    FROM dbo.Customers AS c;
GO

IF DATABASE_PRINCIPAL_ID(N'intellisense_test') IS NULL
    CREATE USER [intellisense_test] FOR LOGIN [intellisense_test];
GRANT CONNECT TO [intellisense_test];
GRANT VIEW DEFINITION TO [intellisense_test];
GO
