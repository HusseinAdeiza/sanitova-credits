// Regression tests for the Daml contract lifecycle: UpdateStatus and transfer
// proposal/accept/cancel semantics enforced on-ledger (run via canton/run.cjs).
// This Node file only checks the test file and Daml sources stay in sync; the
// authoritative execution is Daml Script through `node canton/run.cjs test-ledger`.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const mainDaml = fs.readFileSync(path.join(repoRoot, 'canton', 'main', 'daml', 'Main.daml'), 'utf8');
const testDaml = fs.readFileSync(path.join(repoRoot, 'canton', 'test', 'daml', 'Test.daml'), 'utf8');
const resultsPath = path.join(repoRoot, 'canton', 'ledger-test-results.json');

test('choices enforce inspector-only status changes on-ledger', () => {
  assert.match(mainDaml, /choice UpdateStatus[\s\S]*?controller inspector/);
  assert.match(mainDaml, /assertMsg "Status must change"/);
});

test('transfer requires issuer proposal and recipient acceptance on-ledger', () => {
  assert.match(mainDaml, /choice ProposeTransfer[\s\S]*?controller issuer/);
  assert.match(mainDaml, /choice AcceptTransfer\s*: ([\w\s]+)\n\s*controller recipient/);
  assert.match(mainDaml, /assertMsg "Recipient must differ from current holder"/);
  assert.match(mainDaml, /choice CancelTransfer\s*: [\w\s]+\n\s*controller asset\.issuer/);
});

test('regression scripts exist and cover permissions and cancellation', () => {
  assert.match(testDaml, /permissions : Text -> Script \(\)/);
  assert.match(testDaml, /submitMustFail regulator do\s*\n\s*exerciseCmd cid UpdateStatus/);
  assert.match(testDaml, /submitMustFail recipient do\s*\n\s*exerciseCmd proposal AcceptTransfer/);
  assert.match(testDaml, /hidden <- queryContractId outsider cid/);
  assert.match(testDaml, /assert \(hidden == None\)/);
});

test('saved ledger summary contains expected results (not a fresh execution)', () => {
  assert.ok(fs.existsSync(resultsPath), 'ledger-test-results.json exists; run `node canton/run.cjs test-ledger` first');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  for (const script of ['Test:setup', 'Test:permissions', 'Test:cancelTransfer']) {
    assert.ok(Object.hasOwn(results[script] || {}, 'result'), `${script} must have a passing result`);
    assert.ok(!results[script].error, `${script} must not carry an error`);
  }
});
