/*
  Query Puppy for T-SQL 0.12.0 focused language-intelligence acceptance

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

/* TEST 01: function Contains
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor at the end of ens, then press Ctrl+Space. */
SELECT ens

/* TEST 02: native Signature Help
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after ISNULL and TYPE the opening ( yourself.
   Then use Ctrl+Shift+Space for manual Signature Help and Ctrl+Space for ordinary
   completion. */
SELECT ISNULL

/* TEST 03: conditional argument ranking
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after the final c., then press Ctrl+Space. */
SELECT *
FROM qpacc.Customers AS c
WHERE c.DisplayName = COALESCE(c.

/* TEST 04: conditional return inference
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after c. in ISNULL argument 2, then press Ctrl+Space. */
SELECT ISNULL(
    CASE WHEN c.CustomerId > 0 THEN c.DisplayName ELSE c.EmailAddress END,
    c.
)
FROM qpacc.Customers AS c;

/* TEST 05: aggregate argument ranking
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after c. in SUM, then press Ctrl+Space. */
SELECT SUM(c.
FROM qpacc.Customers AS c;

/* TEST 06: aggregate return presentation
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor at the end of count, then press Ctrl+Space. */
SELECT count

/* TEST 07: window grammar
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after OVER (, then press Ctrl+Space. */
SELECT ROW_NUMBER() OVER (
FROM qpacc.Customers AS c;

/* TEST 08: window partition members
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after c. in PARTITION BY, then press Ctrl+Space. */
SELECT ROW_NUMBER() OVER (PARTITION BY c.
FROM qpacc.Customers AS c;

/* TEST 09: window ordering members
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after c. in window ORDER BY, then press Ctrl+Space. */
SELECT ROW_NUMBER() OVER (ORDER BY c.
FROM qpacc.Customers AS c;

/* TEST 10: window value argument
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after c. in LAG argument 1, then press Ctrl+Space. */
SELECT LAG(c.
FROM qpacc.Customers AS c;

/* TEST 11: datepart grammar values
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after DATEPART(, then press Ctrl+Space. */
SELECT DATEPART(

/* TEST 12: fixed return inference
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after c. in ISNULL argument 2, then press Ctrl+Space. */
SELECT ISNULL(EOMONTH(c.CreatedAt), c.
FROM qpacc.Customers AS c;

/* TEST 13: existing built-in regression
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after c. in DATEADD argument 3, then press Ctrl+Space. */
SELECT DATEADD(day, 1, c.
FROM qpacc.Customers AS c;

/* TEST 14: catalog callable regression
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after ol. in argument 1, then press Ctrl+Space. */
SELECT qpacc.CalculateBillingTotal_Manual(ol., 0.19)
FROM qpacc.OrderLines AS ol;

/* TEST 15: ordinary member baseline
   RUN ALONE IN A FRESH SQL EDITOR
   Place the cursor immediately after c., then press Ctrl+Space. */
SELECT c.
FROM qpacc.Customers AS c;
