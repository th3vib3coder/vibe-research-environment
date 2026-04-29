import { appendFile } from 'node:fs/promises';

let stdin = '';
process.stdin.setEncoding('utf8');

for await (const chunk of process.stdin) {
  stdin += chunk;
}

const payload = JSON.parse(stdin || '{}');
const capturePath = process.env.VRE_GOVERNANCE_CAPTURE_PATH;
if (capturePath) {
  await appendFile(capturePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

process.stdout.write(JSON.stringify({
  ok: true,
  eventId: 'GOV-STUB-001',
  code: 'OK'
}));
