import * as moment from 'moment';
import { Controller, Get, Header, HttpCode, Param, Res } from '@nestjs/common';
import { BinanceService } from './services/binance/binance.service';
import { LogService } from './services/log/log.service';
import { StorageService } from './services/storage/storage.service';
import { StrategyService } from './services/strategy/strategy.service';
import { TelegramService } from './services/telegram/telegram.service';
import { BotService } from './services/bot/bot.service';
import { AppEnvironment } from './app.environment';
import { AppService } from './app.service';
import { NewsService } from './services/news/news.service';
import { NewCoinService } from './services/new-coin/new-coin.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly appEnvironment: AppEnvironment,
    private readonly binanceService: BinanceService,
    private readonly telegramService: TelegramService,
    private readonly logService: LogService,
    private readonly storageService: StorageService,
    private readonly strategyService: StrategyService,
    private readonly botService: BotService,
    private readonly newsService: NewsService,
    private readonly newCoinService: NewCoinService
  ) {
    setTimeout(() => this.startController(), 1000);
  }

  startController() {
    this.strategyService.createStrategy();
    this.storageService.load();
    this.binanceService.start();
    setTimeout(() => {
      this.telegramService.start();
    }, 2000);

    this.newsService.start();
    this.newCoinService.start();
  }

  @Get('name')
  serverName() {
    return this.appEnvironment.serverName;
  }

  @Get('tg/start')
  tgAuth() {
    return this.telegramService.start();
  }

  @Get('tg/verify/:code')
  tgVerify(
    @Param('code') code: string
  ) {
    return this.telegramService.verifyCode(code);
  }

  @Get('logs')
  @HttpCode(201)
  @Header('Content-Type', '	text/html')
  getLogs(@Res() res) {
    const { filePath } = this.logService;
    this.logService.streamLog(filePath, res);
  }

  @Get('blogs')
  @HttpCode(201)
  @Header('Content-Type', '	text/html')
  getBotLogs(@Res() res) {
    const { bFilePath: filePath } = this.logService;
    this.logService.streamLog(filePath, res);
  }

  @Get('mlogs')
  @HttpCode(201)
  @Header('Content-Type', '	text/html')
  getMessageLogs(@Res() res) {
    const { mFilePath: filePath } = this.logService;
    this.logService.streamLog(filePath, res);
  }

  @Get('bilogs')
  @HttpCode(201)
  @Header('Content-Type', '	text/html')
  getIndicatorLogs(@Res() res) {
    const { biFilePath: filePath } = this.logService;
    this.logService.streamLog(filePath, res);
  }

  @Get('signals')
  getSignals() {
    const {
      timezoneOffset,
      dateTimeFormat
    } = this.appEnvironment;
    const signals = Object.values(this.telegramService.signals)
      .sort((a, b) => {
        if (a.createdAt < b.createdAt) return 1;
        if (a.createdAt == b.createdAt) return 0;
        return -1;
      })
      .map(signal => ({
        ...signal,
        createdDate: moment(signal.createdAt)
          .utcOffset(timezoneOffset)
          .format(dateTimeFormat)
      }));
    return this.jsonBeautify(signals);
  }

  @Get('prices')
  getPrices() {
    return this.jsonBeautify(this.binanceService.prices);
  }

  @Get('orders')
  getOrders() {
    const data = this.strategyService.getData()
    return this.jsonBeautify(data);
  }

  @Get('borders')
  getBotOrders() {
    return this.jsonBeautify(this.botService.orders);
  }

  @Get('balances')
  async getDefaultBalances() {
    const total = await this.binanceService.getUsdtBalance();
    const { ratioTradeOnce } = this.appEnvironment;
    const exceptCoins = [];
    const data = this.strategyService.getBalances(total, ratioTradeOnce, exceptCoins, 30);
    return this.jsonBeautify(data);
  }

  @Get('balances/:days')
  async getDefaultBalancesByDays(
    @Param('days') days: number) {
    const total = await this.binanceService.getUsdtBalance();
    const { ratioTradeOnce } = this.appEnvironment;
    const exceptCoins = [];
    const data = this.strategyService.getBalances(total, ratioTradeOnce, exceptCoins, days);
    return this.jsonBeautify(data);
  }

  @Get('balances/:total/:buyOnce')
  getBalances(
    @Param('total') total: number,
    @Param('buyOnce') buyOnce: number
  ) {
    const exceptCoins = [];
    const data = this.strategyService.getBalances(total, buyOnce, exceptCoins, 30);
    return this.jsonBeautify(data);
  }

  @Get('balances/:total/:buyOnce/:exceptCoins')
  getBalancesWithExcepts(
    @Param('total') total: number,
    @Param('buyOnce') buyOnce: number,
    @Param('exceptCoins') _exceptCoins: string
  ) {
    const exceptCoins = _exceptCoins.split(',');
    const data = this.strategyService.getBalances(total, buyOnce, exceptCoins, 30);
    return this.jsonBeautify(data);
  }

  @Get('save')
  saveStorage() {
    return this.storageService.save();
  }

  @Get('remove/:signalId')
  removeSignal(
    @Param('signalId') signalId: string
  ) {
    this.strategyService.removeSignal(signalId);
    return 'Success';
  }

  jsonBeautify(data) {
    return JSON.stringify(data, null, 2);
  }
}
