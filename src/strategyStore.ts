import { Strategy } from './types';

export const DEFAULT_STRATEGY: Strategy = {
  symbol: 'BTCUSDT',
  timeframe: '1h',
  indicators: [
    {
      type: 'RSI',
      enabled: true,
      params: {
        period: 14,
        overbought: 70,
        oversold: 30,
      },
    },
    {
      type: 'SMA',
      enabled: true,
      params: {
        shortPeriod: 50,
        longPeriod: 200,
      },
    },
    {
      type: 'MACD',
      enabled: false,
      params: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      },
    },
    {
      type: 'BB',
      enabled: false,
      params: {
        period: 20,
        stdDev: 2,
      },
    },
  ],
  risk: {
    stopLoss: 2.0, // 2%
    takeProfit: 5.0, // 5%
  },
  logic: 'Buy when RSI is oversold (< 30) OR SMA 50 is above SMA 200 (Golden Cross)',
};

const LOCAL_STORAGE_KEY = 'crypto_backtester_strategy';

export function loadSavedStrategy(): Strategy {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure basic keys exist
      if (parsed.symbol && parsed.timeframe && Array.isArray(parsed.indicators)) {
        return parsed as Strategy;
      }
    }
  } catch (error) {
    console.error('Failed to load strategy from localStorage:', error);
  }
  return DEFAULT_STRATEGY;
}

export function saveStrategy(strategy: Strategy): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(strategy));
  } catch (error) {
    console.error('Failed to save strategy to localStorage:', error);
  }
}
