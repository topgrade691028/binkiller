import * as cuid from 'cuid';
import * as moment from 'moment';
import { AppEnvironment } from 'src/app.environment';
import { BinanceService } from 'src/services/binance/binance.service';
import { LogService } from 'src/services/log/log.service';
import { TelegramService } from 'src/services/telegram/telegram.service';
import { BKSignal } from '../../models/bk-signal';
import { BncOrder, BncOrderStatus, BncOrderType } from '../../models/bnc-order';

export interface OrderProperty {
  getLeverage?: (signal: BKSignal) => number;

  getBuyPrice?: (signal: BKSignal, price: number) => number;

  getSellPrice?: (signal: BKSignal) => number;

  getStopLoss?: (signal: BKSignal, price: number, leverage: number, currentStopLoss: number) => number;
}

export interface BaseAmount {
  signalId?: number | string;
  symbol: string;
  from: number;
  to?: number;
  start?: string;
  finish?: string;
}

export class BaseStrategy {

  public BUY_ORDER_LIFETIME = 24 * 60 * 60 * 1000;
  orders: Record<number, BncOrder> = {};

  constructor(
    public readonly strategyId: string,
    private readonly orderProperty: OrderProperty,
    private readonly appEnvironment: AppEnvironment,
    private readonly logService: LogService,
    private readonly binanceService: BinanceService,
    private readonly telegramService: TelegramService
  ) { }

  onNewSignal(signal: BKSignal) {
    const hasSameOrder = this.cancelOldSameOrders(signal);
    if (hasSameOrder) return;

    const id = cuid();
    const { prices } = this.binanceService
    const {
      signalId,
      coin
    } = signal;
    const price = prices[coin]
    const leverage = this.getLeverage(signal);
    const newOrder: BncOrder = {
      id,
      signalId: signalId,
      coin: coin,
      type: BncOrderType.buy,
      price: this.getBuyPrice(signal, price),
      lifeTime: Date.now() + this.BUY_ORDER_LIFETIME,
      leverage,
      status: BncOrderStatus.active,
      createdAt: Date.now()
    };

    this.logService.log(this.strategyId, `New Buy Order #${id} is created.`, newOrder);
    this.orders[id] = newOrder;
  }

  cancelOldSameOrders(signal: BKSignal) {
    Object.values(this.orders)
      .filter(({ coin, status, type }) =>
        coin == signal.coin
        && status == BncOrderStatus.active
        && type == BncOrderType.buy)
      .forEach(order => order.status = BncOrderStatus.cancelled);

    const oldSellOrders = Object.values(this.orders)
      .filter(({ coin, status, type }) =>
        coin == signal.coin
        && status == BncOrderStatus.active
        && type == BncOrderType.sell)
    return !!oldSellOrders.length
  }

  getLeverage(signal: BKSignal) {
    try {
      if (this.orderProperty && this.orderProperty.getLeverage)
        return this.orderProperty.getLeverage(signal);
    } catch (e) { console.log(this.strategyId, 'getLeverage', signal, e) }

    return 1;
  }

  getBuyPrice(signal: BKSignal, price: number) {
    try {
      if (this.orderProperty && this.orderProperty.getBuyPrice)
        return this.orderProperty.getBuyPrice(signal, price);
    } catch (e) { console.log(this.strategyId, 'getBuyPrice', signal, e) }

    return signal.ote;
  }

  getSellPrice(signal: BKSignal) {
    try {
      if (this.orderProperty && this.orderProperty.getSellPrice)
        return this.orderProperty.getSellPrice(signal);
    } catch (e) { console.log(this.strategyId, 'getSellPrice', signal, e) }

    const { short } = signal.terms;
    if (short.length == 0) return signal.terms.mid[0];
    return short[short.length - 1];
  }

  getStopLoss(signal: BKSignal, price: number, leverage: number, currentStopLoss: number) {
    let newStopLoss = 0
    try {
      if (this.orderProperty && this.orderProperty.getStopLoss)
        newStopLoss = this.orderProperty.getStopLoss(signal, price, leverage, currentStopLoss);
    } catch (e) { console.log(this.strategyId, 'getStopLoss', signal, e) }

    const { stopLoss } = signal;
    let limit = 0;
    if (currentStopLoss == 0) limit = price * (1 - 1 / leverage / 2);
    return Math.max(newStopLoss, stopLoss, limit, currentStopLoss);
  }

  onUpdatePrices(prices: Record<string, number>) {
    this.updateBuyOrders(prices);
    this.updateSellOrders(prices);
    this.disableOldOrders();
  }

  updateBuyOrders(prices: Record<string, number>) {
    const orders = Object.values(this.orders).filter(({ status, type }) => status == BncOrderStatus.active && type == BncOrderType.buy);

    orders.forEach((order, index) => {
      const {
        id,
        coin,
        price: targetPrice
      } = order;
      const curPrice = prices[coin];
      if (!curPrice) return;

      if (targetPrice < curPrice) return;

      // If price is smaller than target price
      order.status = BncOrderStatus.processed;

      const {
        signalId,
        leverage
      } = order;
      const signal = this.telegramService.signals[signalId];
      const newOrderId = cuid();
      const newOrder: BncOrder = {
        ...order,
        id: newOrderId,
        refOrderId: id,
        type: BncOrderType.sell,
        price: this.getSellPrice(signal),
        stopLoss: this.getStopLoss(signal, targetPrice, leverage, 0),
        lifeTime: -1,
        status: BncOrderStatus.active,
        createdAt: Date.now()
      };

      this.orders[newOrderId] = newOrder;

      this.logService.log(this.strategyId, `Buy Order #${id} is completed.`, order);
      this.logService.log(this.strategyId, `New sell Order #${newOrderId} is created.`, newOrder);
    })
  }

  updateSellOrders(prices: Record<string, number>) {
    const orders = Object.values(this.orders).filter(({ status, type }) => status == BncOrderStatus.active && type == BncOrderType.sell);

    orders.forEach(order => {
      const {
        id,
        signalId,
        coin,
        price: targetPrice,
        leverage,
        stopLoss
      } = order;
      const curPrice = prices[coin];
      if (!curPrice) return;

      const signal = this.telegramService.signals[signalId];
      if (!signal) return;
      const newStopLoss = this.getStopLoss(signal, curPrice, leverage, stopLoss);
      if (newStopLoss != stopLoss) {
        this.logService.log(this.strategyId, `Sell Order #${id}: Stop Loss is changed. ${stopLoss} => ${newStopLoss} [ price: ${curPrice} ]`);
        order.stopLoss = newStopLoss;
      }

      if (targetPrice < curPrice
        || newStopLoss > curPrice) {
        // If price is bigger than target price, or price get smaller than stopLoss.
        if (newStopLoss > curPrice) {
          order.status = BncOrderStatus.stopLess;
        } else {
          order.status = BncOrderStatus.processed;
        }

        order.closedAt = Date.now();
        this.logService.log(this.strategyId, `Sell Order #${id} is completed.`, order);
      }
    })
  }

  disableOldOrders() {
    const now = Date.now();
    const orders = Object.values(this.orders)
      .filter(({ status, lifeTime, type }) =>
        status == BncOrderStatus.active
        && type == BncOrderType.buy
        && lifeTime != -1
        && lifeTime < now);

    orders.forEach(order => {
      order.status = BncOrderStatus.timeout;
      order.closedAt = Date.now();
      this.logService.log(this.strategyId, `Buy Order #${order.id} is up to life time.`, order);
    });
  }

  getBalances(
    primaryUsdt: number,
    buyAmount: number,
    excepts: string[],
    days: number
  ) {
    const {
      timezoneOffset,
      dateTimeFormat
    } = this.appEnvironment;
    const balances = {
      SPOT: primaryUsdt,
      LOAN: 0
    };
    const { prices } = this.binanceService;
    const usdts = {};
    const amounts: Record<number | string, BaseAmount> = {};
    const limitDate = Date.now() - days * 60 * 60 * 24 * 1000;

    Object.values(this.orders)
    .sort((a, b) => {
      const date1 = a.type === BncOrderType.buy ? a.createdAt : a.closedAt;
      const date2 = b.type === BncOrderType.buy ? b.createdAt : b.closedAt;
      if (date1 > date2) return 1;
      if (date1 == date2) return 0;
      return -1;
    })
    .forEach((order, index) => {
      const {
        coin,
        price,
        stopLoss,
        leverage,
        type,
        status,
        signalId,
        createdAt,
        closedAt
      } = order;
      if (createdAt < limitDate) return;
      if (excepts.includes(coin)) return;
      if (!balances[coin]) balances[coin] = 0;
      if (
        status != BncOrderStatus.processed
        && status != BncOrderStatus.stopLess) return;

      if (type == BncOrderType.buy) {
        const amount = this.calculateBuyAmount(balances.SPOT, buyAmount);
        balances.SPOT -= amount;
        balances.LOAN += amount * (leverage - 1);
        balances[coin] += amount * leverage / price;
        amounts[signalId] = {
          symbol: coin,
          from: amount,
          start: moment(createdAt).utcOffset(timezoneOffset).format(dateTimeFormat),
        };
      } else if (amounts[signalId]) {
        let sellPrice = price;
        if (status == BncOrderStatus.stopLess) sellPrice = stopLoss;

        const amount = amounts[signalId].from;
        const newAmount = (balances[coin] * sellPrice) - (amount * (leverage - 1));
        balances.SPOT += newAmount;
        balances.LOAN -= amount * (leverage - 1);
        balances[coin] = 0;
        amounts[signalId] = {
          ...amounts[signalId],
          finish: moment(closedAt).utcOffset(timezoneOffset).format(dateTimeFormat),
          to: newAmount,
        };
      }
    });

    let totalBalance = balances.SPOT - balances.LOAN;
    for (const coin in balances) {
      const price = prices[coin];
      if (!price) continue;
      if (balances[coin] == 0) {
        delete balances[coin];
        continue;
      }
      totalBalance += price * balances[coin];
      usdts[coin] = price * balances[coin];
    }

    return {
      total: {
        TOTAL: totalBalance,
        SPOT: balances.SPOT,
        LOAN: balances.LOAN,
      },
      USDT: usdts,
      coins: balances,
      amounts
    };
  }

  calculateBuyAmount(balance, amount) {
    if (amount > 1) return Math.min(balance, amount);
    return balance * amount;
  }
}
