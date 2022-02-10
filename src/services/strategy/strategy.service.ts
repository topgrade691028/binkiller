import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BaseStrategy, OrderProperty } from 'src/libs/strategy/base-strategy';
import { BinanceService } from '../binance/binance.service';
import { LogService } from '../log/log.service';
import { BKSignal } from '../../models/bk-signal';
import { BncOrder } from 'src/models/bnc-order';
import { TelegramService } from '../telegram/telegram.service';
import { AppEnvironment } from 'src/app.environment';

@Injectable()
export class StrategyService {
  strategyProps: string[][] = [];
  strategyKeys: string[] = [];
  strategies: Record<string, BaseStrategy> = {};

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private readonly logService: LogService,
    private readonly binanceService: BinanceService,
    private readonly telegramService: TelegramService
  ) { }


  combineProps(prevKey, propIndex): string[] {
    if (propIndex == this.strategyProps.length - 1) {
      return this.strategyProps[propIndex].map(prop => (`${prevKey}-${prop}`))
    }

    const keys = [];
    this.strategyProps[propIndex].forEach(prop => {
      const newKey = propIndex == 0 ? prop : `${prevKey}-${prop}`;
      const newKeys = this.combineProps(newKey, propIndex + 1);
      keys.push(...newKeys);
    });
    return keys;
  }

  createStrategy() {
    this.strategyProps = [
      [
        "urgentbuy",
        "otebuy",
        "minentrybuy"
      ],
      [
        "shortest",
        "shortmax",
        "midest",
        "midmax",
        "longest"
      ],
      [
        "orgstop",
        "minentrystop",
        "dynamicstop"
      ],
      [
        "highleverage",
        "normalleverage",
        "noleverage"
      ]
    ];

    this.strategyKeys = this.combineProps('', 0);

    this.strategyKeys.forEach(method => {
      const property: OrderProperty = {};

      if (method.indexOf('urgentbuy') >= 0) property.getBuyPrice = (signal, price) => price;
      if (method.indexOf('otebuy') >= 0) property.getBuyPrice = (signal, price) => signal.ote;
      if (method.indexOf('minentrybuy') >= 0) property.getBuyPrice = (signal, price) => Math.min(...signal.entry);

      if (method.indexOf('shortest') >= 0) property.getSellPrice = (signal) => signal.terms.short[0];
      if (method.indexOf('shortmax') >= 0) property.getSellPrice = (signal) => Math.max(...signal.terms.short);
      if (method.indexOf('midest') >= 0) property.getSellPrice = (signal) => Math.max(...signal.terms.short, Math.min(...signal.terms.mid));
      if (method.indexOf('midmax') >= 0) property.getSellPrice = (signal) => Math.max(...signal.terms.mid);
      if (method.indexOf('longest') >= 0) property.getSellPrice = (signal) => Math.max(...signal.terms.mid, ...signal.terms.long);

      if (method.indexOf('orgstop') >= 0) property.getStopLoss = (signal, price, leverage, currentStopLoss) => signal.stopLoss;
      if (method.indexOf('minentrystop') >= 0) property.getStopLoss = (signal, price, leverage, currentStopLoss) => Math.min(...signal.entry) * 0.99;
      if (method.indexOf('dynamicstop') >= 0) property.getStopLoss = this.getDynamicStopLoss;

      if (method.indexOf('highleverage') >= 0) property.getLeverage = (signal) => Math.max(...signal.leverage);
      if (method.indexOf('normalleverage') >= 0) property.getLeverage = (signal) => Math.min(...signal.leverage);
      if (method.indexOf('noleverage') >= 0) property.getLeverage = (signal) => 1;

      this.strategies[method] = new BaseStrategy(
        method,
        property,
        this.appEnvironment,
        this.logService,
        this.binanceService,
        this.telegramService
      );
    });
  }

  getDynamicStopLoss(signal: BKSignal, price: number, leverage: number, currentStopLoss: number) {
    const entryStop = Math.min(...signal.entry) * 0.99;
    const terms = [
      ...signal.terms.short,
      ...signal.terms.mid,
      ...signal.terms.long,
    ]
    const points = [
      signal.stopLoss,
      signal.stopLoss,
      ...terms
    ];
    for (let i = 2; i < points.length; i++) {
      const point = points[i];
      if (point > price) return points[i - 2];
    }
    return entryStop;
  }

  @OnEvent('telegram.onSignal')
  onNewSignal(signal: BKSignal) {
    if (signal.terms.short[0] != Math.min(...signal.terms.short)) {
      this.logService.log('Falling with margin is not supported yet.');
      return;
    }
    Object.values(this.strategies).forEach(strategy => strategy.onNewSignal(signal));

    const { prices } = this.binanceService;
    Object.values(this.strategies).forEach(strategy => strategy.onUpdatePrices(prices));
  }

  @OnEvent('binance.onUpdatePrices')
  onUpdatePrices(prices: Record<string, number>) {
    Object.values(this.strategies).forEach(strategy => strategy.onUpdatePrices(prices));
  }

  getBalances(total: number, amountBuyOnce: number, excepts: string[], days: number) {
    return Object.values(this.strategies).map(strategy => {
      const { strategyId } = strategy;
      const balances = strategy.getBalances(total, amountBuyOnce, excepts, days);
      return {
        strategyId,
        ...balances
      };
    }).sort(({ total: { TOTAL: a } }, { total: { TOTAL: b } }) => {
      if (a > b) return -1;
      if (a < b) return 1;
      return 0;
    });
  }

  getData() {
    const data = {};
    for (const strategyId in this.strategies) {
      if (!this.strategies[strategyId]) continue;
      data[strategyId] = this.strategies[strategyId].orders
    }
    return data;
  }

  setData(data: Record<string, Record<number, BncOrder>>) {
    for (const strategyId in data) {
      if (!this.strategies[strategyId]) continue;
      this.strategies[strategyId].orders = data[strategyId]
    }
  }

  removeSignal(_signalId) {
    return Object.values(this.strategies).map(strategy => {
      const { orders } = strategy;
      for (const orderId in orders) {
        const {signalId} = orders[orderId];
        if (signalId == _signalId) delete orders[orderId];
      }
    });
  }
}
