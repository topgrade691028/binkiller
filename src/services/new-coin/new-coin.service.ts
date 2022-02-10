import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { EventEmitter2 } from 'eventemitter2';
import { AppEnvironment } from 'src/app.environment';
import { NewCoin } from 'src/models/new-coin';
import { BinanceArticle } from 'src/models/news';
import { BinanceService } from '../binance/binance.service';

@Injectable()
export class NewCoinService {
  data: NewCoin[] = [];

  URL_BINANCE_ARTICLE = 'https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query?catalogId=48&pageNo=1&pageSize=15';

  ETH_SCAN = key => `https://etherscan.io/searchHandler?term=${key}&filterby=0`;
  BSC_SCAN = key => `https://bscscan.com/searchHandler?term=${key}&filterby=0`;

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private readonly binanceService: BinanceService,
    private eventEmitter: EventEmitter2,
  ) { }

  start() {
    setTimeout(() => {
      this.getBinanceArticle();
    }, 5000);
    // this.getNewCoins();
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  getBinanceArticle() {
    axios.get(this.URL_BINANCE_ARTICLE)
      .then(({ data: { data: { articles } } }: { data: { data: { articles: BinanceArticle[] } } }) => {
        this.checkNewCoins(articles);
      });
  }

  getNewCoins() {
    const URL_BINANCE_ARTICLE = 'https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query?catalogId=48&pageNo=1&pageSize=200';
    axios.get(URL_BINANCE_ARTICLE)
      .then(({ data: { data: { articles } } }: { data: { data: { articles: BinanceArticle[] } } }) => {
        this.filterArticles(articles);
      });
  }

  @Cron('59 59 * * * *')
  buyNewCoin0() {
    this.buyNewCoin();
  }

  @Cron('59 29 * * * *')
  buyNewCoin30() {
    this.buyNewCoin();
  }

  buyNewCoin() {
    const { isRunSniper } = this.appEnvironment;
    if (!isRunSniper) return;

    const newCoins = this.data.filter(({ isExist }) => !isExist);
    if (!newCoins.length) return;

    this.eventEmitter.emit('binance.newcoin', newCoins);
  }

  @OnEvent('binance.newCoin.ordered')
  onNewCoinOrdered(newCoin: NewCoin) {
    console.log('onNewCoinOrdered', newCoin);
    const index = this.data.findIndex(({ symbol }) => (symbol == newCoin.symbol));
    if (index == -1) return;

    this.data[index].isExist = true;
  }

  checkNewCoins(articles: BinanceArticle[]) {
    articles.forEach(article => {
      const { title } = article;
      const foundTitle = title.match(/\([A-Z0-9]{3,10}\)/);
      if (!foundTitle) return;
      let symbol = foundTitle[0].replace(/\(|\)/g, '')
      symbol = `${symbol}USDT`;

      const strWillList = 'Will List';
      const willListPos = title.lastIndexOf(strWillList, foundTitle.index);
      if (willListPos == -1) return;
      const strFrom = title.indexOf(' ', willListPos + strWillList.length);
      const coinName = title.substring(strFrom + 1, foundTitle.index - 1);

      this.addNewCoin(symbol, coinName, article);
    });
  }

  addNewCoin(newCoin: string, coinName: string, article: BinanceArticle) {
    const isFound = this.data.find(({ symbol }) => (symbol == newCoin));
    if (isFound) return;

    const isExist = this.binanceService.prices[newCoin]
    const newCoinData: NewCoin = {
      title: coinName,
      symbol: newCoin,
      isExist: !!isExist,
      createdAt: Date.now()
    };
    this.data.push(newCoinData);
    this.eventEmitter.emit('binance.newCoin.added', {
      newCoin: newCoinData,
      article
    });
  }

  hasNewCoin() {
    const newCoins = this.data.filter(({ isExist }) => !isExist);
    return !!newCoins.length;
  }

  async filterArticles(articles: BinanceArticle[]) {
    const symbols = [];
    articles.forEach(article => {
      const { id, code, title } = article;
      const foundTitle = title.match(/\([A-Z0-9]{3,10}\)/);
      if (!foundTitle) return;
      const symbol = foundTitle[0].replace(/\(|\)/g, '')

      const strWillList = 'Will List';
      const willListPos = title.lastIndexOf(strWillList, foundTitle.index);
      if (willListPos == -1) return;
      const strFrom = title.indexOf(' ', willListPos + strWillList.length);
      const coinName = title.substring(strFrom + 1, foundTitle.index - 1);
      // console.log(symbol, `__${coinName}__`, title, willListPos);
      symbols.push({
        id,
        code,
        symbol,
        title: coinName,
      });
    });

    for (let i = 0; i < symbols.length; i++) {
      const { symbol, title } = symbols[i];
      // if (symbol != 'FIDA') continue;
      console.log(symbols[i]);

      const bscUrl = this.BSC_SCAN(title);
      const { data: bscData } = await axios.get(bscUrl);

      const ethUrl = this.ETH_SCAN(title);
      const { data: ethData } = await axios.get(ethUrl);

      const data = [bscData, ethData];
      const result = this.getContractAddress(symbols[i], data);
      if (!result) continue;
      const { index, address } = result;
      console.log(result);
      // return;
    }
  }

  getContractAddress(metadata: { symbol: string, title: string }, response: string[][]) {
    const { symbol, title } = metadata;
    let foundData: ({ data: string, index: number })[] = [];
    response.forEach((data, index) => {
      if (data.length == 0) return;
      data.forEach(item => {
        if (item.indexOf(`(${symbol})`) == -1) return;
        foundData.push({ data: item, index });
      });
    });
    if (!foundData.length) {
      console.log('UNKNOWN symbol', metadata);
      return null;
    }
    if (foundData.length >= 2) {
      for (let i = 0; i < foundData.length; i++) {
        const { data: item } = foundData[i];
        if (item.toLowerCase().indexOf(`${title.toLowerCase()} (${symbol.toLowerCase()})`) != -1) {
          foundData = [foundData[i]];
          break;
        }
      }
      if (foundData.length >= 2) {
        console.log('Undetermination', metadata, foundData);
        return null;
      }
    }
    const { data, index } = foundData[0];
    const startPos = data.indexOf('\t');
    if (startPos == -1) {
      console.log('Not able to parse address', metadata, foundData[0]);
      return;
    }
    const endPos = data.indexOf('\t', startPos + 1);
    if (endPos == -1) {
      console.log('Not able to parse address', metadata, foundData[0]);
      return;
    }

    const address = data.substring(startPos + 1, endPos);

    return {
      address,
      index,
    }
  }
}
