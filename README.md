# @pinaculo/openapi-sdk 🦍

> Generate typed TypeScript SDK modules from any OpenAPI 3.x spec — powered by axios.

## What it does

1. Reads a `schema.json` config from your project root
2. Fetches the OpenAPI spec from the configured URL
3. Generates TypeScript files organized by **tag** (one folder per tag):
   - `*.types.ts` — Input, Params, and Response interfaces
   - `*.module.ts` — Axios-based functions for each endpoint

## Quick Start

```bash
# Install
npm install @pinaculo/openapi-sdk

# Create config
npx openapi-sdk setup --url https://api.example.com/openapi.json

# Edit schema.json with your actual API URL, then:
npx openapi-sdk generate
```

## schema.json

```json
{
  "url": "https://api.example.com/openapi.json",
  "apiKey": "",
  "output": "src/sdk"
}
```

| Field    | Description                          | Required |
|----------|--------------------------------------|----------|
| `url`    | URL to fetch the OpenAPI 3.x spec   | ✅       |
| `apiKey` | Bearer token for authentication      | ❌       |
| `output` | Output directory (default: `src/sdk`)| ❌       |

## Generated Output Example

For an API with a `users` tag:

```
src/sdk/
├── users/
│   ├── users.types.ts    # CreateUserInput, UserResponse, ListUsersParams...
│   └── users.module.ts   # UsersModule.create(), .list(), .getById()...
├── orders/
│   ├── orders.types.ts
│   └── orders.module.ts
└── index.ts              # Barrel export
```

### users.types.ts
```typescript
export interface CreateUserInput {
  name: string;
  email: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
}
```

### users.module.ts
```typescript
import axios from 'axios';
import type { CreateUserInput, UserResponse } from './users.types';

const BASE_URL = process.env.API_URL || '';

export const UsersModule = {
  create: (body: CreateUserInput): Promise<UserResponse> =>
    instance.post(`${BASE_URL}/users`, body).then(r => r.data),
  // ...
};
```

## Usage in your code

```typescript
import { UsersModule } from './sdk';

const user = await UsersModule.create({ name: 'Mangu', email: 'mangu@pinaculo.com' });
const users = await UsersModule.list({ page: 1, limit: 10 });
```

## Environment Variables

- `API_URL` — Base URL for API requests (used at runtime by generated modules)

## Development

```bash
npm install
npm run build
```

## License

MIT — Pináculo Digital 🦍🍌
