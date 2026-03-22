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
      if (!config.name)   throw new Error('schema.json entry is missing the "name" field.');
    }

    for (const config of arr) {
      const envKey = config.name.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase() + '_KEY';
      if (!config.apiKey) {
        config.apiKey = process.env[envKey];
      }
    }

    return arr;
  }

  saveConfigs(configs: SchemaConfig[]): void {
    const toSave = configs.map(({ apiKey, ...rest }) => rest);
    fs.writeFileSync(this.filePath, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
  }

  private validateSpec(spec: unknown, url: string): asserts spec is OpenAPISpec {
    if (!spec || typeof spec !== 'object') {
      throw new Error(`Invalid spec from ${url}: expected an object`);
    }
    const s = spec as any;
    if (!s.openapi) {
      if (s.swagger) {
        throw new Error(
          `Swagger 2.x is not supported (received swagger: '${s.swagger}'). Only OpenAPI 3.x is supported.`,
        );
      }
      throw new Error(`Invalid spec from ${url}: missing 'openapi' field`);
    }
    if (!s.openapi.startsWith('3.')) {
      throw new Error(
        `Only OpenAPI 3.x is supported. Received: openapi '${s.openapi}' from ${url}`,
      );
    }
    if (!s.paths || typeof s.paths !== 'object') {
      throw new Error(`Invalid spec from ${url}: missing or invalid 'paths' field`);
    }
    if (!s.info) {
      throw new Error(`Invalid spec from ${url}: missing 'info' field`);
    }
  }

  async fetch(config: SchemaConfig): Promise<OpenAPISpec> {
    if (config.apiKey && !config.docUrl.startsWith('https://')) {
      throw new Error(
        `docUrl must use HTTPS when apiKey is configured. Received: ${config.docUrl}`,
      );
    }

    const headers: Record<string, string> = { Accept: 'application/json' };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    try {
      const response = await axios.get<OpenAPISpec>(config.docUrl, { headers });
      const spec     = response.data;

      this.validateSpec(spec, config.docUrl);

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
