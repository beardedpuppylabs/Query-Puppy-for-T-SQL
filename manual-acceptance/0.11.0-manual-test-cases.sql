/*
  Query Puppy for T-SQL 0.11.0 manual acceptance cases.
  Execute no statements from this file against production data.
  Place the cursor at the described location and trigger native Suggest.
  Expected results live in 0.11.0-acceptance-inventory-and-expectations.md.
*/

USE [IntelliSenseLab];
GO

/* SECTION A
   OBJECT / SCHEMA COMPLETION
*/

/* TEST 01
   Database-qualified schema navigation.
   Cursor after the final dot.
*/
SELECT *
FROM IntelliSenseLab.

/* TEST 02
   Database-wide shortcut across schemas.
   Cursor at end of fragment.
*/
SELECT *
FROM IntelliSenseLab.addr

/* TEST 03
   Strict database/schema object navigation.
   Cursor at end of fragment.
*/
SELECT *
FROM IntelliSenseLab.qpacc.addr

/* SECTION B
   PHYSICAL COLUMNS AND PK / UQ / FK METADATA
*/

/* TEST 04
   Physical-column metadata roles and canonical presentation.
   Cursor at end of c.customer.
*/
SELECT c.customer
FROM qpacc.Customers AS c

/* TEST 05
   Long physical identifier filtering and insertion.
   Cursor at end of s.reference.
*/
SELECT s.reference
FROM qpacc.CompletionLayoutStress AS s

/* TEST 06
   No ExpectedType ordering.
   Cursor after s.
*/
SELECT s.
FROM qpacc.CompletionLayoutStress AS s

/* SECTION C
   CONTAINS AND PREFIX COLLISION
*/

/* TEST 07
   Row-source Contains in the active database.
   Cursor at end of fragment.
*/
SELECT *
FROM qpacc.addr

/* TEST 08
   Prefix-family Contains while identifier token is active.
   Cursor at end of fragment.
*/
SELECT *
FROM qpacc.Belege

/* TEST 09
   Explicit alias member Contains.
   Cursor at end of c.addr.
*/
SELECT c.addr
FROM qpacc.Customers AS c

/* SECTION D
   SMART ALIAS
*/

/* TEST 10
   Smart Alias after whitespace.
   After pasting, type one space at the end of the FROM line.
   Cursor immediately after that space.
*/
SELECT *
FROM qpacc.BelegePositionen

/* TEST 11
   Smart Alias after AS.
   After pasting, type one space after AS.
   Cursor immediately after that space.
*/
SELECT *
FROM qpacc.BelegePositionen AS

/* TEST 12
   Smart Alias collision fallback in one visible scope.
   After pasting, type one space at the end of the JOIN line.
   Cursor immediately after that space.
*/
SELECT *
FROM qpacc.Belege AS bpd
JOIN qpacc.BelegePositionenDetails

/* SECTION E
   CTE / DERIVED / TEMP / TABLE VARIABLE / VALUES / APPLY
*/

/* TEST 13
   CTE projection member completion.
   Cursor after x.
*/
WITH X AS
(
    SELECT CustomerId, BillingAddressId, EmailAddress
    FROM qpacc.Customers
)
SELECT x.
FROM X AS x;

/* TEST 14
   CTE explicit column-list override.
   Cursor after x.
*/
WITH X (EntityId, AddressValue) AS
(
    SELECT CustomerId, EmailAddress
    FROM qpacc.Customers
)
SELECT x.
FROM X AS x;

/* TEST 15
   SELECT INTO local row source.
   Cursor after t.
*/
SELECT CustomerId, BillingAddressId
INTO #QpManualCustomerProjection
FROM qpacc.Customers;

SELECT t.
FROM #QpManualCustomerProjection AS t;

/* TEST 16
   Table variable local row source.
   Cursor after v.
*/
DECLARE @CustomerWork TABLE
(
    WorkId bigint NOT NULL,
    WorkCode nvarchar(50) NULL
);

SELECT v.
FROM @CustomerWork AS v;

/* TEST 17
   Derived-table projection.
   Cursor after d.
*/
SELECT d.
FROM
(
    SELECT CustomerId AS Id, EmailAddress AS Contact
    FROM qpacc.Customers
) AS d;

/* TEST 18
   VALUES row source projection.
   Cursor after v.
*/
SELECT v.
FROM (VALUES (1, N'a')) AS v(ValueId, ValueName);

/* TEST 19
   APPLY projection.
   Cursor after lastOrder.
*/
SELECT lastOrder.
FROM qpacc.Customers AS c
CROSS APPLY
(
    SELECT TOP 1 oh.OrderId, oh.OrderNumber
    FROM qpacc.OrderHeaders AS oh
    WHERE oh.CustomerId = c.CustomerId
) AS lastOrder;

/* SECTION F
   QUERYSCOPE / CORRELATED QUERIES / SET OPERATIONS
*/

/* TEST 20
   Correlated subquery.
   Cursor after c.
*/
SELECT *
FROM qpacc.Customers AS c
WHERE EXISTS
(
    SELECT 1
    FROM qpacc.OrderHeaders AS oh
    WHERE oh.CustomerId = c.
);

/* TEST 21
   Ordinary derived-table non-correlation.
   Cursor after c.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN
(
    SELECT 1
    FROM qpacc.OrderHeaders AS oh
    WHERE oh.CustomerId = c.
) AS d ON 1 = 1;

/* TEST 22
   Sibling scope isolation.
   Cursor after oh.
*/
SELECT *
FROM qpacc.Customers AS c
WHERE EXISTS
(
    SELECT 1
    FROM qpacc.OrderHeaders AS oh
)
AND EXISTS
(
    SELECT oh.
    FROM qpacc.Addresses AS a
);

/* TEST 23
   ORDER BY projection alias.
   Cursor at end of fragment.
*/
SELECT c.EmailAddress AS Contact
FROM qpacc.Customers AS c
ORDER BY cont

/* TEST 24
   GROUP BY projection alias negative case.
   Cursor at end of fragment.
*/
SELECT c.EmailAddress AS Contact
FROM qpacc.Customers AS c
GROUP BY cont

/* TEST 25
   Set-operation result names.
   Cursor after x.
*/
WITH X AS
(
    SELECT c.CustomerId AS Id, c.EmailAddress AS Value
    FROM qpacc.Customers AS c
    UNION ALL
    SELECT oh.OrderId AS WrongId, oh.OrderNumber AS WrongValue
    FROM qpacc.OrderHeaders AS oh
)
SELECT x.
FROM X AS x;

/* TEST 26
   Set-operation branch isolation.
   Cursor after c. in the second branch.
*/
SELECT c.CustomerId
FROM qpacc.Customers AS c
UNION ALL
SELECT oh.OrderId
FROM qpacc.OrderHeaders AS oh
WHERE c.

/* SECTION G
   WILDCARD EXPANSION
*/

/* TEST 27
   Wildcard expansion for one aliased source.
   Put the cursor after the star and press Tab.
*/
SELECT c.*
FROM qpacc.Customers AS c;

/* TEST 28
   Wildcard expansion for multiple sources.
   Put the cursor after the star and press Tab.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders AS oh ON oh.CustomerId = c.CustomerId;

/* SECTION H
   RELATIONSHIP-AWARE JOIN
*/

/* TEST 29
   FK JOIN predicate, dependent right side.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders AS oh ON

/* TEST 30
   FK JOIN predicate, principal right side.
   Cursor after ON.
*/
SELECT *
FROM qpacc.OrderHeaders AS oh
JOIN qpacc.Customers AS c ON

/* TEST 31
   Multiple FK predicates between the same two row sources.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.Addresses AS a ON

/* TEST 32
   Composite FK predicate.
   Cursor after ON.
*/
SELECT *
FROM qpacc.OrderHeaders AS oh
JOIN qpacc.OrderLines AS ol ON

/* TEST 33
   Cross-schema FK predicate.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc_ref.Regions AS r ON

/* TEST 34
   Disabled FK negative relationship case.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.LegacyCustomerLinks AS l ON

/* TEST 35
   Unrelated table negative relationship case.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.Products AS p ON

/* TEST 36
   Relationship-aware JOIN source ranking.
   Cursor after schema dot.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.

/* TEST 37
   Positional JOIN visibility before future alias.
   Check the first ca. and then the second ca.
   Cursor immediately after the selected dot.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders AS oh
  ON ca.
JOIN qpacc.Addresses AS ca
  ON ca.

/* SECTION I
   COMPARISON EXPECTEDTYPE
*/

/* TEST 38
   Comparison ExpectedType for bigint.
   Cursor after c.
*/
SELECT *
FROM qpacc.OrderHeaders AS oh
JOIN qpacc.Customers AS c ON oh.CustomerId = c.

/* TEST 39
   Comparison ExpectedType for varchar.
   Cursor after c.
*/
SELECT *
FROM qpacc.Customers AS c
WHERE c.CustomerNumber = c.

/* TEST 40
   Comparison ExpectedType for uniqueidentifier.
   Cursor after c.
*/
SELECT *
FROM qpacc.Customers AS c
WHERE c.ExternalKey = c.

/* SECTION J
   CATALOG UDF / TVF
*/

/* TEST 41
   Catalog scalar-function argument ExpectedType.
   Cursor after ol.
*/
SELECT qpacc.CalculateBillingTotal_Manual(ol., 0.19)
FROM qpacc.OrderLines AS ol;

/* TEST 42
   Catalog scalar Signature Help.
   Cursor after opening parenthesis.
*/
SELECT qpacc.CalculateBillingTotal_Manual(

/* TEST 43
   Catalog TVF Signature Help.
   Cursor after opening parenthesis.
*/
SELECT *
FROM qpacc.GetCustomerAddresses_Manual(

/* SECTION K
   BUILT-IN FUNCTIONS
*/

/* TEST 44
   Built-in expression completion.
   Cursor at end of fragment.
*/
SELECT dat

/* TEST 45
   Built-in Signature Help.
   Cursor after opening parenthesis.
*/
SELECT DATEADD(

/* TEST 46
   Built-in DATEADD date argument ExpectedType with incomplete call.
   Cursor after s.
*/
SELECT DATEADD(day, 1, s.
FROM qpacc.CompletionLayoutStress AS s;

/* TEST 47
   Built-in DATEADD number argument ExpectedType with incomplete call.
   Cursor after c.
*/
SELECT DATEADD(day, c.
FROM qpacc.Customers AS c;

/* TEST 48
   Built-in SUBSTRING expression ExpectedType with incomplete call.
   Cursor after c.
*/
SELECT SUBSTRING(c.
FROM qpacc.Customers AS c;

/* SECTION L
   DML
*/

/* TEST 49
   UPDATE positional assignment ExpectedType.
   Cursor after c.
*/
UPDATE s
SET CustomerId = c.CustomerId,
    ExternalReference = c.
FROM IntelliSenseLab.qpacc.CompletionLayoutStress AS s
CROSS JOIN IntelliSenseLab.qpacc.Customers AS c;

/* TEST 50
   INSERT SELECT ExpectedType.
   Cursor after ol.
*/
INSERT INTO qpacc.TypedTargets (Amount)
SELECT ol.
FROM qpacc.OrderLines AS ol;

/* TEST 51
   INSERT writable target columns.
   Cursor at end of target-list fragment.
*/
INSERT INTO qpacc.CompletionLayoutStress (Ref

/* TEST 52
   UPDATE writable target columns.
   Cursor at end of SET fragment.
*/
UPDATE qpacc.CompletionLayoutStress
SET Ref

/* TEST 53
   EXEC named parameters.
   Cursor after @.
*/
EXEC qpacc.FindCustomerAddress_Manual @

/* TEST 54
   EXEC used-parameter exclusion.
   Cursor after final @.
*/
EXECUTE qpacc.FindCustomerAddress_Manual @Search = N'x', @

/* TEST 55
   INSERT OUTPUT inserted pseudo source.
   Cursor after inserted.
*/
INSERT INTO qpacc.Customers (CustomerNumber)
OUTPUT inserted.
VALUES (

/* TEST 56
   DELETE OUTPUT deleted pseudo source.
   Cursor after deleted.
*/
DELETE FROM qpacc.Customers
OUTPUT deleted.
WHERE

/* TEST 57
   Invalid deleted statement must not expose inserted.
   Cursor after inserted.
*/
DELETE FROM qpacc.Customers
OUTPUT inserted.
WHERE

/* SECTION M
   CROSS-DATABASE
*/

/* TEST 58
   Same-server database discovery.
   Cursor at end of fragment.
*/
SELECT *
FROM Intelli

/* TEST 59
   Secondary database schema navigation.
   Cursor after the final dot.
*/
SELECT *
FROM IntelliSenseLabReporting.

/* TEST 60
   Secondary database strict schema completion.
   Cursor at end of fragment.
*/
SELECT *
FROM IntelliSenseLabReporting.qpacc.Customer

/* TEST 61
   Cross-database aliases in one query.
   Cursor after r. and separately after c.
*/
SELECT c., r.
FROM IntelliSenseLab.qpacc.Customers AS c
JOIN IntelliSenseLabReporting.qpacc.Customers AS r
  ON r.ReportingCustomerId = c.CustomerId;

/* TEST 62
   Cross-database set branch identity.
   Cursor after r.
*/
SELECT c.CustomerId AS Id, c.EmailAddress AS Value
FROM IntelliSenseLab.qpacc.Customers AS c
UNION ALL
SELECT r.ReportingCustomerId AS IgnoredId, r.ReportingEmailAddress AS IgnoredValue
FROM IntelliSenseLabReporting.qpacc.Customers AS r
WHERE r.

/* TEST 63
   Cross-database CTE star projection isolation.
   Cursor after y.
*/
WITH active_projection AS
(
    SELECT c.CustomerId, c.EmailAddress
    FROM IntelliSenseLab.qpacc.Customers AS c
),
reporting_projection AS
(
    SELECT *
    FROM IntelliSenseLabReporting.qpacc_archive.CustomerAddressArchive AS a
)
SELECT y.
FROM active_projection AS x
JOIN reporting_projection AS y ON y.ReportingCustomerId = x.CustomerId;

/* TEST 64
   Four-part names are outside scope.
   Cursor after final dot.
*/
SELECT *
FROM SomeLinkedServer.IntelliSenseLab.qpacc.

/* SECTION N
   PERSISTENT CACHE / MANUAL REFRESH
*/

/* TEST 65
   Persistent cache cold-load trigger.
   First run the clear-cache command for the active database, then use this cursor.
*/
SELECT c.
FROM qpacc.Customers AS c;

/* TEST 66
   Persistent cache warm-start trigger.
   Restart the editor/Extension Host, reconnect the same database, then use this cursor.
*/
SELECT oh.
FROM qpacc.OrderHeaders AS oh;

/* TEST 67
   Manual refresh trigger.
   Run the refresh command while keeping this completion point usable.
*/
SELECT ol.
FROM qpacc.OrderLines AS ol;

/* TEST 68
   Secondary database lazy cache trigger.
   Cursor after r.
*/
SELECT r.
FROM IntelliSenseLabReporting.qpacc.Customers AS r;
