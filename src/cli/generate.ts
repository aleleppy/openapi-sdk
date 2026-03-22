import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIFetcher } from '../generator/fetcher';
import { OpenAPIParser } from '../generator/parser';
import { TypeGenerator } from '../generator/type-gen';
import { ModuleGenerator } from '../generator/module-gen';
import type { OpenAPISpec, SchemaConfig, ParsedTag } from '../types/openapi';

export class SDKGenerator {
  readonly config:    SchemaConfig;
  readonly spec:      OpenAPISpec;
  readonly tags:      ParsedTag[];
  readonly outputDir: string;

  private constructor(config: SchemaConfig, spec: OpenAPISpec) {
    this.config    = config;
    this.spec      = spec;
    this.tags      = new OpenAPIParser(spec).tags;
    this.outputDir = path.resolve(process.cwd(), config.output);
  }

  static async create(dir?: string): Promise<SDKGenerator> {
    const fetcher = new OpenAPIFetcher(dir);
    const spec    = await fetcher.fetch();
    return new SDKGenerator(fetcher.config, spec);
  }

  // ─── public API ──────────────────────────────────────────────────────────────

  build(): void {
    console.log("🦍 openapi-sdk generate — let's go!");
    console.log('');
    console.log(`📡 Spec: ${this.config.url}`);
    console.log(`✅ Loaded: ${this.spec.info.title} v${this.spec.info.version}`);
    console.log(`📦 Found ${this.tags.length} tag(s)`);
    this.tags.forEach((t) => console.log(`   · "${t.name}" → ${t.slug}/`));
    console.log('');

    fs.mkdirSync(this.outputDir, { recursive: true });
    this.buildBaseService();

    for (const tag of this.tags) {
      this.buildTag(tag);
    }

    this.buildBarrelIndex();

    console.log('');
    console.log('🎉 SDK generated successfully!');
  }

  // ─── private builders ────────────────────────────────────────────────────────

  private buildTag(tag: ParsedTag): void {
    const tagDir = path.join(this.outputDir, tag.slug);
    fs.mkdirSync(tagDir, { recursive: true });

    const typesContent = new TypeGenerator(tag, this.spec).build();
    const typesFile    = path.join(tagDir, `${tag.slug}.types.ts`);
    fs.writeFileSync(typesFile, typesContent, 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), typesFile)}`);

    const moduleContent = new ModuleGenerator(tag, this.spec).build();
    const moduleFile    = path.join(tagDir, `${tag.slug}.module.ts`);
    fs.writeFileSync(moduleFile, moduleContent, 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), moduleFile)}`);
  }

  private buildBaseService(): void {
    const content = `// AUTO GENERATED — DO NOT EDIT
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import {
  AppErrorServiceUnavailable,
  AppErrorCustom,
  AppErrorInternal,
} from '@repo/_utils/errors/app-errors';

type Headers = AxiosRequestConfig<unknown>['headers'];

export abstract class ApiDefaultService {
  protected readonly baseUrl: string;
  protected readonly config: {
    headers: Headers;
  };

  private getUrl(url: string) {
    const buildedUrl = \`\${this.baseUrl}/\${url}\`;

    return buildedUrl;
  }

  private throwError(error: unknown): never {
    if (error instanceof AxiosError) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new AppErrorServiceUnavailable(
          'Serviço temporariamente indisponível. Tente novamente em alguns instantes.',
        );
      }

      if (error.response) {
        throw new AppErrorCustom({
          message: error.response.data?.message || error.response.data?.error,
          code: error.response.status,
        });
      }
    }

    throw new AppErrorInternal(JSON.stringify(error));
  }

  private getConfig(headers?: Headers) {
    return headers ? { headers: headers } : this.config;
  }

  private responseParser<T>(data: unknown): T | undefined {
    if (data && typeof data === 'object' && 'data' in data) {
      return this.responseParser(data.data);
    }
    return data as T;
  }

  private async tryAndCatch<T>(promise: Promise<unknown>): Promise<T> {
    try {
      const res = await promise;
      return this.responseParser(res);
    } catch (error) {
      this.throwError(error);
    }
  }

  protected async put<T>(params: { body: unknown; headers?: Headers; url: string }): Promise<T> {
    const { body, url, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    return this.tryAndCatch<T>(axios.put(finalUrl, body, config));
  }

  protected async get<T>(params: { url: string; headers?: Headers }): Promise<T> {
    const { url, headers } = params;

    const config = this.getConfig(headers);

    return this.tryAndCatch<T>(axios.get(this.getUrl(url), config));
  }

  protected async post<T>(params: { url: string; body: unknown; headers?: Headers }): Promise<T> {
    const { url, body, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    return this.tryAndCatch<T>(axios.post(finalUrl, body, config));
  }

  protected async patch<T>(params: { url: string; body: unknown; headers?: Headers }): Promise<T> {
    const { url, body, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    return this.tryAndCatch<T>(axios.patch(finalUrl, body, config));
  }

  protected async delete<T>(params: { url: string; body?: unknown; headers?: Headers }): Promise<T> {
    const { url, body, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    return this.tryAndCatch<T>(axios.delete(finalUrl, { ...config, data: body }));
  }

  protected fireAndForget(params: {
    method: 'post' | 'put';
    url: string;
    body: unknown;
    headers?: Headers;
  }): void {
    const { method, url, body, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    axios[method](finalUrl, body, config).catch(() => {});
  }
}
`;

    const filePath = path.join(this.outputDir, 'api-default-service.ts');
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), filePath)}`);
  }

  private buildBarrelIndex(): void {
    const lines = ['// AUTO GENERATED — DO NOT EDIT', ''];

    for (const tag of this.tags) {
      lines.push(`export * from './${tag.slug}/${tag.slug}.types';`);
      lines.push(`export * from './${tag.slug}/${tag.slug}.module';`);
    }

    lines.push('');

    const indexFile = path.join(this.outputDir, 'index.ts');
    fs.writeFileSync(indexFile, lines.join('\n'), 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), indexFile)}`);
  }
}
