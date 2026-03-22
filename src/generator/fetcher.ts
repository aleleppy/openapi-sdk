import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import type { OpenAPISpec, SchemaConfig } from '../types/openapi';

export class OpenAPIFetcher {
  readonly configs: SchemaConfig[];
  private readonly filePath: string;

  constructor(dir: string = process.cwd()) {
    this.filePath = path.join(dir, 'schema.json');
    this.configs  = this.readConfigs();
  }

  private readConfigs(): SchemaConfig[] {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(
        `schema.json not found. Run "openapi-sdk setup" first.`,
      );
    }

    const raw    = fs.readFileSync(this.filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    // support legacy single-object format
    const arr: SchemaConfig[] = Array.isArray(parsed) ? parsed : [parsed];

    for (const config of arr) {
      if (!config.docUrl) throw new Error('schema.json entry is missing the "docUrl" field.');
      if (!config.apiUrl) throw new Error('schema.json entry is missing the "apiUrl" field.');
      if (!config.output) config.output = 'src/sdk';
    }

    return arr;
  }

  saveConfigs(configs: SchemaConfig[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(configs, null, 2) + '\n', 'utf-8');
  }

  async fetch(config: SchemaConfig): Promise<OpenAPISpec> {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    try {
      const response = await axios.get<OpenAPISpec>(config.docUrl, { headers });
      const spec     = response.data;

      if (!spec.openapi || !spec.paths) {
        throw new Error('The response does not look like a valid OpenAPI 3.x spec.');
      }

      return spec;
    } catch (err: any) {
      if (err.response) {
        throw new Error(
          `Failed to fetch OpenAPI spec (${config.docUrl}): ${err.response.status} ${err.response.statusText}`,
        );
      }
      throw new Error(`Failed to fetch OpenAPI spec (${config.docUrl}): ${err.message}`);
    }
  }
}
