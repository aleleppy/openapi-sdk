import * as fs from 'fs';
import * as path from 'path';
import type { SchemaConfig } from '../types/openapi';

export class SDKSetup {
  private readonly config:   SchemaConfig;
  private readonly filePath: string;

  constructor(options: { url?: string; apiKey?: string; output?: string } = {}) {
    this.filePath = path.join(process.cwd(), 'schema.json');
    this.config   = {
      url:    options.url    || 'https://api.example.com/openapi.json',
      apiKey: options.apiKey || '',
      output: options.output || 'src/sdk',
    };
  }

  run(): void {
    if (fs.existsSync(this.filePath)) {
      console.log('⚠️  schema.json already exists. Overwriting...');
    }

    fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2) + '\n', 'utf-8');

    console.log('✅ schema.json created successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Edit schema.json with your API URL');
    console.log('  2. Run "openapi-sdk generate" to generate the SDK');
  }
}
