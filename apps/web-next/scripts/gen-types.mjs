import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import openapiTS, { astToString } from 'openapi-typescript';

const SCHEMA_FILE = process.env.OPENAPI_FILE || '../../docs/openapi.json';

async function main() {
  const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf-8'));
  const ast = await openapiTS(schema, {
    alphabetize: true,
    exportType: true,
    additionalProperties: false,
  });
  const content = astToString(ast);
  mkdirSync('./src/api', { recursive: true });
  writeFileSync('./src/api/schema.d.ts', content);
  console.log('Generated src/api/schema.d.ts from', SCHEMA_FILE);
}

main().catch((e) => { console.error(e); process.exit(1); });
