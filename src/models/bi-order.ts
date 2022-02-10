import { OrderSide } from "binance-api-node";

export interface BIOrder {
  signalId: string;
  side: OrderSide;
}

export interface TradingPair {
  symbol: string;
  lastUsedAt: number;
}
