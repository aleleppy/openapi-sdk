import * as path from 'node:path';
import { Source } from '../../generator/source';

export class BaseServiceBuilder {
  async build(sdkRoot: string): Promise<void> {
    const content = `
    // AUTO GENERATED — DO NOT EDIT
    import axios, { AxiosError, AxiosRequestConfig } from 'axios';
    import {
      AppErrorServiceUnavailable,
      AppErrorCustom,
      AppErrorInternal,
    } from '@repo/_utils/errors/app-errors';

    type Headers = AxiosRequestConfig<unknown>['headers'];

    export function toQueryString<T extends object>(query: T): string {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          v.forEach((item) => params.append(k, String(item)));
        } else {
          params.set(k, String(v));
        }
      }
      const str = params.toString();
      return str ? \`?\${str}\` : '';
    }

    export abstract class ApiDefaultService {
      private readonly baseUrl: string;
      private readonly config: {
        headers: Headers;
      };

      constructor(params: { baseUrl: string; apiKey?: string }) {
        const { baseUrl, apiKey } = params;
        this.baseUrl = baseUrl;

        this.config = {
          headers: {
            ...(apiKey ? { 'api-key': apiKey } : {}),
          },
        };
      }

      private getUrl(url: string) {
        const buildedUrl = \`\${this.baseUrl}\${url}\`;

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

      protected async put<T>(params: { body?: unknown; headers?: Headers; url: string }): Promise<T> {
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

      protected async post<T>(params: { url: string; body?: unknown; headers?: Headers }): Promise<T> {
        const { url, body, headers } = params;

        const config = this.getConfig(headers);
        const finalUrl = this.getUrl(url);

        return this.tryAndCatch<T>(axios.post(finalUrl, body, config));
      }

      protected async patch<T>(params: { url: string; body?: unknown; headers?: Headers }): Promise<T> {
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

    const file = new Source({
      path: path.join(sdkRoot, 'api-default-service.ts'),
    });
    file.changeData(content);

    await file.save();
    console.log(`  📝 ${path.relative(process.cwd(), file.path)}`);
  }
}
