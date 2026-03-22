import * as fs from 'fs';
import * as path from 'path';
import type { SchemaConfig } from '../types/openapi';

export class SDKSetup {
  private readonly config:   SchemaConfig;
  private readonly filePath: string;

  constructor(options: { docUrl?: string; apiUrl?: string; apiKey?: string; name?: string } = {}) {
    this.filePath = path.join(process.cwd(), 'schema.json');
    this.config   = {
      $schema: './node_modules/@pinaculodigital/openapi-sdk/schemas/config.schema.json',
      docUrl:  options.docUrl || 'https://api.example.com/openapi.json',
      apiUrl:  options.apiUrl || 'https://api.example.com',
      apiKey:  options.apiKey || '',
      name:    options.name  || 'my-api',
    } as any;
  }

  run(): void {
    if (fs.existsSync(this.filePath)) {
      console.log('⚠️  schema.json already exists. Overwriting...');
    }

    const { apiKey, ...configWithoutApiKey } = this.config as any;
    const envKey = (this.config.name || 'my-api').replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase() + '_KEY';

    fs.writeFileSync(this.filePath, JSON.stringify([configWithoutApiKey], null, 2) + '\n', 'utf-8');

    console.log('✅ schema.json created successfully!');
    console.log('');
    console.log('ℹ️  API key: set env var ' + envKey + ' (do not add to schema.json)');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Edit schema.json with your API URL');
    console.log('  2. Run "openapi-sdk generate" to generate the SDK');
  }
}
