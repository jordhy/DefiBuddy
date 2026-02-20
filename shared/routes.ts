import { z } from 'zod';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  crypto: {
    lookup: {
      method: 'POST' as const,
      path: '/api/crypto/lookup' as const,
      input: z.object({ personName: z.string() }),
      responses: {
        200: z.object({
          personName: z.string(),
          investments: z.array(z.object({ name: z.string(), percentage: z.number() })),
        }),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    history: {
      method: 'GET' as const,
      path: '/api/crypto/history' as const,
      responses: {
        200: z.array(z.object({
          id: z.number(),
          personName: z.string(),
          investments: z.array(z.object({ name: z.string(), percentage: z.number() })),
          createdAt: z.string(),
        })),
      },
    },
  },
  wallet: {
    lookup: {
      method: 'POST' as const,
      path: '/api/wallet/lookup' as const,
      input: z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address") }),
      responses: {
        200: z.object({
          address: z.string(),
          tokens: z.array(z.object({
            name: z.string(),
            symbol: z.string(),
            balance: z.string(),
            balanceUsd: z.number(),
            percentage: z.number(),
          })),
        }),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    history: {
      method: 'GET' as const,
      path: '/api/wallet/history' as const,
      responses: {
        200: z.array(z.object({
          id: z.number(),
          address: z.string(),
          tokens: z.array(z.object({
            name: z.string(),
            symbol: z.string(),
            balance: z.string(),
            balanceUsd: z.number(),
            percentage: z.number(),
          })),
          createdAt: z.string(),
        })),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
