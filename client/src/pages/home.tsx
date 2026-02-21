import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, TrendingUp, History, Loader2, Wallet, DollarSign, Link2, Copy, Briefcase, X, MessageCircle, Send, Bot, User, Rocket, Gift, AlertTriangle, CheckCircle, Users, Plus, Trash2, HandCoins, BarChart3, Printer, Mail, Share2, Gem } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { CryptoLookupResponse, WalletLookupResponse, WalletToken, CryptoInvestment, Buddy } from "@shared/schema";

type PortfolioItem = { name: string; symbol?: string; percentage: number };
type Portfolio = { source: string; items: PortfolioItem[] };
type ChatMessage = { role: "user" | "assistant"; content: string };
type TokenCheck = { symbol: string; available: boolean; address: string | null; decimals: number | null; name: string | null };

const UNISWAP_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
const WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const SEPOLIA_CHAIN_ID = BigInt(11155111);

const SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
];

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

function isEthereumAddress(input: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(input.trim());
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [lastSearchType, setLastSearchType] = useState<"personality" | "wallet" | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(() => {
    try {
      const saved = localStorage.getItem("defibuddy_portfolio");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [deployLoading, setDeployLoading] = useState(false);
  const [tokenChecks, setTokenChecks] = useState<TokenCheck[] | null>(null);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [poolsOpen, setPoolsOpen] = useState(false);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [pools, setPools] = useState<Array<{ id: string; name: string; project: string; chain: string; tvlUsd: number; apr: number; apyBase: number; apyBase7d: number | null; apyReward: number; il7d: number | null; volumeUsd1d: number | null; volumeUsd7d: number | null; feeTier: string | null; exposure: string | null }>>([]);
  const [deployingPoolId, setDeployingPoolId] = useState<string | null>(null);
  const [buddiesOpen, setBuddiesOpen] = useState(false);
  const [buddyName, setBuddyName] = useState("");
  const [buddyContribution, setBuddyContribution] = useState("");
  const [priceHistory, setPriceHistory] = useState<Record<string, { prices: Array<{ timestamp: number; price: number }>; currentPrice: number; avgPrice: number }>>({});
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [priceChartOpen, setPriceChartOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [mintingNft, setMintingNft] = useState(false);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const { toast } = useToast();

  const buddiesQuery = useQuery<Buddy[]>({
    queryKey: ["/api/buddies"],
  });

  const addBuddyMutation = useMutation({
    mutationFn: async (data: { name: string; contribution: string }) => {
      const res = await apiRequest("POST", "/api/buddies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buddies"] });
      setBuddyName("");
      setBuddyContribution("");
      toast({ title: "Buddy added!" });
    },
    onError: () => {
      toast({ title: "Failed to add buddy", variant: "destructive" });
    },
  });

  const removeBuddyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/buddies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buddies"] });
      toast({ title: "Buddy removed" });
    },
  });

  useEffect(() => {
    if (portfolio) {
      localStorage.setItem("defibuddy_portfolio", JSON.stringify(portfolio));
    } else {
      localStorage.removeItem("defibuddy_portfolio");
    }
  }, [portfolio]);

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);
    try {
      const res = await apiRequest("POST", "/api/portfolio/chat", {
        message: userMsg,
        portfolio: portfolio?.items ?? [],
      });
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      if (data.portfolio) {
        const newItems: PortfolioItem[] = data.portfolio;
        if (newItems.length === 0) {
          setPortfolio(null);
        } else {
          setPortfolio((prev) => ({
            source: prev?.source ?? "AI Chat",
            items: newItems,
          }));
        }
      }
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, portfolio]);

  const deployPortfolio = useCallback(async () => {
    if (!portfolio || portfolio.items.length === 0) {
      toast({ title: "No portfolio", description: "Clone a portfolio first.", variant: "destructive" });
      return;
    }
    if (!connectedAddress) {
      toast({ title: "Wallet not connected", description: "Connect your MetaMask wallet first.", variant: "destructive" });
      return;
    }

    setDeployLoading(true);
    setDeployStatus("Checking token availability on Uniswap...");
    setTokenChecks(null);

    try {
      const symbols = portfolio.items.map((i) => i.symbol || i.name).filter(Boolean);
      const res = await apiRequest("POST", "/api/uniswap/check-tokens", { symbols });
      const data = await res.json();
      const checks: TokenCheck[] = data.tokens;
      setTokenChecks(checks);

      const missing = checks.filter((t) => !t.available);
      if (missing.length > 0) {
        setDeployStatus(`${missing.length} asset${missing.length > 1 ? "s" : ""} not available on Uniswap: ${missing.map((m) => m.symbol).join(", ")}`);
        setDeployLoading(false);
        return;
      }

      setDeployStatus("All tokens available. Connecting to Ethereum mainnet...");

      const { BrowserProvider, Contract, parseEther } = await import("ethers");
      const provider = new BrowserProvider(window.ethereum!);

      const network = await provider.getNetwork();
      if (network.chainId !== SEPOLIA_CHAIN_ID) {
        setDeployStatus("Please switch MetaMask to Sepolia testnet before deploying.");
        setDeployLoading(false);
        return;
      }

      const signer = await provider.getSigner();
      let balance = await provider.getBalance(connectedAddress);

      if (balance === BigInt(0)) {
        setDeployStatus("Your wallet has 0 ETH. You need ETH to swap on Uniswap.");
        setDeployLoading(false);
        return;
      }

      const router = new Contract(UNISWAP_ROUTER, SWAP_ROUTER_ABI, signer);
      const availableTokens = checks.filter((t) => t.available && t.address);
      let successCount = 0;
      const totalPercentage = availableTokens.reduce((sum, t) => {
        const item = portfolio.items.find((i) => (i.symbol || i.name).toLowerCase() === t.symbol.toLowerCase());
        return sum + (item?.percentage || 0);
      }, 0);

      for (const token of availableTokens) {
        const item = portfolio.items.find(
          (i) => (i.symbol || i.name).toLowerCase() === token.symbol.toLowerCase()
        );
        if (!item) continue;

        balance = await provider.getBalance(connectedAddress);

        const preliminaryAmount = (balance * BigInt(item.percentage)) / BigInt(totalPercentage > 0 ? totalPercentage : 100);
        if (preliminaryAmount === BigInt(0)) continue;

        setDeployStatus(`Estimating gas for ETH → ${token.symbol} (${item.percentage}%)...`);

        const params = {
          tokenIn: WETH_ADDRESS,
          tokenOut: token.address,
          fee: 3000,
          recipient: connectedAddress,
          deadline: Math.floor(Date.now() / 1000) + 1800,
          amountIn: preliminaryAmount,
          amountOutMinimum: BigInt(1),
          sqrtPriceLimitX96: 0,
        };

        let gasEstimate: bigint;
        try {
          gasEstimate = await router.exactInputSingle.estimateGas(params, { value: preliminaryAmount });
        } catch (gasErr: any) {
          console.error(`Gas estimation failed for ${token.symbol}:`, gasErr);
          toast({ title: `Skipped ${token.symbol}`, description: "Could not estimate gas for this swap.", variant: "destructive" });
          continue;
        }

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || parseEther("0.00000005");
        const gasCost = gasEstimate * gasPrice * BigInt(120) / BigInt(100);

        if (gasCost >= balance) {
          setDeployStatus(`Not enough ETH for gas. Need ~${(Number(gasCost) / 1e18).toFixed(6)} ETH for ${token.symbol} swap.`);
          toast({ title: "Not enough ETH for gas", description: `The ${token.symbol} swap needs ~${(Number(gasCost) / 1e18).toFixed(6)} ETH in gas but your wallet can't cover it.`, variant: "destructive" });
          break;
        }

        const usableBalance = balance - gasCost;
        const amountIn = (usableBalance * BigInt(item.percentage)) / BigInt(totalPercentage > 0 ? totalPercentage : 100);
        if (amountIn === BigInt(0)) continue;

        setDeployStatus(`Swapping ETH → ${token.symbol} (${item.percentage}%)...`);

        try {
          const finalParams = { ...params, amountIn };
          const tx = await router.exactInputSingle(finalParams, { value: amountIn });
          await tx.wait();
          successCount++;
        } catch (swapErr: any) {
          console.error(`Swap failed for ${token.symbol}:`, swapErr);
          toast({
            title: `Swap failed: ${token.symbol}`,
            description: swapErr.reason || swapErr.message || "Transaction rejected",
            variant: "destructive",
          });
        }
      }

      setDeployStatus(
        successCount > 0
          ? `Portfolio deployed! ${successCount}/${availableTokens.length} swaps completed.`
          : "No swaps were completed. Transactions may have been rejected."
      );
    } catch (err: any) {
      console.error("Deploy error:", err);
      setDeployStatus(err.message || "Failed to deploy portfolio");
    } finally {
      setDeployLoading(false);
    }
  }, [portfolio, connectedAddress, toast]);

  const fetchPools = useCallback(async () => {
    if (!portfolio || portfolio.items.length === 0) {
      toast({ title: "No portfolio", description: "Clone a portfolio first to see matching pools.", variant: "destructive" });
      return;
    }
    setPoolsOpen(true);
    setPoolsLoading(true);
    setPools([]);
    try {
      const symbols = portfolio.items.map((i) => i.symbol || i.name).filter(Boolean);
      const res = await apiRequest("POST", "/api/uniswap/pools", { symbols });
      const data = await res.json();
      setPools(data.pools || []);
    } catch (err: any) {
      toast({ title: "Failed to load pools", description: err.message || "Could not fetch Uniswap pool data.", variant: "destructive" });
    } finally {
      setPoolsLoading(false);
    }
  }, [portfolio, toast]);

  const deployToPool = useCallback(async (pool: { id: string; name: string }) => {
    if (!portfolio || portfolio.items.length === 0) {
      toast({ title: "No portfolio", description: "Clone a portfolio first.", variant: "destructive" });
      return;
    }
    if (!connectedAddress) {
      toast({ title: "Wallet not connected", description: "Connect your MetaMask wallet first.", variant: "destructive" });
      return;
    }
    if (!window.ethereum) {
      toast({ title: "MetaMask required", description: "Please install MetaMask to deploy funds.", variant: "destructive" });
      return;
    }

    const poolSymbols = pool.name.toLowerCase().split(/[-\/\s]+/).map((s) => s.trim().replace(/\.e$/, ""));

    let matchingItem: PortfolioItem | undefined;
    let targetSymbol: string | undefined;

    for (const ps of poolSymbols) {
      const found = portfolio.items.find(
        (i) => (i.symbol || i.name).toLowerCase() === ps
      );
      if (found) {
        matchingItem = found;
        const otherSymbols = poolSymbols.filter((s) => s !== ps);
        targetSymbol = otherSymbols.find((s) => s !== "eth" && s !== "weth") || otherSymbols[0];
        break;
      }
    }

    if (!matchingItem || !targetSymbol) {
      toast({ title: "No matching asset", description: `None of your portfolio assets match this pool (${pool.name}).`, variant: "destructive" });
      return;
    }

    const isEthTarget = targetSymbol === "eth" || targetSymbol === "weth";
    if (isEthTarget) {
      toast({ title: "Already holding ETH", description: "This pool pairs your asset with ETH — you already hold ETH in your wallet.", variant: "destructive" });
      return;
    }

    setDeployingPoolId(pool.id);

    try {
      const res = await apiRequest("POST", "/api/uniswap/check-tokens", { symbols: [targetSymbol] });
      const data = await res.json();
      const tokenInfo: TokenCheck = data.tokens?.[0];

      if (!tokenInfo?.available || !tokenInfo.address) {
        toast({ title: "Token not found", description: `${targetSymbol.toUpperCase()} is not available on Uniswap's token list.`, variant: "destructive" });
        setDeployingPoolId(null);
        return;
      }

      const { BrowserProvider, Contract, parseEther } = await import("ethers");
      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== SEPOLIA_CHAIN_ID) {
        toast({ title: "Wrong network", description: "Please switch MetaMask to Sepolia testnet.", variant: "destructive" });
        setDeployingPoolId(null);
        return;
      }

      const signer = await provider.getSigner();
      const balance = await provider.getBalance(connectedAddress);
      const allocationPct = matchingItem.percentage;

      const feeTiers = [3000, 500, 10000, 100];
      let lastErr: any = null;
      let success = false;

      for (const fee of feeTiers) {
        try {
          const router = new Contract(UNISWAP_ROUTER, SWAP_ROUTER_ABI, signer);

          const preliminaryAmount = (balance * BigInt(allocationPct)) / BigInt(100);
          if (preliminaryAmount === BigInt(0)) {
            toast({ title: "Amount too small", description: `${allocationPct}% allocation results in zero ETH to swap.`, variant: "destructive" });
            setDeployingPoolId(null);
            return;
          }

          const params = {
            tokenIn: WETH_ADDRESS,
            tokenOut: tokenInfo.address,
            fee,
            recipient: connectedAddress,
            deadline: Math.floor(Date.now() / 1000) + 1800,
            amountIn: preliminaryAmount,
            amountOutMinimum: BigInt(1),
            sqrtPriceLimitX96: 0,
          };

          let gasEstimate: bigint;
          try {
            gasEstimate = await router.exactInputSingle.estimateGas(params, { value: preliminaryAmount });
          } catch {
            continue;
          }

          const feeData = await provider.getFeeData();
          const gasPrice = feeData.gasPrice || parseEther("0.00000005");
          const gasCost = gasEstimate * gasPrice * BigInt(120) / BigInt(100);

          if (gasCost >= balance) {
            toast({ title: "Not enough ETH for gas", description: `This transaction needs ~${(Number(gasCost) / 1e18).toFixed(6)} ETH in gas but your wallet can't cover it.`, variant: "destructive" });
            setDeployingPoolId(null);
            return;
          }

          const usableBalance = balance - gasCost;
          const amountIn = (usableBalance * BigInt(allocationPct)) / BigInt(100);

          if (amountIn === BigInt(0)) {
            toast({ title: "Amount too small", description: `After gas fees, ${allocationPct}% allocation results in zero ETH to swap.`, variant: "destructive" });
            setDeployingPoolId(null);
            return;
          }

          const finalParams = { ...params, amountIn };
          const tx = await router.exactInputSingle(finalParams, { value: amountIn });
          await tx.wait();
          success = true;
          break;
        } catch (err: any) {
          lastErr = err;
          if (err?.code === "ACTION_REJECTED" || err?.code === 4001) throw err;
        }
      }

      if (success) {
        toast({
          title: "Deployed successfully!",
          description: `Swapped ${allocationPct}% of your ETH into ${targetSymbol.toUpperCase()} via ${pool.name} pool.`,
        });
      } else {
        throw lastErr || new Error("All fee tiers failed");
      }
    } catch (err: any) {
      console.error("Pool deploy error:", err);
      toast({
        title: "Deploy failed",
        description: err.reason || err.message || "Transaction rejected or failed.",
        variant: "destructive",
      });
    } finally {
      setDeployingPoolId(null);
    }
  }, [portfolio, connectedAddress, toast]);

  const historyQuery = useQuery<Array<{ id: number; personName: string; investments: CryptoInvestment[]; createdAt: string }>>({
    queryKey: ["/api/crypto/history"],
  });

  const walletHistoryQuery = useQuery<Array<{ id: number; address: string; tokens: WalletToken[]; createdAt: string }>>({
    queryKey: ["/api/wallet/history"],
  });

  const lookupMutation = useMutation({
    mutationFn: async (name: string): Promise<CryptoLookupResponse> => {
      const res = await apiRequest("POST", "/api/crypto/lookup", { personName: name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crypto/history"] });
    },
  });

  const walletMutation = useMutation({
    mutationFn: async (address: string): Promise<WalletLookupResponse> => {
      const res = await apiRequest("POST", "/api/wallet/lookup", { address });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/history"] });
    },
  });

  const fetchPriceHistory = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    setPriceHistoryLoading(true);
    try {
      const res = await apiRequest("POST", "/api/prices/history", { symbols });
      const data = await res.json();
      setPriceHistory(data.prices || {});
    } catch (err) {
      console.error("Price history fetch error:", err);
    } finally {
      setPriceHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (walletMutation.data?.tokens && walletMutation.data.tokens.length > 0) {
      const symbols = walletMutation.data.tokens.map((t) => t.symbol);
      fetchPriceHistory(symbols);
    }
  }, [walletMutation.data, fetchPriceHistory]);

  useEffect(() => {
    if (lookupMutation.data?.investments && lookupMutation.data.investments.length > 0) {
      const symbols = lookupMutation.data.investments.map((a) => a.name);
      fetchPriceHistory(symbols);
    }
  }, [lookupMutation.data, fetchPriceHistory]);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      toast({
        title: "No wallet found",
        description: "Please install MetaMask or another Ethereum wallet extension.",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        setConnectedAddress(address);
        setQuery(address);
        setLastSearchType("wallet");
        lookupMutation.reset();
        walletMutation.reset();
        walletMutation.mutate(address);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not connect wallet";
      toast({
        title: "Connection failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  }, [toast, lookupMutation, walletMutation]);

  const mintReportAsNFT = useCallback(async () => {
    if (!connectedAddress || !window.ethereum) {
      toast({ title: "Connect your wallet first", variant: "destructive" });
      return;
    }

    setMintingNft(true);
    setMintStatus("Preparing report data...");

    try {
      const tokens = walletMutation.data?.tokens || [];
      const buddyList = buddiesQuery.data || [];
      const totalValue = tokens.reduce((sum, t) => sum + t.balanceUsd, 0);
      const totalFund = buddyList.reduce((sum, b) => sum + Number(b.contribution), 0);

      const metadata = {
        name: `DefiBuddies Report - ${new Date().toLocaleDateString()}`,
        description: `Performance report for wallet ${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}. Total portfolio value: $${totalValue.toFixed(2)}. Generated by DefiBuddies.`,
        image: "",
        attributes: [
          { trait_type: "Report Date", value: new Date().toISOString().split("T")[0] },
          { trait_type: "Wallet", value: `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}` },
          { trait_type: "Total Value", value: Math.round(totalValue * 100) / 100 },
          { trait_type: "Number of Holdings", value: tokens.length },
          { trait_type: "Number of Buddies", value: buddyList.length },
          { trait_type: "Total Buddy Fund", value: Math.round(totalFund * 100) / 100 },
        ],
        holdings: tokens.map((t) => ({
          name: t.name,
          symbol: t.symbol,
          balanceUsd: t.balanceUsd,
          percentage: t.percentage,
        })),
        buddies: buddyList.map((b) => {
          const pct = totalFund > 0 ? (Number(b.contribution) / totalFund) * 100 : 0;
          return { name: b.name, contribution: Number(b.contribution), percentage: Math.round(pct * 10) / 10 };
        }),
        totalValue,
        totalFund,
        reportDate: new Date().toISOString(),
      };

      setMintStatus("Saving metadata on-chain reference...");
      const metaRes = await apiRequest("POST", "/api/nft/metadata", {
        walletAddress: connectedAddress,
        metadata,
      });
      const { metadataUrl } = (await metaRes.json()) as { id: number; metadataUrl: string };

      const { BrowserProvider, ContractFactory, Contract } = await import("ethers");
      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== SEPOLIA_CHAIN_ID) {
        setMintStatus("Please switch MetaMask to Sepolia testnet.");
        setMintingNft(false);
        return;
      }

      const signer = await provider.getSigner();
      const { NFT_CONTRACT_ABI, NFT_CONTRACT_BYTECODE } = await import("@shared/nftContract");

      let contractAddress = localStorage.getItem("defibuddy_nft_contract");

      if (!contractAddress) {
        setMintStatus("Deploying NFT contract (one-time)...");
        const factory = new ContractFactory(NFT_CONTRACT_ABI, NFT_CONTRACT_BYTECODE, signer);
        const deployed = await factory.deploy();
        await deployed.waitForDeployment();
        contractAddress = await deployed.getAddress();
        localStorage.setItem("defibuddy_nft_contract", contractAddress);
        setMintStatus("Contract deployed! Minting NFT...");
      } else {
        setMintStatus("Minting NFT...");
      }

      const nftContract = new Contract(contractAddress, NFT_CONTRACT_ABI, signer);
      const tx = await nftContract.mint(connectedAddress, metadataUrl);
      setMintStatus("Waiting for confirmation...");
      const receipt = await tx.wait();

      let tokenId: string | number = "unknown";
      for (const log of receipt.logs || []) {
        try {
          const parsed = nftContract.interface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed?.name === "Transfer") {
            tokenId = Number(parsed.args[2]);
            break;
          }
        } catch {}
      }

      setMintStatus(null);
      toast({
        title: "NFT Minted!",
        description: `Token #${tokenId} minted to your wallet on Sepolia.`,
      });
    } catch (err: unknown) {
      console.error("NFT mint error:", err);
      const message = err instanceof Error ? err.message : "Failed to mint NFT";
      setMintStatus(null);
      toast({ title: "Minting failed", description: message, variant: "destructive" });
    } finally {
      setMintingNft(false);
    }
  }, [connectedAddress, walletMutation.data, buddiesQuery.data, toast]);

  const isPending = lookupMutation.isPending || walletMutation.isPending;
  const detectedType = isEthereumAddress(query) ? "wallet" : "personality";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    if (isEthereumAddress(trimmed)) {
      setLastSearchType("wallet");
      walletMutation.reset();
      lookupMutation.reset();
      walletMutation.mutate(trimmed);
    } else {
      setLastSearchType("personality");
      lookupMutation.reset();
      walletMutation.reset();
      lookupMutation.mutate(trimmed);
    }
  };

  const formatUsd = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    if (value > 0) return `$${value.toFixed(2)}`;
    return "$0.00";
  };

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" data-testid="nav-top-bar">
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 mr-2 shrink-0" data-testid="nav-logo">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="font-bold text-base tracking-tight">DefiBuddies</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={connectWallet}
            disabled={isConnecting || isPending}
            data-testid="button-connect-wallet"
            className="gap-1.5 shrink-0"
          >
            {isConnecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : connectedAddress ? (
              <Link2 className="h-3.5 w-3.5" />
            ) : (
              <Wallet className="h-3.5 w-3.5" />
            )}
            {connectedAddress ? `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}` : "Connect Wallet"}
          </Button>

          <Button
            variant={portfolio ? "default" : "outline"}
            size="sm"
            className="gap-1.5 shrink-0"
            data-testid="button-my-portfolio"
            onClick={() => setPortfolioOpen(true)}
          >
            <Briefcase className="h-3.5 w-3.5" />
            My Portfolio
            {portfolio && (
              <Badge variant="secondary" className="ml-1 text-xs no-default-active-elevate">{portfolio.items.length}</Badge>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            data-testid="button-invest-nav"
            onClick={fetchPools}
            disabled={poolsLoading}
          >
            {poolsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
            Invest
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            data-testid="button-staking-rewards-nav"
            onClick={() => setReportOpen(true)}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Report Performance
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            data-testid="button-buddies"
            onClick={() => setBuddiesOpen(true)}
          >
            <Users className="h-3.5 w-3.5" />
            Buddies
            {buddiesQuery.data && buddiesQuery.data.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs no-default-active-elevate">{buddiesQuery.data.length}</Badge>
            )}
          </Button>

          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-primary/5 text-sm font-semibold shrink-0"
            data-testid="text-nav-total-fund"
          >
            <DollarSign className="h-3.5 w-3.5 text-primary" />
            <span className="text-primary">
              {buddiesQuery.data
                ? buddiesQuery.data.reduce((sum, b) => sum + Number(b.contribution), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : "0.00"}
            </span>
          </div>

          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setChatOpen(!chatOpen)}
            data-testid="button-toggle-chat"
          >
            {chatOpen ? <X className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
            AI Buddy
          </Button>
        </div>
      </nav>

      <div className="flex-1 flex items-start justify-center p-4 pt-8 md:pt-16">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center">
          <p className="text-muted-foreground" data-testid="text-page-subtitle">
            Enter a name or Ethereum address to look up crypto holdings
          </p>
        </div>

        <Dialog open={portfolioOpen} onOpenChange={setPortfolioOpen}>
            <DialogContent className="sm:max-w-md" data-testid="dialog-portfolio">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  My Portfolio
                </DialogTitle>
              </DialogHeader>
              {portfolio ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Cloned from <span className="font-medium text-foreground">{portfolio.source}</span>
                  </p>
                  <ol className="space-y-2">
                    {portfolio.items.map((item, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
                        data-testid={`portfolio-item-${index}`}
                      >
                        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <span className="font-medium truncate">{item.name}</span>
                          {item.symbol && (
                            <Badge variant="outline" className="text-xs shrink-0">{item.symbol}</Badge>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs font-semibold shrink-0">{item.percentage}%</Badge>
                      </li>
                    ))}
                  </ol>

                  {deployStatus && (
                    <div className="rounded-md border p-3 text-sm" data-testid="text-deploy-status">
                      <p className="text-muted-foreground">{deployStatus}</p>
                      {tokenChecks && (
                        <div className="mt-2 space-y-1">
                          {tokenChecks.map((t, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              {t.available ? (
                                <CheckCircle className="h-3 w-3 text-green-500" />
                              ) : (
                                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                              )}
                              <span className={t.available ? "text-foreground" : "text-muted-foreground"}>
                                {t.symbol} — {t.available ? "Available" : "Not found on Uniswap"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    data-testid="button-clear-portfolio"
                    onClick={() => {
                      setPortfolio(null);
                      setTokenChecks(null);
                      setDeployStatus(null);
                      toast({ title: "Portfolio cleared" });
                    }}
                  >
                    <X className="h-3 w-3 mr-1.5" />
                    Clear Portfolio
                  </Button>
                </div>
              ) : (
                <div className="py-8 text-center" data-testid="text-empty-portfolio">
                  <Briefcase className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No portfolio yet. Search for a personality or wallet, then click <span className="font-medium">"Clone Portfolio"</span> to save it here.
                  </p>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={buddiesOpen} onOpenChange={setBuddiesOpen}>
            <DialogContent className="sm:max-w-md" data-testid="dialog-buddies">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  My Buddies
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!buddyName.trim() || !buddyContribution.trim()) return;
                    addBuddyMutation.mutate({ name: buddyName.trim(), contribution: buddyContribution.trim() });
                  }}
                  className="flex gap-2"
                  data-testid="form-add-buddy"
                >
                  <Input
                    placeholder="Name"
                    value={buddyName}
                    onChange={(e) => setBuddyName(e.target.value)}
                    className="flex-1"
                    data-testid="input-buddy-name"
                  />
                  <Input
                    placeholder="Amount ($)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={buddyContribution}
                    onChange={(e) => setBuddyContribution(e.target.value)}
                    className="w-28"
                    data-testid="input-buddy-contribution"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={addBuddyMutation.isPending || !buddyName.trim() || !buddyContribution.trim()}
                    data-testid="button-add-buddy"
                  >
                    {addBuddyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </form>

                {buddiesQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : buddiesQuery.data && buddiesQuery.data.length > 0 ? (
                  <>
                    <ol className="space-y-2">
                      {buddiesQuery.data.map((buddy) => (
                        <li
                          key={buddy.id}
                          className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
                          data-testid={`buddy-item-${buddy.id}`}
                        >
                          <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <span className="font-medium flex-1 truncate">{buddy.name}</span>
                          <Badge variant="secondary" className="text-xs font-semibold shrink-0">
                            ${Number(buddy.contribution).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                            data-testid={`button-request-money-${buddy.id}`}
                            onClick={() => {
                              if (!connectedAddress) {
                                toast({ title: "Connect your wallet first", description: "Connect MetaMask so buddies know where to send crypto.", variant: "destructive" });
                                return;
                              }
                              const destWallets = JSON.stringify([{ address: connectedAddress, blockchains: ["ethereum"] }]);
                              const url = `https://pay.coinbase.com/buy?destinationWallets=${encodeURIComponent(destWallets)}&defaultAsset=ETH`;
                              window.open(url, "_blank", "noopener,noreferrer");
                            }}
                            title={`Request money from ${buddy.name}`}
                          >
                            <HandCoins className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeBuddyMutation.mutate(buddy.id)}
                            disabled={removeBuddyMutation.isPending}
                            data-testid={`button-remove-buddy-${buddy.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ol>
                    <div className="flex items-center justify-between p-3 rounded-md bg-primary/5 border" data-testid="text-buddies-total">
                      <span className="text-sm font-medium">Total Fund</span>
                      <span className="font-bold text-primary">
                        ${buddiesQuery.data.reduce((sum, b) => sum + Number(b.contribution), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center" data-testid="text-empty-buddies">
                    <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No buddies yet. Add friends who are investing alongside you.
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={poolsOpen} onOpenChange={setPoolsOpen}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col" data-testid="dialog-pools">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Best Uniswap Pools
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Top-performing Uniswap pools matching your portfolio assets, sorted by APR.
              </p>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {poolsLoading ? (
                  <div className="space-y-2 py-4">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : pools.length > 0 ? (
                  <ol className="space-y-2">
                    {pools.map((pool, index) => (
                      <li
                        key={pool.id}
                        className="flex flex-col gap-2 p-3 rounded-md bg-muted/50"
                        data-testid={`pool-item-${index}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-medium shrink-0">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{pool.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {pool.project}{pool.feeTier ? ` · ${pool.feeTier} fee` : ""}
                            </div>
                          </div>
                          <Badge
                            variant={pool.apr > 10 ? "default" : "secondary"}
                            className="text-xs font-bold shrink-0"
                            data-testid={`pool-apr-${index}`}
                          >
                            {pool.apr.toFixed(2)}% APR
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 shrink-0"
                            data-testid={`button-deploy-pool-${index}`}
                            disabled={deployingPoolId !== null}
                            onClick={() => deployToPool(pool)}
                          >
                            {deployingPoolId === pool.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                            Deploy
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 pl-10 text-xs text-muted-foreground">
                          <span data-testid={`pool-tvl-${index}`}>TVL <span className="font-medium text-foreground">${pool.tvlUsd >= 1_000_000 ? `${(pool.tvlUsd / 1_000_000).toFixed(1)}M` : `${(pool.tvlUsd / 1_000).toFixed(0)}K`}</span></span>
                          {pool.volumeUsd1d != null && (
                            <span data-testid={`pool-vol-${index}`}>24h Vol <span className="font-medium text-foreground">${pool.volumeUsd1d >= 1_000_000 ? `${(pool.volumeUsd1d / 1_000_000).toFixed(1)}M` : `${(pool.volumeUsd1d / 1_000).toFixed(0)}K`}</span></span>
                          )}
                          {pool.apyBase7d != null && (
                            <span data-testid={`pool-apr7d-${index}`}>7d APR <span className="font-medium text-foreground">{pool.apyBase7d.toFixed(2)}%</span></span>
                          )}
                          {pool.il7d != null && pool.il7d !== 0 && (
                            <span data-testid={`pool-il-${index}`}>7d IL <span className="font-medium text-destructive">{pool.il7d.toFixed(2)}%</span></span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="py-8 text-center" data-testid="text-empty-pools">
                    <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No matching Uniswap pools found for your portfolio assets.
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex gap-2" data-testid="form-search">
              <div className="relative flex-1">
                {detectedType === "wallet" ? (
                  <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  data-testid="input-search"
                  type="text"
                  placeholder="e.g. Elon Musk or 0xd8dA...6045"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={`pl-9 ${detectedType === "wallet" ? "font-mono text-sm" : ""}`}
                  disabled={isPending}
                />
              </div>
              <Button type="submit" disabled={isPending || !query.trim()} data-testid="button-search">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : detectedType === "wallet" ? "Lookup" : "Search"}
              </Button>
            </form>
            {query.trim() && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-3" data-testid="text-detected-type">
                {detectedType === "wallet" ? (
                  <><Wallet className="h-3 w-3" /> Detected as Ethereum address</>
                ) : (
                  <><Search className="h-3 w-3" /> Detected as personality name</>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        {isPending && (
          <Card data-testid="card-loading">
            <CardHeader>
              <CardTitle className="text-lg">
                {lastSearchType === "wallet" ? "Fetching wallet data..." : "Analyzing..."}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        )}

        {(lookupMutation.isError || walletMutation.isError) && (
          <Card className="border-destructive" data-testid="card-error">
            <CardContent className="pt-6">
              <p className="text-destructive text-sm">
                {walletMutation.isError
                  ? "Failed to fetch wallet data. Make sure the Ethereum address is valid."
                  : "Something went wrong. Please try again."}
              </p>
            </CardContent>
          </Card>
        )}

        {lookupMutation.data && !lookupMutation.isPending && lastSearchType === "personality" && (
          <Card data-testid="card-results">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {lookupMutation.data.personName}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  data-testid="button-price-chart-personality"
                  onClick={() => setPriceChartOpen(true)}
                  disabled={priceHistoryLoading || Object.keys(priceHistory).length === 0}
                >
                  {priceHistoryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
                  30d Chart
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  data-testid="button-clone-personality"
                  onClick={() => {
                    const items = lookupMutation.data!.investments.map((a) => ({
                      name: a.name,
                      percentage: a.percentage,
                    }));
                    setPortfolio({ source: lookupMutation.data!.personName, items });
                    toast({ title: "Portfolio saved!", description: `Cloned ${lookupMutation.data!.personName}'s portfolio.` });
                  }}
                >
                  <Copy className="h-3 w-3" />
                  Clone Portfolio
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lookupMutation.data.investments.length > 0 ? (
                <ol className="space-y-2">
                  {lookupMutation.data.investments.map((asset, index) => {
                    const ph = priceHistory[asset.name];
                    const priceChange = ph ? ((ph.currentPrice - ph.avgPrice) / ph.avgPrice * 100) : null;
                    return (
                    <li
                      key={index}
                      className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
                      data-testid={`item-asset-${index}`}
                    >
                      <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {index + 1}
                      </span>
                      <span className="font-medium flex-1">{asset.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {ph ? (
                          <div className="text-right" data-testid={`asset-price-info-${index}`}>
                            <div className="text-xs font-medium">{formatUsd(ph.currentPrice)}</div>
                            <div className={`text-[10px] ${priceChange && priceChange >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {priceChange !== null ? `${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(1)}% vs 30d avg` : ""}
                            </div>
                          </div>
                        ) : priceHistoryLoading ? (
                          <Skeleton className="h-6 w-16" />
                        ) : null}
                        <Badge variant="secondary" className="text-xs font-semibold">{asset.percentage}%</Badge>
                      </div>
                    </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm" data-testid="text-no-results">
                  No crypto investments found for this person.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {walletMutation.data && !walletMutation.isPending && lastSearchType === "wallet" && (
          <Card data-testid="card-wallet-results">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <span className="font-mono text-sm">{truncateAddress(walletMutation.data.address)}</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  data-testid="button-price-chart"
                  onClick={() => setPriceChartOpen(true)}
                  disabled={priceHistoryLoading || Object.keys(priceHistory).length === 0}
                >
                  {priceHistoryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
                  30d Chart
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  data-testid="button-clone-wallet"
                  onClick={() => {
                    const items = walletMutation.data!.tokens.map((t) => ({
                      name: t.name,
                      symbol: t.symbol,
                      percentage: t.percentage,
                    }));
                    const addr = walletMutation.data!.address;
                    setPortfolio({ source: `${addr.slice(0, 6)}...${addr.slice(-4)}`, items });
                    toast({ title: "Portfolio saved!", description: "Cloned wallet portfolio." });
                  }}
                >
                  <Copy className="h-3 w-3" />
                  Clone Portfolio
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {walletMutation.data.tokens.length > 0 ? (
                <ol className="space-y-2">
                  {walletMutation.data.tokens.map((token, index) => {
                    const ph = priceHistory[token.symbol];
                    const priceChange = ph ? ((ph.currentPrice - ph.avgPrice) / ph.avgPrice * 100) : null;
                    return (
                    <li
                      key={index}
                      className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
                      data-testid={`wallet-token-${index}`}
                    >
                      <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{token.name}</span>
                          <Badge variant="outline" className="text-xs shrink-0">{token.symbol}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{token.balance} {token.symbol}</span>
                          {token.balanceUsd > 0 && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-0.5">
                                <DollarSign className="h-3 w-3" />
                                {formatUsd(token.balanceUsd).slice(1)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ph ? (
                          <div className="text-right" data-testid={`token-price-info-${index}`}>
                            <div className="text-xs font-medium">{formatUsd(ph.currentPrice)}</div>
                            <div className={`text-[10px] ${priceChange && priceChange >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {priceChange !== null ? `${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(1)}% vs 30d avg` : ""}
                            </div>
                          </div>
                        ) : priceHistoryLoading ? (
                          <Skeleton className="h-6 w-16" />
                        ) : null}
                        <Badge variant="secondary" className="text-xs font-semibold shrink-0">{token.percentage}%</Badge>
                      </div>
                    </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm" data-testid="text-no-wallet-results">
                  No tokens found for this address.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={priceChartOpen} onOpenChange={setPriceChartOpen}>
          <DialogContent className="sm:max-w-lg" data-testid="dialog-price-chart">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                30-Day Price History
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {Object.entries(priceHistory).map(([symbol, data]) => {
                const chartData = data.prices.map((p) => ({
                  date: new Date(p.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                  price: p.price,
                }));
                const changePercent = ((data.currentPrice - data.avgPrice) / data.avgPrice * 100);
                return (
                  <div key={symbol} className="space-y-1" data-testid={`chart-${symbol}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{symbol}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Avg: {formatUsd(data.avgPrice)}</span>
                        <span className="text-muted-foreground">Now: {formatUsd(data.currentPrice)}</span>
                        <Badge variant={changePercent >= 0 ? "default" : "destructive"} className="text-[10px]">
                          {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-28 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} width={50} tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toFixed(0)}`} />
                          <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
                          <ReferenceLine y={data.avgPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "Avg", fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                          <Line type="monotone" dataKey="price" stroke={changePercent >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} strokeWidth={1.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
              {Object.keys(priceHistory).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No price data available for these assets.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="dialog-report">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Performance Report
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 flex gap-4 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-4 pr-1" id="report-content">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Wallet Holdings</h3>
                {walletMutation.data?.tokens && walletMutation.data.tokens.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between p-3 rounded-md bg-primary/5 border" data-testid="report-total-value">
                      <span className="text-sm font-medium">Total Value</span>
                      <span className="font-bold text-primary">
                        {formatUsd(walletMutation.data.tokens.reduce((sum, t) => sum + t.balanceUsd, 0))}
                      </span>
                    </div>
                    <ol className="space-y-2">
                      {walletMutation.data.tokens.map((token, i) => {
                        const ph = priceHistory[token.symbol];
                        const changePercent = ph ? ((ph.currentPrice - ph.avgPrice) / ph.avgPrice * 100) : null;
                        return (
                          <li key={i} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/50" data-testid={`report-token-${i}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">{token.name}</span>
                                <Badge variant="outline" className="text-[10px] shrink-0">{token.symbol}</Badge>
                              </div>
                              <span className="text-xs text-muted-foreground">{formatUsd(token.balanceUsd)}</span>
                            </div>
                            {changePercent !== null ? (
                              <div className="text-right shrink-0" data-testid={`report-change-${i}`}>
                                <div className="text-xs font-medium">{formatUsd(ph!.currentPrice)}</div>
                                <div className={`text-[10px] font-medium ${changePercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                                  {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(1)}% vs 30d avg
                                </div>
                              </div>
                            ) : priceHistoryLoading ? (
                              <Skeleton className="h-6 w-14" />
                            ) : null}
                            <Badge variant="secondary" className="text-xs font-semibold shrink-0">{token.percentage}%</Badge>
                          </li>
                        );
                      })}
                    </ol>
                    {Object.keys(priceHistory).length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">30-Day Trend</h4>
                        {walletMutation.data.tokens.slice(0, 3).map((token) => {
                          const ph = priceHistory[token.symbol];
                          if (!ph) return null;
                          const chartData = ph.prices.map((p) => ({
                            date: new Date(p.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                            price: p.price,
                          }));
                          const changePercent = ((ph.currentPrice - ph.avgPrice) / ph.avgPrice * 100);
                          return (
                            <div key={token.symbol} className="space-y-0.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{token.symbol}</span>
                                <Badge variant={changePercent >= 0 ? "default" : "destructive"} className="text-[10px]">
                                  {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(1)}%
                                </Badge>
                              </div>
                              <div className="h-20 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={chartData}>
                                    <XAxis dataKey="date" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                                    <YAxis tick={{ fontSize: 8 }} domain={["auto", "auto"]} width={45} tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toFixed(0)}`} />
                                    <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]} labelStyle={{ fontSize: 10 }} contentStyle={{ fontSize: 10 }} />
                                    <ReferenceLine y={ph.avgPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                                    <Line type="monotone" dataKey="price" stroke={changePercent >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} strokeWidth={1.5} dot={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="report-no-wallet">
                    No wallet data. Search for a wallet address first.
                  </p>
                )}
              </div>

              {buddiesQuery.data && buddiesQuery.data.length > 0 && (() => {
                const totalFund = buddiesQuery.data.reduce((sum, b) => sum + Number(b.contribution), 0);
                return (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Buddies Fund Allocation</h3>
                    <div className="flex items-center justify-between p-3 rounded-md bg-primary/5 border" data-testid="report-fund-total">
                      <span className="text-sm font-medium">Total Fund</span>
                      <span className="font-bold text-primary">{formatUsd(totalFund)}</span>
                    </div>
                    <ol className="space-y-1.5">
                      {buddiesQuery.data.map((buddy) => {
                        const pct = totalFund > 0 ? (Number(buddy.contribution) / totalFund * 100) : 0;
                        return (
                          <li key={buddy.id} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/50" data-testid={`report-buddy-${buddy.id}`}>
                            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-3 w-3 text-primary" />
                            </div>
                            <span className="font-medium text-sm flex-1 truncate">{buddy.name}</span>
                            <span className="text-xs text-muted-foreground">{formatUsd(Number(buddy.contribution))}</span>
                            <Badge variant="secondary" className="text-xs font-semibold shrink-0">{pct.toFixed(1)}%</Badge>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })()}
            </div>

            <div className="w-40 shrink-0 flex flex-col gap-2 border-l pl-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</h3>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs justify-start"
                data-testid="button-report-print"
                onClick={() => { window.print(); }}
              >
                <Printer className="h-3.5 w-3.5" />
                Print to PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs justify-start"
                data-testid="button-report-email"
                onClick={() => {
                  const totalValue = walletMutation.data?.tokens
                    ? formatUsd(walletMutation.data.tokens.reduce((sum, t) => sum + t.balanceUsd, 0))
                    : "$0.00";
                  const tokenLines = walletMutation.data?.tokens
                    ? walletMutation.data.tokens.map((t) => `${t.name} (${t.symbol}): ${formatUsd(t.balanceUsd)} - ${t.percentage}%`).join("%0A")
                    : "No wallet data";
                  const buddyLines = buddiesQuery.data && buddiesQuery.data.length > 0
                    ? buddiesQuery.data.map((b) => `${b.name}: ${formatUsd(Number(b.contribution))}`).join("%0A")
                    : "";
                  const subject = encodeURIComponent(`DefiBuddies Performance Report - ${new Date().toLocaleDateString()}`);
                  const body = `Portfolio Value: ${totalValue}%0A%0AHoldings:%0A${tokenLines}${buddyLines ? `%0A%0ABuddies:%0A${buddyLines}` : ""}`;
                  window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
                }}
              >
                <Mail className="h-3.5 w-3.5" />
                Send Email
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs justify-start"
                data-testid="button-report-share"
                onClick={() => {
                  const totalValue = walletMutation.data?.tokens
                    ? formatUsd(walletMutation.data.tokens.reduce((sum, t) => sum + t.balanceUsd, 0))
                    : "$0.00";
                  const text = `My DefiBuddies Portfolio Report - Total Value: ${totalValue}. Check out DefiBuddies for AI-powered crypto research!`;
                  if (navigator.share) {
                    navigator.share({ title: "DefiBuddies Performance Report", text }).catch(() => {});
                  } else {
                    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                    window.open(twitterUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </Button>
              <div className="border-t pt-2 mt-1">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-1.5 text-xs justify-start"
                  data-testid="button-mint-nft"
                  disabled={mintingNft || !connectedAddress}
                  onClick={mintReportAsNFT}
                >
                  {mintingNft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gem className="h-3.5 w-3.5" />}
                  Mint as NFT
                </Button>
                {mintStatus && (
                  <p className="text-[10px] text-muted-foreground mt-1" data-testid="text-mint-status">
                    {mintStatus}
                  </p>
                )}
                {!connectedAddress && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Connect wallet to mint
                  </p>
                )}
              </div>
            </div>
            </div>
          </DialogContent>
        </Dialog>

        {historyQuery.data && historyQuery.data.length > 0 && (
          <Card data-testid="card-history">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                Recent Personality Searches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {historyQuery.data.slice(0, 5).map((search) => (
                  <div
                    key={search.id}
                    className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/50 cursor-pointer hover-elevate"
                    onClick={() => {
                      setQuery(search.personName);
                      setLastSearchType("personality");
                      walletMutation.reset();
                      lookupMutation.mutate(search.personName);
                    }}
                    data-testid={`history-item-${search.id}`}
                  >
                    <span className="font-medium text-sm">{search.personName}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {search.investments.map((asset, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {typeof asset === "string" ? asset : `${asset.name} ${asset.percentage}%`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {walletHistoryQuery.data && walletHistoryQuery.data.length > 0 && (
          <Card data-testid="card-wallet-history">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                Recent Wallet Lookups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {walletHistoryQuery.data.slice(0, 5).map((search) => (
                  <div
                    key={search.id}
                    className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/50 cursor-pointer hover-elevate"
                    onClick={() => {
                      setQuery(search.address);
                      setLastSearchType("wallet");
                      lookupMutation.reset();
                      walletMutation.mutate(search.address);
                    }}
                    data-testid={`wallet-history-item-${search.id}`}
                  >
                    <span className="font-mono text-sm">{truncateAddress(search.address)}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {search.tokens.slice(0, 5).map((token, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {token.symbol}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      </div>

      {chatOpen && (
        <div
          className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl border bg-background shadow-xl flex flex-col"
          style={{ height: "480px" }}
          data-testid="chat-window"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Portfolio Assistant</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setChatOpen(false)}
              data-testid="button-close-chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-chat-empty">
                  <Bot className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="font-medium mb-1">Hi! I'm your portfolio assistant.</p>
                  <p>Try saying things like:</p>
                  <div className="mt-2 space-y-1 text-xs">
                    <p>"Add Solana at 15%"</p>
                    <p>"Remove Bitcoin"</p>
                    <p>"Rebalance equally"</p>
                    <p>"Set Ethereum to 50%"</p>
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`chat-message-${i}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.content}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-2 items-center" data-testid="chat-loading">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-3 py-2 border-t">
            <form
              onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}
              className="flex gap-2"
              data-testid="form-chat"
            >
              <Input
                data-testid="input-chat"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask to modify your portfolio..."
                className="text-sm"
                disabled={chatLoading}
              />
              <Button
                type="submit"
                size="sm"
                disabled={chatLoading || !chatInput.trim()}
                data-testid="button-send-chat"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
