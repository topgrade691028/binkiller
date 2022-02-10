export interface BKSignalTerms {
  short: number[];

  mid: number[];

  long: number[];
}

export interface BNDailyStats {
  BTCUSDT: number;

  [x: string]: number;
}

export interface BKSignal {
  signalId: number | string;

  coin: string;

  direction: string;

  leverage: number[];

  entry: number[];

  ote: number;

  terms: BKSignalTerms;

  stopLoss: number;

  createdAt: number;

  dailyStats?: BNDailyStats;
}
