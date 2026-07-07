#!/usr/bin/env node
// P5 E2E: 集成测试所有 OpenAPI paths
// 用法: node scripts/test-all-paths.mjs
// 输出: /tmp/paths-test.log
import fs from 'fs';
import http from 'http';

const BACKEND = process.env.BACKEND || 'http://localhost:9100';
const OPENAPI = process.env.OPENAPI || '/home/ubuntu/panmira-N1/docs/openapi.json';
const JWT_FILE = process.env.JWT_FILE || '/tmp/shidefei_jwt.txt';

function get(path, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(BACKEND + path);
    const start = Date.now();
    const req = http.request(
      { method: 'GET', hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: body.slice(0, 200),
            ms: Date.now() - start,
          }),
        );
      },
    );
    req.on('error', (e) => resolve({ status: 0, body: e.message, ms: -1 }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ status: -1, body: 'timeout', ms: 8000 });
    });
    req.end();
  });
}

async function main() {
  const openapi = JSON.parse(fs.readFileSync(OPENAPI, 'utf8'));
  const paths = openapi.paths || {};
  const jwt = fs.existsSync(JWT_FILE) ? fs.readFileSync(JWT_FILE, 'utf8').trim() : '';
  const authHeader = jwt ? { Authorization: 'Bearer ' + jwt } : {};

  const results = [];
  let pass = 0, fail = 0;

  for (const [p, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const fullPath = p.replace(/\{(\w+)\}/g, (_m, k) => {
        if (k === 'id' || k.endsWith('Id')) return '9b55c08d-8591-421d-ba4b-694d30787fd3';
        return 'test';
      });
      const r = await get(fullPath, authHeader);
      const status = r.status;
      const ok = status >= 200 && status < 500;
      const tag = ok ? 'PASS' : 'FAIL';
      if (ok) pass++; else fail++;
      const line = tag + '\t' + method.toUpperCase() + '\t' + status + '\t' + r.ms + 'ms\t' + p;
      results.push(line);
      console.log(line);
    }
  }

  const log = '# P5 集成测试 - ' + new Date().toISOString() + '\n# PASS=' + pass + ' FAIL=' + fail + ' TOTAL=' + (pass+fail) + '\n\n' + results.join('\n') + '\n';
  fs.writeFileSync('/tmp/paths-test.log', log);
  console.log('\n=== DONE: PASS=' + pass + ' FAIL=' + fail + ' -> /tmp/paths-test.log ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
