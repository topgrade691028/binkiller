import * as cuid from 'cuid';
import { BKSignal, BKSignalTerms } from "src/models/bk-signal";

export class CornixMessage {
  name = 'Cornix';

  strReplace(str, source, target) {
    source.forEach(src => str = str.replace(src, target));
    return str;
  }

  parseSignalId(line) {
    if (!line.startsWith('📍')) return null;
    const id = line.replace(/📍/g, '').trim().replace('SIGNAL ID:', '');
    return parseInt(id);
  }

  /**
   * Parse coin
   * @param {String} line ex: COIN: $FIL/USDT (3-5x)
   * @returns { coin: 'FILUSDT', leverage: [3, 5] }
   */
  parseCoin(lines) {
    const line = this.findLine(lines, 'COIN:');
    if (!line) throw 'COIN NOT FOUND';
    const coin = this.strReplace(line, ['$', '/'], '');
    return coin;
  }

  findLine(lines, key) {
    for (const line of lines) {
      if (line.indexOf(key) == 0)
        return line
          .replace(key, '')
          .replace(/,/g, '')
          .trim();
    }
    return null;
  }

  parseDirection(lines): string {
    const value = this.findLine(lines, 'Direction:');
    if (!value) throw 'Direction NOT FOUND';
    return value;
  }

  parseExchange(lines): string {
    const value = this.findLine(lines, 'Exchange:');
    if (!value) throw 'Exchange NOT FOUND';
    return value;
  }

  parseLeverage(lines): number {
    let value = this.findLine(lines, 'Leverage:');
    if (!value) throw 'Leverage NOT FOUND';
    value = value.replace('x', '');
    return parseInt(value);
  }

  /**
   * Parse Entry
   * sample input: ENTRY: 81 - 84.5
   * sample output: [81, 84.5]
   * @param {String} lines 
   * @returns 
   */
  parseEntry(lines): number[] {
    const value = this.findLine(lines, 'ENTRY:');
    if (!value) throw 'ENTRY NOT FOUND';
    const values = value.split('-');
    return values.map(v => parseFloat(v));
  }

  parseStopLoss(lines) {
    const value = this.findLine(lines, 'STOP LOSS:');
    if (!value) throw 'STOP LOSS NOT FOUND';
    return parseFloat(value);
  }

  splitValues(values): number[] {
    if (!values) return [];
    return values.split('-').map(v => (parseFloat(v.trim())));
  }

  parseTargets(lines): BKSignalTerms {
    const targets = this.findLine(lines, 'TARGETS:');
    const terms = this.splitValues(targets);
    if (terms.length) {
      const short = terms.splice(0, 5);
      return {
        short,
        mid: terms,
        long: []
      };
    }

    const short = this.findLine(lines, 'Short Term:');
    const shortValues = this.splitValues(short);

    const mid = this.findLine(lines, 'Mid Term:');
    const midValues = this.splitValues(mid);
    return {
      short: shortValues,
      mid: midValues,
      long: []
    };
  }

  parse(message: string) {
    const msgLines = message.split('\n');
    const signalId = cuid();
    const coin = this.parseCoin(msgLines);
    const direction = this.parseDirection(msgLines);
    // const exchange = this.parseExchange(msgLines);
    const leverage = this.parseLeverage(msgLines);
    const leverages = [leverage];
    if (leverage == 3) leverages.push(5);

    const entry = this.parseEntry(msgLines);
    const terms = this.parseTargets(msgLines);
    const stopLoss = this.parseStopLoss(msgLines);
    const avrEntry = (entry[0] + entry[entry.length - 1]) / 2;
    const ote = entry.length == 3 ? entry[1] : avrEntry;
    if (entry.length == 3) entry.splice(1, 1);

    const signalData: BKSignal = {
      signalId,
      coin,
      direction,
      leverage: leverages,
      entry,
      ote,
      terms,
      stopLoss,
      createdAt: Date.now(),
    };

    return signalData;
  }
}