// Local development only: the sandbox is not a production participant.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = __dirname;
const tools = path.resolve(root, '../tools');
const bundledDpm = path.join(tools, 'dpm', process.platform === 'win32' ? 'dpm.exe' : 'dpm');
const dpm = process.env.DPM_BIN || (fs.existsSync(bundledDpm) ? bundledDpm : 'dpm');
const env = { ...process.env };
const javaRoot = path.join(tools, 'java');
const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
if (!env.JAVA_HOME && fs.existsSync(javaRoot)) {
  const installed = fs.readdirSync(javaRoot).filter(name => fs.existsSync(path.join(javaRoot, name, 'bin', javaName))).sort();
  if (installed.length) env.JAVA_HOME = path.join(javaRoot, installed[installed.length - 1]);
}
if (env.JAVA_HOME) {
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${env[pathKey] || ''}`;
}
function run(args) {
  const result = spawnSync(dpm, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`DPM failed (${result.status ?? result.signal})`);
}
const dar = 'test/.daml/dist/canton-test-0.0.1.dar';
const action = process.argv[2];
try {
  if (action === 'build') run(['build', '--all']);
  else if (action === 'sandbox') {
    run(['sandbox', '--dar', 'main/.daml/dist/canton-main-0.0.1.dar', '--ledger-api-port', '6865', '--json-api-port', '7575', '--canton-port-file', 'sandbox-ports.json']);
  } else if (action === 'test' || action === 'test-ledger') {
    run(['build', '--all']);
    const file = action === 'test' ? 'ide-test-results.json' : 'ledger-test-results.json';
    // Remove prior evidence so a failed invocation cannot be mistaken for a new pass.
    fs.rmSync(path.join(root, file), { force: true });
    const input = path.join(root, 'test-run-id.json');
    fs.writeFileSync(input, JSON.stringify(require('node:crypto').randomUUID()));
    const names = process.argv[3] ? [`Test:${process.argv[3]}`] : ['Test:setup', 'Test:permissions', 'Test:cancelTransfer'];
    const results = {};
    for (const name of names) {
      if (!['Test:setup', 'Test:permissions', 'Test:cancelTransfer'].includes(name)) throw new Error('Unknown test');
      const output = path.join(root, `${name.split(':')[1]}-result.json`);
      fs.rmSync(output, { force: true });
      run(['script', '--dar', dar, '--script-name', name, '--input-file', input, '--output-file', output, ...(action === 'test' ? ['--ide-ledger'] : ['--ledger-host', 'localhost', '--ledger-port', '6865', '--upload-dar', 'yes'])]);
      results[name] = { result: JSON.parse(fs.readFileSync(output, 'utf8')) };
    }
    fs.writeFileSync(path.join(root, file), JSON.stringify(results, null, 2));
    for (const name of names) {
      if (!results[name] || !Object.hasOwn(results[name], 'result') || results[name].error) throw new Error(`Missing or failed result: ${name}`);
    }
    console.log(`${names.length} scripts passed on ${action === 'test' ? 'simulated ledger' : 'local Canton ledger'}. Evidence: ${file}`);
  } else throw new Error('Usage: node canton/run.cjs build|sandbox|test|test-ledger');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
