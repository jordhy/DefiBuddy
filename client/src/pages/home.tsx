import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, TrendingUp, History, Loader2, Wallet, DollarSign, Link2, Copy, Briefcase, X, MessageCircle, Send, Bot, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CryptoLookupResponse, WalletLookupResponse, WalletToken, CryptoInvestment } from "@shared/schema";

type PortfolioItem = { name: string; symbol?: string; percentage: number };
type Portfolio = { source: string; items: PortfolioItem[] };
type ChatMessage = { role: "user" | "assistant"; content: string };

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
  const { toast } = useToast();

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
    <div className="min-h-screen flex items-start justify-center p-4 pt-16 md:pt-24">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={connectWallet}
        disabled={isConnecting || isPending}
        data-testid="button-connect-wallet"
        className="fixed top-4 left-4 z-50 gap-1.5 shadow-sm"
      >
        {isConnecting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : connectedAddress ? (
          <Link2 className="h-3 w-3" />
        ) : (
          <Wallet className="h-3 w-3" />
        )}
        {connectedAddress ? `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}` : "Connect Wallet"}
      </Button>

      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">DefiBuddy</h1>
          </div>
          <p className="text-muted-foreground" data-testid="text-page-subtitle">
            Enter a name or Ethereum address to look up crypto holdings
          </p>
          <Dialog open={portfolioOpen} onOpenChange={setPortfolioOpen}>
            <DialogTrigger asChild>
              <Button
                variant={portfolio ? "default" : "outline"}
                size="sm"
                className="mt-2 gap-1.5"
                data-testid="button-my-portfolio"
              >
                <Briefcase className="h-4 w-4" />
                My Portfolio
                {portfolio && (
                  <Badge variant="secondary" className="ml-1 text-xs no-default-active-elevate">{portfolio.items.length}</Badge>
                )}
              </Button>
            </DialogTrigger>
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    data-testid="button-clear-portfolio"
                    onClick={() => {
                      setPortfolio(null);
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
        </div>

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
            </CardHeader>
            <CardContent>
              {lookupMutation.data.investments.length > 0 ? (
                <ol className="space-y-2">
                  {lookupMutation.data.investments.map((asset, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
                      data-testid={`item-asset-${index}`}
                    >
                      <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {index + 1}
                      </span>
                      <span className="font-medium flex-1">{asset.name}</span>
                      <Badge variant="secondary" className="text-xs font-semibold">{asset.percentage}%</Badge>
                    </li>
                  ))}
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
            </CardHeader>
            <CardContent>
              {walletMutation.data.tokens.length > 0 ? (
                <ol className="space-y-2">
                  {walletMutation.data.tokens.map((token, index) => (
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
                          <Badge variant="secondary" className="text-xs font-semibold shrink-0">{token.percentage}%</Badge>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm" data-testid="text-no-wallet-results">
                  No tokens found for this address.
                </p>
              )}
            </CardContent>
          </Card>
        )}

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

      {chatOpen && (
        <div
          className="fixed bottom-20 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl border bg-background shadow-xl flex flex-col"
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

      <Button
        className="fixed bottom-4 right-4 z-50 rounded-full shadow-lg gap-2 px-4 h-12"
        onClick={() => setChatOpen(!chatOpen)}
        data-testid="button-toggle-chat"
      >
        {chatOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        <span className="text-sm font-medium">AI Buddy</span>
      </Button>
    </div>
  );
}
