import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import type { OpenAPISpec, SchemaConfig } from '../types/openapi';

/**
 * Reads schema.json from the given directory (defaults to cwd).
 */
export function readSchemaConfig(dir: string = process.cwd()): SchemaConfig {
  const filePath = path.join(dir, 'schema.json');

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `schema.json not found in ${dir}. Run "openapi-sdk setup" first.`
    );
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const config: SchemaConfig = JSON.parse(raw);

  if (!config.url) {
    throw new Error('schema.json is missing the "url" field.');
  }

  if (!config.output) {
    config.output = 'src/sdk';
  }

  return config;
}

/**
 * Fetches the OpenAPI spec from the configured URL.
 */
export async function fetchOpenAPISpec(config: SchemaConfig): Promise<OpenAPISpec> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  try {
    const response = await axios.get<OpenAPISpec>(config.url, { headers });
    const spec = response.data;

    if (!spec.openapi || !spec.paths) {
      throw new Error('The response does not look like a valid OpenAPI 3.x spec.');
    }

    return spec;
  } catch (err: any) {
    if (err.response) {
      throw new Error(
        `Failed to fetch OpenAPI spec: ${err.response.status} ${err.response.statusText}`
      );
    }
    throw new Error(`Failed to fetch OpenAPI spec: ${err.message}`);
  }
}
