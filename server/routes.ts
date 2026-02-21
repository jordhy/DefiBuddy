import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post(api.crypto.lookup.path, async (req, res) => {
    try {
      const { personName } = api.crypto.lookup.input.parse(req.body);

      const now = new Date();
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      const dateRange = `${oneYearAgo.toLocaleDateString("en-US", { month: "long", year: "numeric" })} through ${now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
      
      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          {
            role: "system",
            content: `You are a cryptocurrency research expert. Your task is to identify the top 5 cryptocurrency assets that a given public figure (who has a large following on Twitter/X) is known to be invested in, has publicly endorsed, or has shown strong public support for during the period from ${dateRange}.

Consider publicly known information such as:
- Direct ownership or company holdings (e.g., Tesla holding Bitcoin)
- Public tweets or statements about specific crypto assets
- Known investments through their companies or funds
- Public endorsements or promotions of specific cryptocurrencies
- Meme coins or tokens they have promoted or are associated with

For each asset, estimate an exposure percentage based on the frequency and intensity of the person's positive public comments and endorsements on social media. The percentages for all assets MUST add up to exactly 100%.

You MUST always respond with a valid JSON object in this exact format:
{"investments": [{"name": "Bitcoin", "percentage": 40}, {"name": "Dogecoin", "percentage": 25}, ...]}

Always return at least the most well-known crypto associations for the person. Use full asset names (e.g., "Bitcoin", "Dogecoin", "Ethereum"). Never return an empty array for well-known crypto influencers. Percentages must be whole numbers that sum to 100.`
          },
          {
            role: "user",
            content: `What are the top 5 crypto assets that ${personName} is invested in or has publicly supported? Include exposure percentages based on social media endorsement intensity.`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content || '{"investments":[]}';
      console.log(`AI response for "${personName}":`, content);
      let top5: Array<{ name: string; percentage: number }> = [];
      try {
        const parsed = JSON.parse(content);
        const responseSchema = z.object({
          investments: z.array(z.object({
            name: z.string(),
            percentage: z.number(),
          })),
        });
        const validated = responseSchema.safeParse(parsed);
        if (validated.success) {
          top5 = validated.data.investments.slice(0, 5);
        } else {
          top5 = [];
        }
      } catch (parseErr) {
        console.error("Failed to parse AI response:", parseErr);
        top5 = [];
      }
      
      const saved = await storage.createSearch({
        personName,
        investments: top5
      });

      res.json({
        personName: saved.personName,
        investments: saved.investments
      });
    } catch (err) {
      console.error("Crypto lookup error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input" });
      }
      res.status(500).json({ message: "Failed to fetch crypto data" });
    }
  });

  app.get(api.crypto.history.path, async (req, res) => {
    try {
      const history = await storage.getRecentSearches();
      res.json(history);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  app.post(api.wallet.lookup.path, async (req, res) => {
    try {
      const { address } = api.wallet.lookup.input.parse(req.body);

      const ethplorerRes = await fetch(
        `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey`
      );

      if (!ethplorerRes.ok) {
        console.error("Ethplorer API error:", ethplorerRes.status);
        return res.status(502).json({ message: "Failed to fetch wallet data from blockchain" });
      }

      const data = await ethplorerRes.json() as {
        ETH?: { balance?: number; price?: { rate?: number } };
        tokens?: Array<{
          tokenInfo?: { name?: string; symbol?: string; decimals?: string | number; type?: string; price?: { rate?: number } | false };
          balance?: number;
        }>;
        error?: { message?: string };
      };

      if (data.error) {
        console.error("Ethplorer error:", data.error);
        return res.status(400).json({ message: data.error.message || "Invalid address" });
      }

      const rawTokens: Array<{ name: string; symbol: string; balance: string; balanceUsd: number }> = [];

      if (data.ETH) {
        const ethBalance = data.ETH.balance || 0;
        const ethPrice = data.ETH.price?.rate || 0;
        rawTokens.push({
          name: "Ethereum",
          symbol: "ETH",
          balance: ethBalance.toFixed(4),
          balanceUsd: Math.round(ethBalance * ethPrice * 100) / 100,
        });
      }

      if (data.tokens && Array.isArray(data.tokens)) {
        for (const token of data.tokens) {
          const info = token.tokenInfo;
          if (!info || !info.name || !info.symbol) continue;
          if (info.type && info.type !== "ERC-20") continue;
          const decimals = Number(info.decimals) || 0;
          const rawBalance = token.balance || 0;
          const adjustedBalance = rawBalance / Math.pow(10, decimals);
          const price = typeof info.price === "object" && info.price ? (info.price.rate || 0) : 0;
          const balanceUsd = Math.round(adjustedBalance * price * 100) / 100;

          rawTokens.push({
            name: info.name,
            symbol: info.symbol,
            balance: adjustedBalance > 1000 ? adjustedBalance.toFixed(0) : adjustedBalance.toFixed(4),
            balanceUsd,
          });
        }
      }

      rawTokens.sort((a, b) => b.balanceUsd - a.balanceUsd);
      const top5Raw = rawTokens.slice(0, 5);
      const totalUsd = top5Raw.reduce((sum, t) => sum + t.balanceUsd, 0);
      const topTokens = top5Raw.map((t, i, arr) => {
        let pct = totalUsd > 0 ? Math.round((t.balanceUsd / totalUsd) * 100) : Math.round(100 / arr.length);
        return { ...t, percentage: pct };
      });
      const pctSum = topTokens.reduce((s, t) => s + t.percentage, 0);
      if (pctSum !== 100 && topTokens.length > 0) {
        topTokens[0].percentage += 100 - pctSum;
      }

      const saved = await storage.createWalletSearch({
        address,
        tokens: topTokens,
      });

      res.json({
        address: saved.address,
        tokens: saved.tokens,
      });
    } catch (err) {
      console.error("Wallet lookup error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid Ethereum address format" });
      }
      res.status(500).json({ message: "Failed to fetch wallet data" });
    }
  });

  app.get(api.wallet.history.path, async (req, res) => {
    try {
      const history = await storage.getRecentWalletSearches();
      res.json(history);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch wallet history" });
    }
  });

  app.post("/api/uniswap/check-tokens", async (req, res) => {
    try {
      const schema = z.object({
        symbols: z.array(z.string()),
      });
      const { symbols } = schema.parse(req.body);

      const tokenListRes = await fetch("https://tokens.uniswap.org");
      const tokenList = await tokenListRes.json() as { tokens: Array<{ symbol: string; address: string; chainId: number; decimals: number; name: string }> };

      const mainnetTokens = tokenList.tokens.filter((t: any) => t.chainId === 1);

      const results = symbols.map((sym) => {
        const token = mainnetTokens.find(
          (t: any) => t.symbol.toLowerCase() === sym.toLowerCase()
        );
        return {
          symbol: sym,
          available: !!token,
          address: token?.address || null,
          decimals: token?.decimals || null,
          name: token?.name || null,
        };
      });

      res.json({ tokens: results });
    } catch (err: any) {
      console.error("Uniswap token check error:", err);
      res.status(500).json({ message: err.message || "Failed to check tokens" });
    }
  });

  app.post("/api/uniswap/pools", async (req, res) => {
    try {
      const schema = z.object({
        symbols: z.array(z.string()),
      });
      const { symbols } = schema.parse(req.body);
      const lowerSymbols = symbols.map((s) => s.toLowerCase());

      const poolsRes = await fetch("https://yields.llama.fi/pools");
      if (!poolsRes.ok) {
        return res.status(502).json({ message: "Pool data service unavailable" });
      }
      const poolsData = (await poolsRes.json()) as {
        status: string;
        data: Array<{
          pool: string;
          chain: string;
          project: string;
          symbol: string;
          tvlUsd: number;
          apy: number | null;
          apyBase: number | null;
          apyReward: number | null;
        }>;
      };

      if (poolsData.status !== "success" || !poolsData.data) {
        return res.status(502).json({ message: "Failed to fetch pool data" });
      }

      const uniswapPools = poolsData.data.filter(
        (p) =>
          p.project.includes("uniswap") &&
          p.chain === "Ethereum" &&
          p.tvlUsd > 100000
      );

      const matchingPools = uniswapPools
        .filter((p) => {
          const poolSymbols = p.symbol.toLowerCase().split(/[-\/\s]+/).map((s) => s.trim());
          return poolSymbols.some((ps) => lowerSymbols.includes(ps));
        })
        .map((p) => ({
          id: p.pool,
          name: p.symbol,
          project: p.project,
          chain: p.chain,
          tvlUsd: p.tvlUsd,
          apr: p.apy ?? p.apyBase ?? 0,
          apyBase: p.apyBase ?? 0,
          apyReward: p.apyReward ?? 0,
        }))
        .sort((a, b) => b.apr - a.apr)
        .slice(0, 20);

      res.json({ pools: matchingPools });
    } catch (err: any) {
      console.error("Uniswap pools error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch pools" });
    }
  });

  app.get("/api/buddies", async (req, res) => {
    try {
      const buddies = await storage.getBuddies();
      res.json(buddies);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch buddies" });
    }
  });

  app.post("/api/buddies", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1, "Name is required"),
        contribution: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0, "Contribution must be a positive number"),
      });
      const data = schema.parse(req.body);
      const buddy = await storage.createBuddy(data);
      res.json(buddy);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      }
      res.status(500).json({ message: "Failed to add buddy" });
    }
  });

  app.delete("/api/buddies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deleteBuddy(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to remove buddy" });
    }
  });

  app.post("/api/portfolio/chat", async (req, res) => {
    try {
      const schema = z.object({
        message: z.string().min(1),
        portfolio: z.array(z.object({
          name: z.string(),
          symbol: z.string().optional(),
          percentage: z.number(),
        })),
      });
      const { message, portfolio } = schema.parse(req.body);

      const portfolioDescription = portfolio.length > 0
        ? portfolio.map((p) => `${p.name}${p.symbol ? ` (${p.symbol})` : ""}: ${p.percentage}%`).join(", ")
        : "Empty portfolio (no assets)";

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a portfolio management assistant for DefiBuddy. The user has a crypto portfolio and wants to modify it via natural language.

Current portfolio: ${portfolioDescription}

RULES:
- Always return valid JSON with two fields: "reply" (string message to user) and "portfolio" (array of objects with "name", "symbol" (optional), and "percentage" fields).
- Percentages MUST always sum to exactly 100.
- When adding an asset, distribute its percentage by reducing others proportionally.
- When removing an asset, redistribute its percentage proportionally among remaining assets.
- When rebalancing, follow the user's instruction (e.g. "equal" means split evenly).
- If the user asks something unrelated or you can't parse their intent, return the portfolio unchanged and explain in your reply.
- Keep asset names concise and use standard ticker symbols.
- If the portfolio would be empty after removal, return an empty array and note that in reply.`,
          },
          { role: "user", content: message },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "No response from AI" });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        return res.json({ reply: "I had trouble processing that. Could you try rephrasing?", portfolio });
      }

      const responseSchema = z.object({
        reply: z.string(),
        portfolio: z.array(z.object({
          name: z.string(),
          symbol: z.string().optional(),
          percentage: z.number(),
        })),
      });

      const result = responseSchema.safeParse(parsed);
      if (!result.success) {
        return res.json({ reply: parsed.reply || "I had trouble updating the portfolio. Please try again.", portfolio });
      }

      let items = result.data.portfolio;
      if (items.length > 0) {
        const total = items.reduce((s, i) => s + i.percentage, 0);
        if (total > 0 && Math.abs(total - 100) > 0.5) {
          items = items.map((i) => ({ ...i, percentage: Math.round((i.percentage / total) * 100) }));
          const diff = 100 - items.reduce((s, i) => s + i.percentage, 0);
          if (diff !== 0) items[0].percentage += diff;
        }
      }

      res.json({ reply: result.data.reply, portfolio: items });
    } catch (err: any) {
      console.error("Portfolio chat error:", err);
      res.status(500).json({ message: err.message || "Failed to process chat" });
    }
  });

  return httpServer;
}
