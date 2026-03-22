import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import type { OpenAPISpec, SchemaConfig } from '../types/openapi';

export class OpenAPIFetcher {
  readonly config: SchemaConfig;

  constructor(dir: string = process.cwd()) {
    this.config = this.readConfig(dir);
  }

  private readConfig(dir: string): SchemaConfig {
    const filePath = path.join(dir, 'schema.json');

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `schema.json not found in ${dir}. Run "openapi-sdk setup" first.`,
      );
    }

    const raw    = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(raw) as SchemaConfig;

    if (!config.url) throw new Error('schema.json is missing the "url" field.');
    if (!config.output) config.output = 'src/sdk';

    return config;
  }

  async fetch(): Promise<OpenAPISpec> {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    try {
      const response = await axios.get<OpenAPISpec>(this.config.url, { headers });
      const spec     = response.data;

      if (!spec.openapi || !spec.paths) {
        throw new Error('The response does not look like a valid OpenAPI 3.x spec.');
      }

      return spec;
    } catch (err: any) {
      if (err.response) {
        throw new Error(
          `Failed to fetch OpenAPI spec: ${err.response.status} ${err.response.statusText}`,
        );
      }
      throw new Error(`Failed to fetch OpenAPI spec: ${err.message}`);
    }
  }
}
