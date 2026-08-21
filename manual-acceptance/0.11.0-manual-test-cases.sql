/*
  Query Puppy for T-SQL 0.11.0 manual acceptance cases.
  Execute no statements from this file against production data.
  Place the cursor at the described location and trigger native Suggest.
  Expected results live in 0.11.0-acceptance-inventory-and-expectations.md.
*/

USE [IntelliSenseLab];
GO

/* TEST 01
   Row-source Contains in the active database.
   Cursor at end of fragment.
*/
SELECT *
FROM qpacc.addr

/* TEST 02
   Database-qualified schema navigation.
   Cursor after the final dot.
*/
SELECT *
FROM IntelliSenseLab.

/* TEST 03
   Database-wide shortcut across schemas.
   Cursor at end of fragment.
*/
SELECT *
FROM IntelliSenseLab.addr

/* TEST 04
   Strict database/schema object navigation.
   Cursor at end of fragment.
*/
SELECT *
FROM IntelliSenseLab.qpacc.addr

/* TEST 05
   Prefix-family Contains while identifier token is active.
   Cursor at end of fragment.
*/
SELECT *
FROM qpacc.Belege

/* TEST 06
   Smart Alias after whitespace.
   Cursor after trailing whitespace.
*/
SELECT *
FROM qpacc.BelegePositionen 

/* TEST 07
   Smart Alias after AS.
   Cursor after trailing whitespace.
*/
SELECT *
FROM qpacc.BelegePositionen AS 

/* TEST 08
   Smart Alias collision fallback in one visible scope.
   Cursor after trailing whitespace.
*/
SELECT *
FROM qpacc.Belege AS bpd
JOIN qpacc.BelegePositionenDetails 

/* TEST 09
   Explicit alias member Contains.
   Cursor at end of c.addr.
*/
SELECT c.addr
FROM qpacc.Customers AS c

/* TEST 10
   Physical-column metadata roles and canonical presentation.
   Cursor at end of c.customer.
*/
SELECT c.customer
FROM qpacc.Customers AS c

/* TEST 11
   Long physical identifier filtering and insertion.
   Cursor at end of s.reference.
*/
SELECT s.reference
FROM qpacc.CompletionLayoutStress AS s

/* TEST 12
   No ExpectedType ordering.
   Cursor after s.
*/
SELECT s.
FROM qpacc.CompletionLayoutStress AS s

/* TEST 13
   Comparison ExpectedType for bigint.
   Cursor after c.
*/
SELECT *
FROM qpacc.OrderHeaders AS oh
JOIN qpacc.Customers AS c ON oh.CustomerId = c.

/* TEST 14
   Comparison ExpectedType for varchar.
   Cursor after c.
*/
SELECT *
FROM qpacc.Customers AS c
WHERE c.CustomerNumber = c.

/* TEST 15
   Comparison ExpectedType for uniqueidentifier.
   Cursor after c.
*/
SELECT *
FROM qpacc.Customers AS c
WHERE c.ExternalKey = c.

/* TEST 16
   Built-in DATEADD date argument ExpectedType with incomplete call.
   Cursor after s.
*/
SELECT DATEADD(day, 1, s.
FROM qpacc.CompletionLayoutStress AS s;

/* TEST 17
   Built-in DATEADD number argument ExpectedType with incomplete call.
   Cursor after c.
*/
SELECT DATEADD(day, c.
FROM qpacc.Customers AS c;

/* TEST 18
   Built-in SUBSTRING expression ExpectedType with incomplete call.
   Cursor after c.
*/
SELECT SUBSTRING(c.
FROM qpacc.Customers AS c;

/* TEST 19
   Catalog scalar-function argument ExpectedType.
   Cursor after ol.
*/
SELECT qpacc.CalculateBillingTotal_Manual(ol., 0.19)
FROM qpacc.OrderLines AS ol;

/* TEST 20
   UPDATE RHS ExpectedType for uniqueidentifier.
   Cursor after c.
*/
UPDATE s
SET ExternalReference = c.
FROM IntelliSenseLab.qpacc.CompletionLayoutStress AS s
CROSS JOIN IntelliSenseLab.qpacc.Customers AS c;

/* TEST 21
   UPDATE positional assignment ExpectedType.
   Cursor after c.
*/
UPDATE s
SET CustomerId = c.CustomerId,
    ExternalReference = c.
FROM IntelliSenseLab.qpacc.CompletionLayoutStress AS s
CROSS JOIN IntelliSenseLab.qpacc.Customers AS c;

/* TEST 22
   INSERT SELECT ExpectedType.
   Cursor after ol.
*/
INSERT INTO qpacc.TypedTargets (Amount)
SELECT ol.
FROM qpacc.OrderLines AS ol;

/* TEST 23
   INSERT writable target columns.
   Cursor at end of target-list fragment.
*/
INSERT INTO qpacc.CompletionLayoutStress (Ref

/* TEST 24
   UPDATE writable target columns.
   Cursor at end of SET fragment.
*/
UPDATE qpacc.CompletionLayoutStress
SET Ref

/* TEST 25
   EXEC named parameters.
   Cursor after @.
*/
EXEC qpacc.FindCustomerAddress_Manual @

/* TEST 26
   EXEC used-parameter exclusion.
   Cursor after final @.
*/
EXECUTE qpacc.FindCustomerAddress_Manual @Search = N'x', @

/* TEST 27
   INSERT OUTPUT inserted pseudo source.
   Cursor after inserted.
*/
INSERT INTO qpacc.Customers (CustomerNumber)
OUTPUT inserted.
VALUES (

/* TEST 28
   DELETE OUTPUT deleted pseudo source.
   Cursor after deleted.
*/
DELETE FROM qpacc.Customers
OUTPUT deleted.
WHERE

/* TEST 29
   Invalid deleted statement must not expose inserted.
   Cursor after inserted.
*/
DELETE FROM qpacc.Customers
OUTPUT inserted.
WHERE

/* TEST 30
   FK JOIN predicate, dependent right side.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders AS oh ON

/* TEST 31
   FK JOIN predicate, principal right side.
   Cursor after ON.
*/
SELECT *
FROM qpacc.OrderHeaders AS oh
JOIN qpacc.Customers AS c ON

/* TEST 32
   Multiple FK predicates between the same two row sources.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.Addresses AS a ON

/* TEST 33
   Composite FK predicate.
   Cursor after ON.
*/
SELECT *
FROM qpacc.OrderHeaders AS oh
JOIN qpacc.OrderLines AS ol ON

/* TEST 34
   Cross-schema FK predicate.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc_ref.Regions AS r ON

/* TEST 35
   Disabled FK negative relationship case.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.LegacyCustomerLinks AS l ON

/* TEST 36
   Unrelated table negative relationship case.
   Cursor after ON.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.Products AS p ON

/* TEST 37
   Relationship-aware JOIN source ranking.
   Cursor after schema dot.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.

/* TEST 38
   Positional JOIN visibility before future alias.
   Cursor after the first ca.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders AS oh
  ON ca.
JOIN qpacc.Addresses AS ca
  ON ca.

/* TEST 39
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

/* TEST 40
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

/* TEST 41
   SELECT INTO local row source.
   Cursor after t.
*/
SELECT CustomerId, BillingAddressId
INTO #QpManualCustomerProjection
FROM qpacc.Customers;

SELECT t.
FROM #QpManualCustomerProjection AS t;

/* TEST 42
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

/* TEST 43
   Derived-table projection.
   Cursor after d.
*/
SELECT d.
FROM
(
    SELECT CustomerId AS Id, EmailAddress AS Contact
    FROM qpacc.Customers
) AS d;

/* TEST 44
   VALUES row source projection.
   Cursor after v.
*/
SELECT v.
FROM (VALUES (1, N'a')) AS v(ValueId, ValueName);

/* TEST 45
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

/* TEST 46
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

/* TEST 47
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

/* TEST 48
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

/* TEST 49
   ORDER BY projection alias.
   Cursor at end of fragment.
*/
SELECT c.EmailAddress AS Contact
FROM qpacc.Customers AS c
ORDER BY cont

/* TEST 50
   GROUP BY projection alias negative case.
   Cursor at end of fragment.
*/
SELECT c.EmailAddress AS Contact
FROM qpacc.Customers AS c
GROUP BY cont

/* TEST 51
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

/* TEST 52
   Set-operation branch isolation.
   Cursor after c. in the second branch.
*/
SELECT c.CustomerId
FROM qpacc.Customers AS c
UNION ALL
SELECT oh.OrderId
FROM qpacc.OrderHeaders AS oh
WHERE c.

/* TEST 53
   Wildcard expansion for one aliased source.
   Put the cursor after the star and press Tab.
*/
SELECT c.*
FROM qpacc.Customers AS c;

/* TEST 54
   Wildcard expansion for multiple sources.
   Put the cursor after the star and press Tab.
*/
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders AS oh ON oh.CustomerId = c.CustomerId;

/* TEST 55
   Built-in expression completion.
   Cursor at end of fragment.
*/
SELECT dat

/* TEST 56
   Built-in Signature Help.
   Cursor after opening parenthesis.
*/
SELECT DATEADD(

/* TEST 57
   Catalog scalar Signature Help.
   Cursor after opening parenthesis.
*/
SELECT qpacc.CalculateBillingTotal_Manual(

/* TEST 58
   Catalog TVF Signature Help.
   Cursor after opening parenthesis.
*/
SELECT *
FROM qpacc.GetCustomerAddresses_Manual(

/* TEST 59
   Same-server database discovery.
   Cursor at end of fragment.
*/
SELECT *
FROM Intelli

/* TEST 60
   Secondary database schema navigation.
   Cursor after the final dot.
*/
SELECT *
FROM IntelliSenseLabReporting.

/* TEST 61
   Secondary database strict schema completion.
   Cursor at end of fragment.
*/
SELECT *
FROM IntelliSenseLabReporting.qpacc.Customer

/* TEST 62
   Secondary database alias member completion.
   Cursor after r.
*/
SELECT r.
FROM IntelliSenseLabReporting.qpacc.Customers AS r;

/* TEST 63
   Cross-database aliases in one query.
   Cursor after r. and separately after c.
*/
SELECT c., r.
FROM IntelliSenseLab.qpacc.Customers AS c
JOIN IntelliSenseLabReporting.qpacc.Customers AS r
  ON r.ReportingCustomerId = c.CustomerId;

/* TEST 64
   Cross-database set branch identity.
   Cursor after r.
*/
SELECT c.CustomerId AS Id, c.EmailAddress AS Value
FROM IntelliSenseLab.qpacc.Customers AS c
UNION ALL
SELECT r.ReportingCustomerId AS IgnoredId, r.ReportingEmailAddress AS IgnoredValue
FROM IntelliSenseLabReporting.qpacc.Customers AS r
WHERE r.

/* TEST 65
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

/* TEST 66
   Four-part names are outside scope.
   Cursor after final dot.
*/
SELECT *
FROM SomeLinkedServer.IntelliSenseLab.qpacc.

/* TEST 67
   Persistent cache cold-load trigger.
   First run the clear-cache command for the active database, then use this cursor.
*/
SELECT c.
FROM qpacc.Customers AS c;

/* TEST 68
   Persistent cache warm-start trigger.
   Restart the editor/Extension Host, reconnect the same database, then use this cursor.
*/
SELECT oh.
FROM qpacc.OrderHeaders AS oh;

/* TEST 69
   Manual refresh trigger.
   Run the refresh command while keeping this completion point usable.
*/
SELECT ol.
FROM qpacc.OrderLines AS ol;

/* TEST 70
   Secondary database lazy cache trigger.
   Cursor after r.
*/
SELECT r.
FROM IntelliSenseLabReporting.qpacc.Customers AS r;
