import { pgTable, text, serial, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const searches = pgTable("searches", {
  id: serial("id").primaryKey(),
  personName: text("person_name").notNull(),
  investments: jsonb("investments").$type<CryptoInvestment[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const walletSearches = pgTable("wallet_searches", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  tokens: jsonb("tokens").$type<WalletToken[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const buddies = pgTable("buddies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contribution: numeric("contribution", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const nftMetadata = pgTable("nft_metadata", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  metadata: jsonb("metadata").$type<NftReportMetadata>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === BASE SCHEMAS ===
export const insertSearchSchema = createInsertSchema(searches).omit({ id: true, createdAt: true });
export const insertWalletSearchSchema = createInsertSchema(walletSearches).omit({ id: true, createdAt: true });
export const insertBuddySchema = createInsertSchema(buddies).omit({ id: true, createdAt: true });
export const insertNftMetadataSchema = createInsertSchema(nftMetadata).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===
export type Search = typeof searches.$inferSelect;
export type InsertSearch = z.infer<typeof insertSearchSchema>;

export type WalletSearch = typeof walletSearches.$inferSelect;
export type InsertWalletSearch = z.infer<typeof insertWalletSearchSchema>;

export type Buddy = typeof buddies.$inferSelect;
export type InsertBuddy = z.infer<typeof insertBuddySchema>;

export type NftMetadata = typeof nftMetadata.$inferSelect;
export type InsertNftMetadata = z.infer<typeof insertNftMetadataSchema>;

export type NftReportMetadata = {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  holdings: Array<{ name: string; symbol: string; balanceUsd: number; percentage: number }>;
  buddies: Array<{ name: string; contribution: number; percentage: number }>;
  totalValue: number;
  totalFund: number;
  reportDate: string;
};

export type CryptoInvestment = {
  name: string;
  percentage: number;
};

export type WalletToken = {
  name: string;
  symbol: string;
  balance: string;
  balanceUsd: number;
  percentage: number;
};

export type CryptoLookupRequest = { personName: string };
export type CryptoLookupResponse = {
  personName: string;
  investments: CryptoInvestment[];
};

export type WalletLookupRequest = { address: string };
export type WalletLookupResponse = {
  address: string;
  tokens: WalletToken[];
};

export * from "./models/chat";
