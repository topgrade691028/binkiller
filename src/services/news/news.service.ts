import axios from 'axios';
import { Injectable } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sleep } from 'src/utils';
import { BinanceArticle, News, NewsSource } from 'src/models/news';

@Injectable()
export class NewsService {
  data: News[] = [];

  URL_BINANCE_ARTICLE = 'https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query?catalogId=48&pageNo=1&pageSize=15';
  URL_BINANCE_ARTICLE_ITEM = 'https://www.binance.com/en/support/announcement';

  constructor(
    private readonly appEnvironment: AppEnvironment
  ) {
  }

  start() {
    this.getBinanceArticle();
  }

  @Cron(CronExpression.EVERY_HOUR)
  getBinanceArticle() {
    axios.get(this.URL_BINANCE_ARTICLE)
      .then(({ data: { data: { articles } } }: { data: { data: { articles: BinanceArticle[] } } }) => {
        this.setBinanceArticles(articles);
      });
  }

  getDataFromBinanceArticle(content: string) {
    let position = null;
    const data = [];

    while (true) {
      position = content.match(/[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} \(UTC\)/);
      if (!position) break;

      const date = position[0];
      if (data.indexOf(date) == -1) data.push(date);
      content = content.substr(position.index + date.length, content.length);
    }
    return data;
  }

  getBinanceArticleItem(code: string) {
    return new Promise((resolve, reject) => {
      axios.get(`${this.URL_BINANCE_ARTICLE_ITEM}/${code}`)
        .then(({ data: content }: { data: string }) => {
          const data = this.getDataFromBinanceArticle(content);
          resolve(data);
        }).catch(error => reject(error));
    })
  }

  async setBinanceArticles(articles: BinanceArticle[]) {
    await Promise.all(articles.reverse().map(async (article, index) => {
      const { code, title } = article;
      const foundArticle = this.data.find(({ id, from }) => (id == code && from == NewsSource.Binance));
      if (foundArticle) return;

      const newArticle: News = {
        id: code,
        from: NewsSource.Binance,
        title,
        data: [],
        createdAt: Date.now()
      }
      this.data.push(newArticle);

      await sleep(index * 500);
      try {
        const data = await this.getBinanceArticleItem(code);
        newArticle.data = data;
      } catch (e) {
        console.log(e);
      }
    }));
  }
}
