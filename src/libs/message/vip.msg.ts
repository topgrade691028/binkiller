import { BKSignal, BKSignalTerms } from "src/models/bk-signal";

export class VipMessage {
  name = 'VIP';

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
  parseCoin(line) {
    const msgs = line.split(' ');
    if (msgs[0] != 'COIN:') return null;
    const coin = this.strReplace(msgs[1], ['$', '/'], '');
    let leverage = this.splitValues(this.strReplace(msgs[2], ['(', 'x', ')'], ''));
    if (leverage.length == 0) leverage = [1];

    return {
      coin,
      leverage
    }
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

  parseOTE(lines) {
    const value = this.findLine(lines, 'OTE:');
    if (!value) throw 'OTE NOT FOUND';
    return parseFloat(value);
  }

  parseStopLoss(lines) {
    const value = this.findLine(lines, 'STOP LOSS:');
    if (!value) throw 'STOP LOSS NOT FOUND';
    return parseFloat(value);
  }

  splitValues(values) {
    if (!values) return [];
    return values.split('-').map(v => (parseFloat(v.trim())));
  }

  parseTerms(lines): BKSignalTerms {
    const short = this.findLine(lines, 'Short Term:');
    const mid = this.findLine(lines, 'Mid Term:');
    const long = this.findLine(lines, 'Long Term:');
    return {
      short: this.splitValues(short),
      mid: this.splitValues(mid),
      long: this.splitValues(long)
    };
  }

  parse(message: string) {
    const msgLines = message.split('\n');
    if (msgLines[0].indexOf('SIGNAL ID:') == -1) return;

    const signalId = this.parseSignalId(msgLines[0]);
    const { coin, leverage } = this.parseCoin(msgLines[1]);
    const direction = this.parseDirection(msgLines);
    const entry = this.parseEntry(msgLines);
    let ote = this.parseOTE(msgLines);
    const terms = this.parseTerms(msgLines);
    const stopLoss = this.parseStopLoss(msgLines);

    const avrEntry = entry.reduce((partial_sum, a) => partial_sum + a, 0) / entry.length;
    ote = Math.min(ote, avrEntry);

    const signalData: BKSignal = {
      signalId,
      coin,
      direction,
      leverage,
      entry,
      ote,
      terms,
      stopLoss,
      createdAt: Date.now(),
    };

    return signalData;
  }
}