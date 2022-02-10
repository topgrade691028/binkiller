import * as fs from 'fs';
import * as moment from 'moment';
import { Injectable } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';

export interface Log {
  data,
  createdAt: Date
}

@Injectable()
export class LogService {
  filePath = '';
  bFilePath = '';
  mFilePath = '';
  biFilePath = '';

  constructor(
    private readonly appEnvironment: AppEnvironment
  ) {
    const { logFileDir } = this.appEnvironment;
    this.filePath = `${logFileDir}/logs.txt`;
    this.bFilePath = `${logFileDir}/bot_logs.txt`;
    this.mFilePath = `${logFileDir}/msg_logs.txt`;
    this.biFilePath = `${logFileDir}/bi_signals.txt`;
  }

  getMessage(msg) {
    const {
      timezoneOffset,
      dateTimeFormat } = this.appEnvironment;
    const date = moment().utcOffset(timezoneOffset).format(dateTimeFormat);

    const messages = msg.map(value => {
      if (typeof value === 'string') return value;
      if (typeof value === 'object') return JSON.stringify(value, null, 2);
      return value;
    }).join('  \n  ');
    const data = `${date}  ${messages}\n\n`;
    return data;
  }

  log(...msg) {
    const data = this.getMessage(msg);
    fs.appendFileSync(this.filePath, data, { encoding: 'utf8' });
  }

  blog(...msg) {
    const data = this.getMessage(msg);
    if (this.appEnvironment.isDevelopment()) console.log(data);
    fs.appendFileSync(this.bFilePath, data, { encoding: 'utf8' });
  }

  mlog(...msg) {
    const data = this.getMessage(msg);
    fs.appendFileSync(this.mFilePath, data, { encoding: 'utf8' });
  }

  bilog(...msg) {
    const data = this.getMessage(msg);
    if (this.appEnvironment.isDevelopment()) console.log(data);
    fs.appendFileSync(this.biFilePath, data, { encoding: 'utf8' });
  }

  streamLog(filePath, res) {
    if (!fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, '', { encoding: 'utf8' });
    }

    res.set({ 'content-type': 'text/html; charset=utf-8' });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}
