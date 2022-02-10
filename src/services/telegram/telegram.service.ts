// import * as moment from 'moment';
import { Injectable } from '@nestjs/common';
import * as MTProto from '@mtproto/core';
import * as prompts from 'prompts';
import { EventEmitter2 } from 'eventemitter2';
import { AppEnvironment } from 'src/app.environment';
import { BKSignal } from '../../models/bk-signal';
import { LogService } from '../log/log.service';
import { BinanceService } from '../binance/binance.service';
import { VipMessage } from 'src/libs/message/vip.msg';
import { CornixMessage } from 'src/libs/message/cornix.msg';

@Injectable()
export class TelegramService {
  mtproto: MTProto;
  phoneCodeHash: string;

  vipMsgParser: VipMessage = new VipMessage();
  cornixMsgParser: CornixMessage = new CornixMessage();

  public _signals: Record<number | string, BKSignal> = {};
  lastSymbol: string = null;

  constructor(
    private eventEmitter: EventEmitter2,
    private readonly logService: LogService,
    private readonly binanceService: BinanceService,
    private readonly appEnvironment: AppEnvironment,
  ) { }

  start() {
    const {
      tgAppId,
      tgApiHash,
      tgDcId,
      phoneNumber,
      logFileDir } = this.appEnvironment;
    this.mtproto = new MTProto({
      api_id: tgAppId,
      api_hash: tgApiHash,

      storageOptions: {
        path: `${logFileDir}/tgAuth.json`,
      },
    });
    this.mtproto.setDefaultDc(tgDcId);


    this.mtproto
      .call('users.getFullUser', {
        id: {
          _: 'inputUserSelf',
        },
      })
      .then((result) => {
        console.log('Telegram GetFull User', result.user.username)
        this.startListener();
      })
      .catch(error => {
        console.log('Telegram Error', error)
        this.startAuth(phoneNumber);
      })

    const isProcess = true;
    // const isProcess = false;
    if (isProcess) {
      // this.processVipMessage({
      //   peer_id: { _: 'peerChannel', channel_id: 1178421859 },
      //   date: 1631370197,
      //   message: '📍SIGNAL ID: 0424📍\n' +
      //     'COIN: $FIL/USDT (3-5x)\n' +
      //     'Direction: LONG📈\n' +
      //     '➖➖➖➖➖➖➖\n' +
      //     "Broke out of its descending trend-line and confirmed one of our most important mid term fibs as support, we're in for a ride Killers😘\n" +
      //     '\n' +
      //     'ENTRY: 81 - 84.5\n' +
      //     'OTE: 82.77\n' +
      //     '\n' +
      //     'TARGETS\n' +
      //     'Short Term: 85.50 - 86.5 - 88 - 90\n' +
      //     'Mid Term: 94 - 100 - 110 - 120\n' +
      //     'Long Term: 135 - 150\n' +
      //     '\n' +
      //     'STOP LOSS: 75.67\n' +
      //     '➖➖➖➖➖➖➖\n' +
      //     'This message cannot be forwarded or replicated\n' +
      //     '- Binance Killers®',
      // });
      // this.processMessage('COIN: $BTC/USDT\nDirection: LONG\nExchange: Binance Futures\nLeverage: 5x\n\nENTRY: 41,180 - 42,221 - 42,900\n\nTARGETS: 43,200 - 43,600 - 44,100 - 44,800 - 45,800 - 47,000 - 49,000 - 52,000 - 55,000 - 59,300 \n\nSTOP LOSS: 39,358', this.cornixMsgParser);
    }
  }

  get signals() {
    return this._signals;
  }

  set signals(data) {
    this._signals = data;
  }

  async getPhone() {
    return (await prompts({
      type: 'text',
      name: 'phone',
      message: 'Enter your phone number:'
    })).phone
  }

  async getCode() {
    // you can implement your code fetching strategy here
    return (await prompts({
      type: 'text',
      name: 'code',
      message: 'Enter the code sent:',
    })).code
  }

  async getPassword() {
    return (await prompts({
      type: 'text',
      name: 'password',
      message: 'Enter Password:',
    })).password
  }

  async startAuth(phone_number) {
    console.log('[+] You must log in')
    // if (!phone_number) phone_number = await this.getPhone()

    this.mtproto.call('auth.sendCode', {
      phone_number: phone_number,
      settings: {
        _: 'codeSettings',
      },
    })
      .catch(error => {
        console.log('SEND CODE ERROR', error);
        if (error.error_message.includes('_MIGRATE_')) {
          const [type, nextDcId] = error.error_message.split('_MIGRATE_');

          this.mtproto.setDefaultDc(+nextDcId);

          return this.mtproto.call('auth.sendCode', {
            phone_number: phone_number,
            settings: {
              _: 'codeSettings',
            },
          })
        }
      })
      .then(async result => {
        console.log('Send Code', result)
        this.phoneCodeHash = result.phone_code_hash;
      })
  }

  async verifyCode(code) {
    this.mtproto.call('auth.signIn', {
      phone_code: code,
      phone_number: this.appEnvironment.phoneNumber,
      phone_code_hash: this.phoneCodeHash,
    }).then(result => {
      console.log('[+] successfully authenticated', result);
      // start listener since the user has logged in now
      this.startListener()
    }).catch(error => {
      console.log('auth.signIn ERROR', error);
    });
  }


  isDowning(data) {
    const { terms } = data;
    return terms.short[0] > terms.short[1];
  }

  startListener = () => {
    console.log('[+] starting listener')
    this.mtproto.updates.on('updates', ({ updates }) => {
      const newChannelMessages = updates.filter((update) => update._ === 'updateNewChannelMessage').map(({ message }) => message) // filter `updateNewChannelMessage` types only and extract the 'message' object

      console.log(updates, '\n\n');
      if (newChannelMessages.length == 0) return;
      const message = newChannelMessages[0];
      if (!message) return;

      const { tgCornixId, tgVipId } = this.appEnvironment;
      const { peer_id: { channel_id = 0 } = {} } = message;
      console.log('peer_id', message.peer_id, '\n\n\n');
      if (channel_id != tgCornixId
        && channel_id != tgVipId) return;

      const { reply_to = null, message: msgContent } = message;
      const parser = channel_id == this.appEnvironment.tgCornixId ? this.cornixMsgParser : this.vipMsgParser;
      this.logService.mlog(parser.name, msgContent);
      if (reply_to) return;

      try {
        this.processMessage(msgContent, parser);

        // const date = moment().utcOffset(-5).format('YYYY-MM-DD HH:mm:ss');
        // console.log(date, message.message);
      } catch (e) {
        this.logService.log('PROCESSING MESSAGE ERROR', e);
      }
    });
  }

  processMessage(message: string, parser: VipMessage | CornixMessage) {
    const signalData = parser.parse(message);
    const {
      signalId,
      coin: symbol
    } = signalData;

    this.logService.mlog(parser.name, this.binanceService.prices[symbol], signalData);
    if (this.lastSymbol == symbol) {
      this.logService.mlog('Duplicated signal');
      return;
    }
    if (!symbol.endsWith('USDT')) {
      this.logService.mlog('Non-USDT is not supported');
      return;
    }
    this.lastSymbol = symbol;
    const dailyStats = this.binanceService.getDailyStats(symbol);
    signalData.dailyStats = dailyStats;

    if (!this.verifySignalData(signalData)) return;
    this._signals[signalId] = signalData;
    this.eventEmitter.emit('telegram.onSignal', signalData);

    return signalData;
  }

  verifySignalData(signal: BKSignal) {
    const {
      entry,
      terms,
    } = signal;
    const maxEntry = Math.max(...entry);
    const minShortTerm = Math.min(...terms.short);
    if (maxEntry > minShortTerm) {
      this.logService.mlog('Falling-down is not supported');
      return false;
    }
    return true;
  }
}
