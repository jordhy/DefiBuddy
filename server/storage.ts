import { db } from "./db";
import { searches, walletSearches, buddies, nftMetadata, type InsertSearch, type Search, type InsertWalletSearch, type WalletSearch, type Buddy, type InsertBuddy, type NftMetadata, type InsertNftMetadata } from "@shared/schema";
import { desc, eq } from "drizzle-orm";

export interface IStorage {
  createSearch(search: InsertSearch): Promise<Search>;
  getRecentSearches(): Promise<Search[]>;
  createWalletSearch(search: InsertWalletSearch): Promise<WalletSearch>;
  getRecentWalletSearches(): Promise<WalletSearch[]>;
  getBuddies(): Promise<Buddy[]>;
  createBuddy(buddy: InsertBuddy): Promise<Buddy>;
  deleteBuddy(id: number): Promise<void>;
  createNftMetadata(data: InsertNftMetadata): Promise<NftMetadata>;
  getNftMetadata(id: number): Promise<NftMetadata | undefined>;
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

  async getBuddies(): Promise<Buddy[]> {
    return await db.select().from(buddies).orderBy(desc(buddies.createdAt));
  }

  async createBuddy(buddy: InsertBuddy): Promise<Buddy> {
    const [newBuddy] = await db.insert(buddies).values(buddy).returning();
    return newBuddy;
  }

  async deleteBuddy(id: number): Promise<void> {
    await db.delete(buddies).where(eq(buddies.id, id));
  }

  async createNftMetadata(data: InsertNftMetadata): Promise<NftMetadata> {
    const [newMeta] = await db.insert(nftMetadata).values(data).returning();
    return newMeta;
  }

  async getNftMetadata(id: number): Promise<NftMetadata | undefined> {
    const [meta] = await db.select().from(nftMetadata).where(eq(nftMetadata.id, id));
    return meta;
  }
}

export const storage = new DatabaseStorage();
