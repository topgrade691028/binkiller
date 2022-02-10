import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
} from '@nestjs/websockets';
import { AppEnvironment } from 'src/app.environment';
import { BinanceService } from 'src/services/binance/binance.service';

export interface MessageSetSymbol {
  symbol: string;
  secretKey: string;
}

@WebSocketGateway({ cors: true })
export class PriceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server;
  users = 0;
  clients = [];

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private readonly binanceService: BinanceService
  ) { }

  async handleConnection(client) {
    this.clients.push(client);
  }

  async handleDisconnect(client) {
    const index = this.clients.indexOf(client);
    if (index === -1) return;
    this.clients.splice(index, 1);
  }

  @SubscribeMessage('symbol')
  async onSetPrice(
    @MessageBody() { symbol, secretKey }: MessageSetSymbol) {
    const { frontendSecKey } = this.appEnvironment;
    if (secretKey != frontendSecKey) return;

    this.binanceService.setWatchSymbol(symbol);
  }

  @Cron(CronExpression.EVERY_SECOND)
  sendPrice() {
    this.clients.forEach(client => {
      try {
        const {
          watchSymbol,
          watchPrice
        } = this.binanceService;
        client.emit('price', { symbol: watchSymbol, price: watchPrice });
      } catch (e) {
        console.log(e);
      }
    })
  }

  @OnEvent('binance.newCoin.added')
  sendNewCoin(data) {
    this.clients.forEach(client => {
      try {
        client.emit('newcoin', data);
      } catch (e) {
        console.log(e);
      }
    })
  }
}
