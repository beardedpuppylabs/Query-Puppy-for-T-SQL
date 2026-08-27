/*
  Query Puppy for T-SQL 0.12.2 trigger and DML stabilization acceptance

  REQUIRED ACTIVE MSSQL DATABASE: IntelliSenseLab

  The mssql connection for each fresh SQL editor must actively use IntelliSenseLab.
  The fixture script manual-acceptance/extend-intellisenselab-0.11.0-fixtures.sql
  ends in IntelliSenseLabReporting, so explicitly switch the editor connection back
  to IntelliSenseLab after provisioning. A USE statement inside these incomplete
  snippets is not a substitute for the active mssql editor database.

  After provisioning or changing databases, run:
  Query Puppy for T-SQL: Refresh Schema Metadata

  Copy exactly ONE test into a fresh SQL editor at a time. Do not execute these
  intentionally incomplete snippets together.
*/

/* TEST 01: FROM Smart Alias first-space domain
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor at the end of the object name and TYPE one space. */
SELECT *
FROM qpacc.Customers

/* TEST 02: FROM AS Smart Alias first-space domain
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after AS and TYPE one space. */
SELECT *
FROM qpacc.Customers AS

/* TEST 03: JOIN Smart Alias first-space domain
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor at the end of the right object name and TYPE one space. */
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders

/* TEST 04: JOIN AS Smart Alias first-space domain
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after AS and TYPE one space. */
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders AS

/* TEST 05: JOIN continuation keyword
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor at the end of the alias and TYPE one space. */
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders oh

/* TEST 06: JOIN ON first-space domain with a relationship
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after ON and TYPE one space. */
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders AS oh ON

/* TEST 07: JOIN ON first-space domain without a relationship
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after ON and TYPE one space. */
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.Products AS p ON

/* TEST 08: UPDATE blank target domain
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after UPDATE, TYPE one space, then press Ctrl+Space. */
UPDATE

/* TEST 09: INSERT INTO blank target domain
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after INTO, TYPE one space, then press Ctrl+Space. */
INSERT INTO

/* TEST 10: DELETE FROM blank target domain
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after FROM, TYPE one space, then press Ctrl+Space. */
DELETE FROM

/* TEST 11: UPDATE target Contains
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor at the end of the fragment, then press Ctrl+Space. */
UPDATE qpacc.Order

/* TEST 12: INSERT INTO target Contains
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor at the end of the fragment, then press Ctrl+Space. */
INSERT INTO qpacc.Order

/* TEST 13: DELETE FROM target Contains
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor at the end of the fragment, then press Ctrl+Space. */
DELETE FROM qpacc.Order

/* TEST 14: UPDATE RHS stays expression completion
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor at the end of the fragment, then press Ctrl+Space. */
UPDATE qpacc.OrderHeaders
SET CustomerId = Order

/* TEST 15: unaliased JOIN predicate domain
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after ON and TYPE one space. */
SELECT *
FROM qpacc.Customers AS c
JOIN qpacc.OrderHeaders ON
