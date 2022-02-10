export enum NewsSource {
  Binance = 'Binance'
}

export interface News {
  id: string;
  from: NewsSource;
  title: string;
  data: any;
  createdAt: number;
}

export interface BinanceArticle {
  id: number;
  code: string;
  title: string;
}
