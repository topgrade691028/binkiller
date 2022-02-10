export enum BIDirection {
  LONG = 'long',
  SHORT = 'short'
}

export interface BISignal {
  id: string;

  symbol: string;

  direction: BIDirection;

  price: string;

  date: number;

  dailyProfit: number;

  rank: number;
}
