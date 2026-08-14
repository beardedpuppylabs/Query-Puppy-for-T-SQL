/* Idempotent, persistent IntelliSenseLab fixture for 0.8.x relationship tests and manual acceptance. */
USE [IntelliSenseLab];
GO
IF SCHEMA_ID(N'reltest') IS NULL EXEC(N'CREATE SCHEMA [reltest]');
IF SCHEMA_ID(N'relref') IS NULL EXEC(N'CREATE SCHEMA [relref]');
GO
IF OBJECT_ID(N'relref.Regions', N'U') IS NULL
CREATE TABLE relref.Regions (
 RegionId int NOT NULL CONSTRAINT PK_relref_Regions PRIMARY KEY,
 RegionCode varchar(20) NOT NULL CONSTRAINT UQ_relref_Regions_RegionCode UNIQUE,
 RegionName nvarchar(100) NULL
);
GO
IF OBJECT_ID(N'reltest.Addresses', N'U') IS NULL
CREATE TABLE reltest.Addresses (
 AddressId bigint IDENTITY NOT NULL CONSTRAINT PK_reltest_Addresses PRIMARY KEY,
 AddressCode varchar(50) NOT NULL CONSTRAINT UQ_reltest_Addresses_AddressCode UNIQUE,
 City nvarchar(100) NULL
);
GO
IF OBJECT_ID(N'reltest.Customers', N'U') IS NULL
CREATE TABLE reltest.Customers (
 CustomerId bigint IDENTITY NOT NULL CONSTRAINT PK_reltest_Customers PRIMARY KEY,
 CustomerCode varchar(50) NOT NULL CONSTRAINT UQ_reltest_Customers_CustomerCode UNIQUE,
 DisplayName nvarchar(200) NULL,
 ExternalKey uniqueidentifier NULL,
 PrimaryAddressId bigint NULL,
 BillingAddressId bigint NULL,
 ShippingAddressId bigint NULL,
 RegionId int NULL,
 CONSTRAINT FK_reltest_Customers_PrimaryAddress FOREIGN KEY (PrimaryAddressId) REFERENCES reltest.Addresses(AddressId),
 CONSTRAINT FK_reltest_Customers_BillingAddress FOREIGN KEY (BillingAddressId) REFERENCES reltest.Addresses(AddressId),
 CONSTRAINT FK_reltest_Customers_ShippingAddress FOREIGN KEY (ShippingAddressId) REFERENCES reltest.Addresses(AddressId),
 CONSTRAINT FK_reltest_Customers_Region FOREIGN KEY (RegionId) REFERENCES relref.Regions(RegionId)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'reltest.Customers') AND name=N'UX_reltest_Customers_ExternalKey')
 CREATE UNIQUE INDEX UX_reltest_Customers_ExternalKey ON reltest.Customers(ExternalKey) WHERE ExternalKey IS NOT NULL;
GO
IF OBJECT_ID(N'reltest.OrderHeaders', N'U') IS NULL
CREATE TABLE reltest.OrderHeaders (
 CompanyId int NOT NULL,
 OrderId bigint NOT NULL,
 CustomerId bigint NOT NULL,
 OrderNumber varchar(50) NOT NULL,
 CreatedAt datetime2(3) NOT NULL,
 CONSTRAINT PK_reltest_OrderHeaders PRIMARY KEY (CompanyId, OrderId),
 CONSTRAINT UQ_reltest_OrderHeaders_OrderNumber UNIQUE (OrderNumber),
 CONSTRAINT FK_reltest_OrderHeaders_Customer FOREIGN KEY (CustomerId) REFERENCES reltest.Customers(CustomerId)
);
GO
IF OBJECT_ID(N'reltest.OrderLines', N'U') IS NULL
CREATE TABLE reltest.OrderLines (
 CompanyId int NOT NULL,
 OrderId bigint NOT NULL,
 LineNo int NOT NULL,
 ProductCode varchar(50) NOT NULL,
 Quantity decimal(18,4) NOT NULL,
 CONSTRAINT PK_reltest_OrderLines PRIMARY KEY (CompanyId, OrderId, LineNo),
 CONSTRAINT FK_reltest_OrderLines_OrderHeaders FOREIGN KEY (CompanyId, OrderId) REFERENCES reltest.OrderHeaders(CompanyId, OrderId)
);
GO
IF OBJECT_ID(N'reltest.CustomerAliases', N'U') IS NULL
CREATE TABLE reltest.CustomerAliases (
 CustomerAliasId bigint IDENTITY NOT NULL CONSTRAINT PK_reltest_CustomerAliases PRIMARY KEY,
 CustomerId bigint NOT NULL CONSTRAINT UQ_reltest_CustomerAliases_CustomerId UNIQUE,
 AliasCode varchar(50) NOT NULL,
 CONSTRAINT FK_reltest_CustomerAliases_Customer FOREIGN KEY (CustomerId) REFERENCES reltest.Customers(CustomerId)
);
GO
IF DATABASE_PRINCIPAL_ID(N'intellisense_test') IS NOT NULL
BEGIN
 GRANT CONNECT TO [intellisense_test];
 GRANT VIEW DEFINITION TO [intellisense_test];
END;
GO
