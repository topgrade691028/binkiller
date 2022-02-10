import { OrderSide, OrderStatus_LT } from "binance-api-node";

export enum BncOrderType {
  buy = 0,
  sell = 1,
}

export enum BncOrderStatus {
  active = 0,

  processed = 1,

  stopLess = 2,

  timeout = 3,

  cancelled = 4
}

export interface BncOrder {
  id: string;

  refOrderId?: string;

  signalId: number | string;

  // signal: BKSignal;

  coin: string;

  type: BncOrderType;

  price: number;

  // amount: number; // Buy: USDT, Sell: Coin

  stopLoss?: number;

  lifeTime?: number;

  leverage: number;

  status: BncOrderStatus;

  createdAt: number;

  closedAt?: number;
}

export interface BotOrder {
  orderId: number;
  symbol: string;
  isIsolated: "TRUE" | "FALSE" | boolean;
  side: OrderSide;
  status: OrderStatus_LT;

  signalId: number | string;
  order: BncOrder;
  target?: number;
  strategy?: string;
}