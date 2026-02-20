import { db } from "./db";
import { searches, walletSearches, type InsertSearch, type Search, type InsertWalletSearch, type WalletSearch } from "@shared/schema";
import { desc } from "drizzle-orm";

export interface IStorage {
  createSearch(search: InsertSearch): Promise<Search>;
  getRecentSearches(): Promise<Search[]>;
  createWalletSearch(search: InsertWalletSearch): Promise<WalletSearch>;
  getRecentWalletSearches(): Promise<WalletSearch[]>;
}

export class DatabaseStorage implements IStorage {
  async createSearch(search: InsertSearch): Promise<Search> {
    const [newSearch] = await db.insert(searches).values(search).returning();
    return newSearch;
  }

  async getRecentSearches(): Promise<Search[]> {
    return await db.select().from(searches).orderBy(desc(searches.createdAt));
  }

  async createWalletSearch(search: InsertWalletSearch): Promise<WalletSearch> {
    const [newSearch] = await db.insert(walletSearches).values(search).returning();
    return newSearch;
  }

  async getRecentWalletSearches(): Promise<WalletSearch[]> {
    return await db.select().from(walletSearches).orderBy(desc(walletSearches.createdAt));
  }
}

export const storage = new DatabaseStorage();
