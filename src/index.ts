// openapi-sdk — TypeScript SDK generator from OpenAPI 3.x specs
// by Pináculo Digital 🦍

export { readSchemaConfig, fetchOpenAPISpec } from './generator/fetcher';
export { parseSpec } from './generator/parser';
export { generateTypes } from './generator/type-gen';
export { generateModule } from './generator/module-gen';
export { runSetup } from './cli/setup';
export { runGenerate } from './cli/generate';
export type * from './types/openapi';
