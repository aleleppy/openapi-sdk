import * as fs from 'fs';
import * as path from 'path';
import type { SchemaConfig } from '../types/openapi';

/**
 * Creates a schema.json file in the current directory with default values.
 */
export function runSetup(options: {
  url?: string;
  apiKey?: string;
  output?: string;
}): void {
  const cwd = process.cwd();
  const filePath = path.join(cwd, 'schema.json');

  if (fs.existsSync(filePath)) {
    console.log('⚠️  schema.json already exists. Overwriting...');
  }

  const config: SchemaConfig = {
    url: options.url || 'https://api.example.com/openapi.json',
    apiKey: options.apiKey || '',
    output: options.output || 'src/sdk',
  };

  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  console.log('✅ schema.json created successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Edit schema.json with your API URL');
  console.log('  2. Run "openapi-sdk generate" to generate the SDK');
}
