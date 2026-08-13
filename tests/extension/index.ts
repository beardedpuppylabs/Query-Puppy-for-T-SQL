import assert from "node:assert/strict";
import * as vscode from "vscode";
import { DatabaseIndex } from "../../src/metadata/DatabaseIndex.js";

const database = "IntelliSenseLab";
const index = new DatabaseIndex({
  database,
  schemas: ["billing", "reporting"],
  loadedAt: 0,
  objects: [
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
    "improvedSqlIntellisense.test.setSignatureScope",
    {
      activeDatabase: database,
      indexes: new Map([[database.toLowerCase(), index]]),
    },
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
