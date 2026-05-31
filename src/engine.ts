import { Candle, Trade, Strategy, BacktestResults } from './types';

// ==========================================
// TECHNICAL INDICATOR CALCULATORS
// ==========================================

export function calculateSMA(closes: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(undefined);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += closes[i - j];
    }
    result.push(sum / period);
  }
  return result;
}

export function calculateEMA(closes: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  if (closes.length === 0) return result;
  
  const k = 2 / (period + 1);
  
  // Seed first value with SMA
  let sum = 0;
  for (let i = 0; i < Math.min(period, closes.length); i++) {
    sum += closes[i];
  }
  let prevEma = sum / Math.min(period, closes.length);
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(undefined);
      continue;
    }
    if (i === period - 1) {
      result.push(prevEma);
      continue;
    }
    const currentEma = closes[i] * k + prevEma * (1 - k);
    result.push(currentEma);
    prevEma = currentEma;
  }
  return result;
}

export function calculateRSI(closes: number[], period: number = 14): (number | undefined)[] {
  const rsi: (number | undefined)[] = [];
  if (closes.length <= period) {
    return Array(closes.length).fill(undefined);
  }

  let gains = 0;
  let losses = 0;

  // First change values
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      rsi.push(undefined);
      continue;
    }

    const diff = closes[i] - closes[i - 1];
    
    if (i <= period) {
      if (diff > 0) gains += diff;
      else losses -= diff;

      if (i === period) {
        let avgGain = gains / period;
        let avgLoss = losses / period;
        if (avgLoss === 0) {
          rsi.push(100);
        } else {
          const rs = avgGain / avgLoss;
          rsi.push(100 - 100 / (1 + rs));
        }
      } else {
        rsi.push(undefined);
      }
      continue;
    }

    // Smooth gain and losses using Wilder's smoothing technique
    const currentGain = diff > 0 ? diff : 0;
    const currentLoss = diff < 0 ? -diff : 0;

    let prevGain = gains / period; // this holds previous average index
    // Wilder's Averaging
    let avgGain = (prevGain * (period - 1) + currentGain) / period;
    
    // Recalculate gains history
    let prevLoss = losses / period;
    let avgLoss = (prevLoss * (period - 1) + currentLoss) / period;

    gains = avgGain * period;
    losses = avgLoss * period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  return rsi;
}

export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: (number | undefined)[]; signal: (number | undefined)[]; histogram: (number | undefined)[] } {
  const nulls = Array(closes.length).fill(undefined);
  if (closes.length < slowPeriod) {
    return { macd: nulls, signal: nulls, histogram: nulls };
  }

  const fastEma = calculateEMA(closes, fastPeriod);
  const slowEma = calculateEMA(closes, slowPeriod);

  const macdLine: (number | undefined)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f === undefined || s === undefined) {
      macdLine.push(undefined);
    } else {
      macdLine.push(f - s);
    }
  }

  // Calculate signal line (EMA of MACD line)
  // Extract defined macdLine values
  const firstValidIndex = macdLine.findIndex((x) => x !== undefined);
  const validMacdValues = macdLine.slice(firstValidIndex) as number[];
  const validSignalValues = calculateEMA(validMacdValues, signalPeriod);

  const signalLine: (number | undefined)[] = Array(firstValidIndex).fill(undefined).concat(validSignalValues);

  const histogram: (number | undefined)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const m = macdLine[i];
    const s = signalLine[i];
    if (m === undefined || s === undefined) {
      histogram.push(undefined);
    } else {
      histogram.push(m - s);
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): ({ upper: number; middle: number; lower: number } | undefined)[] {
  const result: ({ upper: number; middle: number; lower: number } | undefined)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(undefined);
      continue;
    }

    // Middle is simple moving average
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += closes[i - j];
    }
    const middle = sum / period;

    // Standard deviation
    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      varianceSum += Math.pow(closes[i - j] - middle, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);

    const upper = middle + stdDevMultiplier * stdDev;
    const lower = middle - stdDevMultiplier * stdDev;

    result.push({ upper, middle, lower });
  }

  return result;
}

// Ensure indicators are bound to our Candles
export function enrichCandlesWithIndicators(candles: Candle[], strategy: Strategy): Candle[] {
  const closes = candles.map((c) => c.close);

  // Extract params
  const rsiConfig = strategy.indicators.find((ind) => ind.type === 'RSI' && ind.enabled);
  const smaConfig = strategy.indicators.find((ind) => ind.type === 'SMA' && ind.enabled);
  const macdConfig = strategy.indicators.find((ind) => ind.type === 'MACD' && ind.enabled);
  const bbConfig = strategy.indicators.find((ind) => ind.type === 'BB' && ind.enabled);

  const rsiValues = rsiConfig ? calculateRSI(closes, rsiConfig.params.period || 14) : [];
  
  const smaShortPeriod = smaConfig?.params.shortPeriod || 50;
  const smaLongPeriod = smaConfig?.params.longPeriod || 200;
  const smaShortValues = smaConfig ? calculateSMA(closes, smaShortPeriod) : [];
  const smaLongValues = smaConfig ? calculateSMA(closes, smaLongPeriod) : [];

  const macdRes = macdConfig
    ? calculateMACD(
        closes,
        macdConfig.params.fastPeriod || 12,
        macdConfig.params.slowPeriod || 26,
        macdConfig.params.signalPeriod || 9
      )
    : { macd: [], signal: [], histogram: [] };

  const bbValues = bbConfig
    ? calculateBollingerBands(closes, bbConfig.params.period || 20, bbConfig.params.stdDev || 2)
    : [];

  return candles.map((candle, idx) => {
    const updated: Candle = { ...candle };
    if (rsiConfig && rsiValues[idx] !== undefined) {
      updated.rsi = rsiValues[idx];
    }
    if (smaConfig) {
      if (smaShortValues[idx] !== undefined) updated.smaShort = smaShortValues[idx];
      if (smaLongValues[idx] !== undefined) updated.smaLong = smaLongValues[idx];
    }
    if (macdConfig) {
      const m = macdRes.macd[idx];
      const s = macdRes.signal[idx];
      const h = macdRes.histogram[idx];
      if (m !== undefined && s !== undefined && h !== undefined) {
        updated.macd = { macd: m, signal: s, histogram: h };
      }
    }
    if (bbConfig && bbValues[idx] !== undefined) {
      updated.bb = bbValues[idx];
    }
    return updated;
  });
}

// ==========================================
// BACKTEST SIMULATION ENGINE
// ==========================================

export class BacktestEngine {
  private initialCapital: number;
  private capital: number;
  private strategy: Strategy;
  private candles: Candle[];

  constructor(strategy: Strategy, candles: Candle[], initialCapital: number = 10000) {
    this.strategy = strategy;
    this.candles = enrichCandlesWithIndicators(candles, this.strategy);
    this.initialCapital = initialCapital;
    this.capital = initialCapital;
  }

  public run(): BacktestResults {
    const trades: Trade[] = [];
    const pnlSeries: { time: number; value: number }[] = [];
    
    let position: {
      type: 'BUY' | 'SELL';
      entryPrice: number;
      entryTime: number;
      quantity: number;
    } | null = null;

    let tradeCount = 0;

    // We can only trade once technical indicators are fully settled.
    // Let's find the first valid index where some indicators are enabled but active candles are populated.
    let startIndex = 1;
    for (const ind of this.strategy.indicators) {
      if (!ind.enabled) continue;
      if (ind.type === 'SMA') {
        startIndex = Math.max(startIndex, ind.params.longPeriod || 200);
      }
      if (ind.type === 'RSI') {
        startIndex = Math.max(startIndex, (ind.params.period || 14) + 1);
      }
      if (ind.type === 'MACD') {
        startIndex = Math.max(startIndex, ind.params.slowPeriod || 26);
      }
      if (ind.type === 'BB') {
        startIndex = Math.max(startIndex, ind.params.period || 20);
      }
    }
    
    // Safeguard
    startIndex = Math.min(startIndex, this.candles.length - 1);
    if (startIndex < 0) startIndex = 0;

    for (let i = startIndex; i < this.candles.length; i++) {
      const currentCandle = this.candles[i];
      const prevCandle = this.candles[i - 1];

      // Track running wallet state or capital progression
      const currentClose = currentCandle.close;

      if (position) {
        // We have an active LONG position. Let's check stop loss / take profit
        const priceChangePercent = ((currentClose - position.entryPrice) / position.entryPrice) * 100;
        
        let shouldExit = false;
        let exitReason: Trade['exitReason'] = 'FORCE_CLOSE';

        // Stop Loss check
        if (this.strategy.risk.stopLoss > 0 && priceChangePercent <= -this.strategy.risk.stopLoss) {
          shouldExit = true;
          exitReason = 'STOP_LOSS';
        }
        // Take Profit check
        else if (this.strategy.risk.takeProfit > 0 && priceChangePercent >= this.strategy.risk.takeProfit) {
          shouldExit = true;
          exitReason = 'TAKE_PROFIT';
        }

        // Signal Reversal exit check (if other rules suggest selling/shorting)
        if (!shouldExit) {
          const exitTriggered = this.evaluateExitConditions(currentCandle, prevCandle);
          if (exitTriggered) {
            shouldExit = true;
            exitReason = 'SIGNAL_REVERSAL';
          }
        }

        // If force close on the very last candle
        if (i === this.candles.length - 1) {
          shouldExit = true;
          exitReason = 'FORCE_CLOSE';
        }

        if (shouldExit) {
          // Execute exit
          const finalVal = position.quantity * currentClose;
          const pnl = finalVal - (position.quantity * position.entryPrice);
          const pnlPercent = ((currentClose - position.entryPrice) / position.entryPrice) * 100;
          this.capital += pnl;

          tradeCount++;
          trades.push({
            id: `trade_${tradeCount}`,
            type: 'BUY', // Entering Long, exiting matches BUY
            entryPrice: position.entryPrice,
            entryTime: position.entryTime,
            exitPrice: currentClose,
            exitTime: currentCandle.time,
            exitReason,
            quantity: position.quantity,
            pnl,
            pnlPercent,
            runningCapital: this.capital,
          });

          position = null;
        }
      } else {
        // No position. Evaluate entry condition
        const entryTriggered = this.evaluateEntryConditions(currentCandle, prevCandle);
        if (entryTriggered) {
          // Open Long: allocate 100% of current capital for simplicity
          const feeFactor = 0.999; // 0.1% virtual market fee to simulate real trading
          const spendableCapital = this.capital * feeFactor;
          const quantity = spendableCapital / currentClose;

          position = {
            type: 'BUY',
            entryPrice: currentClose,
            entryTime: currentCandle.time,
            quantity,
          };
        }
      }

      // Record daily equity values (PnL state)
      const virtualEquity = position 
        ? position.quantity * currentClose 
        : this.capital;
      
      pnlSeries.push({
        time: Math.floor(currentCandle.time / 1000), // format to seconds for lightweight-charts
        value: virtualEquity,
      });
    }

    // Compute Metrics
    const initial = this.initialCapital;
    const final = this.capital;
    const totalReturn = ((final - initial) / initial) * 100;

    // Calculate Max Drawdown
    let maxDrawdown = 0;
    let peak = initial;
    for (const p of pnlSeries) {
      if (p.value > peak) {
        peak = p.value;
      }
      const drawdown = ((peak - p.value) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Win Rate & Trades metrics
    const totalTrades = trades.length;
    const profitableTrades = trades.filter(t => t.pnl > 0).length;
    const lossTrades = totalTrades - profitableTrades;
    const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

    // Sharpe Ratio (Simplified using standard deviation of trade returns)
    let sharpeRatio = 0;
    if (trades.length > 1) {
      const returns = trades.map(t => t.pnlPercent / 100);
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);
      // Sharpe calculation (annualizing 1h timeline has various formulations, but
      // a standard strategy Sharpe can be: average trade return divided by standard deviation of trade returns)
      sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(trades.length) : 0;
    }

    return {
      trades,
      candles: this.candles,
      pnlSeries,
      metrics: {
        initialCapital: initial,
        finalCapital: final,
        totalReturn,
        maxDrawdown,
        sharpeRatio,
        winRate,
        totalTrades,
        profitableTrades,
        lossTrades
      }
    };
  }

  /**
   * Helper to verify if active indicator signals are bullish.
   * Compiles indicator states based on "AND/OR" criteria or dynamic text instruction parsed logic.
   */
  private evaluateEntryConditions(current: Candle, prev: Candle): boolean {
    const activeIndicators = this.strategy.indicators.filter(ind => ind.enabled);
    if (activeIndicators.length === 0) return false;

    // Let's create an array of decisions for each active indicator.
    // If they indicate bullish stance, we mark true.
    const signals: boolean[] = [];

    for (const ind of activeIndicators) {
      let isBullish = false;

      if (ind.type === 'RSI') {
        const rsi = current.rsi;
        const prevRsi = prev.rsi;
        const oversold = ind.params.oversold || 30;
        if (rsi !== undefined) {
          // Trigger: RSI leaves oversold zone (crossing up) OR is deeply oversold
          if (rsi < oversold || (prevRsi !== undefined && prevRsi < oversold && rsi >= oversold)) {
            isBullish = true;
          }
        }
      }

      else if (ind.type === 'SMA') {
        const short = current.smaShort;
        const long = current.smaLong;
        const prevShort = prev.smaShort;
        const prevLong = prev.smaLong;

        if (short !== undefined && long !== undefined) {
          // Golden Cross: Short SMA crosses above Long SMA, or Price simply sits above long SMA
          const crossedUp = prevShort !== undefined && prevLong !== undefined && prevShort <= prevLong && short > long;
          const isAbove = current.close > long;
          // Strategy can combine these or choose standard crossing
          isBullish = crossedUp || isAbove;
        }
      }

      else if (ind.type === 'MACD') {
        if (current.macd && prev.macd) {
          const hist = current.macd.histogram;
          const prevHist = prev.macd.histogram;
          const mLine = current.macd.macd;
          const sLine = current.macd.signal;
          const prevMLine = prev.macd.macd;
          const prevSLine = prev.macd.signal;

          // Bullish: MACD line crosses above signal line
          const crossUp = prevMLine <= prevSLine && mLine > sLine;
          // Or Positive momentum
          const positiveHist = hist > 0 && prevHist <= 0;
          isBullish = crossUp || positiveHist;
        }
      }

      else if (ind.type === 'BB') {
        const bb = current.bb;
        const prevBb = prev.bb;
        if (bb && prevBb) {
          // Reversion: Close crosses below lower band, indicating oversold state
          const crossedBelowLower = prev.close >= prevBb.lower && current.close < bb.lower;
          const sitsBelowLower = current.close < bb.lower;
          isBullish = crossedBelowLower || sitsBelowLower;
        }
      }

      signals.push(isBullish);
    }

    // Combine strategies logically
    // Since the strategy text logic parameter exists, if it includes words like "AND" or "confluence",
    // we require CONFLUENCE (all enabled triggers must match). Otherwise, OR (any trigger).
    const containsAnd = this.strategy.logic.toLowerCase().includes('and') || 
                        this.strategy.logic.toLowerCase().includes('confluence') ||
                        this.strategy.logic.toLowerCase().includes('all');
                        
    if (containsAnd) {
      return signals.length > 0 && signals.every(s => s === true);
    } else {
      // Default to "ANY indicator signal is triggered (OR)" for more active demo setups,
      // but requiring at least one true.
      return signals.length > 0 && signals.some(s => s === true);
    }
  }

  /**
   * Helper to evaluate sell / indicator reversal exit triggers
   */
  private evaluateExitConditions(current: Candle, prev: Candle): boolean {
    const activeIndicators = this.strategy.indicators.filter(ind => ind.enabled);
    if (activeIndicators.length === 0) return false;

    const signals: boolean[] = [];

    for (const ind of activeIndicators) {
      let isBearish = false;

      if (ind.type === 'RSI') {
        const rsi = current.rsi;
        const prevRsi = prev.rsi;
        const overbought = ind.params.overbought || 70;
        if (rsi !== undefined) {
          if (rsi > overbought || (prevRsi !== undefined && prevRsi > overbought && rsi <= overbought)) {
            isBearish = true;
          }
        }
      }

      else if (ind.type === 'SMA') {
        const short = current.smaShort;
        const long = current.smaLong;
        const prevShort = prev.smaShort;
        const prevLong = prev.smaLong;

        if (short !== undefined && long !== undefined) {
          // Death Cross
          const crossedDown = prevShort !== undefined && prevLong !== undefined && prevShort >= prevLong && short < long;
          const isBelow = current.close < long;
          isBearish = crossedDown || isBelow;
        }
      }

      else if (ind.type === 'MACD') {
        if (current.macd && prev.macd) {
          const mLine = current.macd.macd;
          const sLine = current.macd.signal;
          const prevMLine = prev.macd.macd;
          const prevSLine = prev.macd.signal;

          // Death Cross
          const crossedDown = prevMLine >= prevSLine && mLine < sLine;
          isBearish = crossedDown;
        }
      }

      else if (ind.type === 'BB') {
        const bb = current.bb;
        const prevBb = prev.bb;
        if (bb && prevBb) {
          // Overbought touch upper band
          const crossedAboveUpper = prev.close <= prevBb.upper && current.close > bb.upper;
          isBearish = crossedAboveUpper || current.close > bb.upper;
        }
      }

      signals.push(isBearish);
    }

    // If text states confluence/AND, we demand all exit, else any exit.
    const containsAnd = this.strategy.logic.toLowerCase().includes('and') || 
                        this.strategy.logic.toLowerCase().includes('confluence') ||
                        this.strategy.logic.toLowerCase().includes('all');

    if (containsAnd) {
      return signals.length > 0 && signals.every(s => s === true);
    } else {
      return signals.length > 0 && signals.some(s => s === true);
    }
  }
}
