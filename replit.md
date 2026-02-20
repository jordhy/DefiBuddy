# Crypto Tracker

## Overview

Crypto Tracker is a full-stack web application with two main features:
1. **Personality Lookup**: Look up the top 5 crypto assets that a given Twitter/X personality is invested in or has publicly supported, using OpenAI (via Replit AI Integrations).
2. **Wallet Lookup**: Enter an Ethereum address to see the top crypto tokens held in that wallet with real-time balances and USD values, using the Ethplorer API.

Both features store search history in a PostgreSQL database and display results in a tabbed single-page interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State Management / Data Fetching**: TanStack React Query for server state, with a custom `apiRequest` helper for mutations
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives, styled with Tailwind CSS and class-variance-authority
- **Build Tool**: Vite with HMR support, using `@vitejs/plugin-react`
- **Entry Point**: `client/src/main.tsx` → `App.tsx` → pages in `client/src/pages/`
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend
- **Framework**: Express 5 running on Node.js with TypeScript (via tsx)
- **HTTP Server**: Node `http.createServer` wrapping Express
- **API Pattern**: REST endpoints defined in `server/routes.ts`, with route contracts defined in `shared/routes.ts` using Zod schemas
- **AI Integration**: OpenAI SDK configured with Replit AI Integrations environment variables (`AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`). Uses `gpt-5.2` model with JSON response format for crypto research lookups.
- **Dev Mode**: Vite dev server served as Express middleware (in `server/vite.ts`)
- **Production**: Client built to `dist/public`, server bundled to `dist/index.cjs` via esbuild

### Database
- **Database**: PostgreSQL (required, connection via `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `drizzle-zod` for schema-to-Zod validation
- **Schema Location**: `shared/schema.ts` (main tables) and `shared/models/chat.ts` (chat/conversation tables)
- **Tables**:
  - `searches` — stores crypto lookup results (id, personName, investments as JSONB array, createdAt)
  - `wallet_searches` — stores wallet lookup results (id, address, tokens as JSONB array of {name, symbol, balance, balanceUsd}, createdAt)
  - `conversations` — chat conversations (id, title, createdAt)
  - `messages` — chat messages (id, conversationId, role, content, createdAt)
- **Migrations**: Managed via `drizzle-kit push` (schema push approach, not migration files)
- **Storage Layer**: `server/storage.ts` provides a `DatabaseStorage` class implementing `IStorage` interface

### Shared Code
- `shared/schema.ts` — Database table definitions and TypeScript types
- `shared/routes.ts` — API route contracts with Zod input/output schemas, used by both client and server
- `shared/models/chat.ts` — Chat-related table definitions

### Replit Integrations
The `server/replit_integrations/` and `client/replit_integrations/` directories contain pre-built modules for:
- **Chat**: Conversation CRUD and OpenAI-powered chat with streaming (SSE)
- **Audio**: Voice recording, speech-to-text, text-to-speech, and audio streaming via WebSocket/SSE
- **Image**: Image generation using `gpt-image-1` model
- **Batch**: Batch processing utilities with rate limiting and retries (using p-limit and p-retry)

These are scaffolded integration modules that can be registered in routes as needed.

### Build Process
- `npm run dev` — Starts dev server with Vite HMR
- `npm run build` — Builds client with Vite, bundles server with esbuild into `dist/`
- `npm run start` — Runs production build from `dist/index.cjs`
- `npm run db:push` — Pushes schema changes to database

## External Dependencies

### Required Services
- **PostgreSQL Database** — Required. Connection string via `DATABASE_URL` environment variable. Used with `connect-pg-simple` for session storage and Drizzle ORM for data access.
- **OpenAI API (via Replit AI Integrations)** — Required for crypto lookup functionality. Configured via:
  - `AI_INTEGRATIONS_OPENAI_API_KEY`
  - `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Key NPM Packages
- **Server**: express v5, drizzle-orm, drizzle-zod, pg, openai, zod, nanoid
- **Client**: react, react-dom, wouter, @tanstack/react-query, tailwindcss, shadcn/ui components (Radix UI), lucide-react, recharts
- **Build**: vite, esbuild, tsx, typescript, drizzle-kit