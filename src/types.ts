export interface IndicatorConfig {
  type: 'RSI' | 'SMA' | 'MACD' | 'BB';
  enabled: boolean;
  params: {
    period?: number;
    overbought?: number;
    oversold?: number;
    shortPeriod?: number;
    longPeriod?: number;
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
    stdDev?: number;
  };
}

export interface RiskConfig {
  stopLoss: number; // Percentage, e.g. 1.5 for 1.5%
  takeProfit: number; // Percentage, e.g. 3.0 for 3.0%
}

export interface Strategy {
  symbol: string; // e.g. 'BTCUSDT'
  timeframe: string; // '15m' | '1h' | '4h' | '1d'
  indicators: IndicatorConfig[];
  risk: RiskConfig;
  logic: string;
}

export interface Candle {
  time: number; // Timestamp in ms or seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Indicator values calculated on this candle
  rsi?: number;
  smaShort?: number;
  smaLong?: number;
  macd?: {
    macd: number;
    signal: number;
    histogram: number;
  };
  bb?: {
    upper: number;
    middle: number;
    lower: number;
  };
}

export interface Trade {
  id: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  entryTime: number; // Timestamp
  exitPrice: number;
  exitTime: number; // Timestamp
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'SIGNAL_REVERSAL' | 'FORCE_CLOSE';
  quantity: number;
  pnl: number; // absolute dollar PnL
  pnlPercent: number; // percentage change
  runningCapital: number;
}

export interface BacktestResults {
  trades: Trade[];
  candles: Candle[];
  metrics: {
    initialCapital: number;
    finalCapital: number;
    totalReturn: number; // e.g., 25.4%
    maxDrawdown: number; // e.g., 5.2%
    sharpeRatio: number;
    winRate: number; // percentage
    totalTrades: number;
    profitableTrades: number;
    lossTrades: number;
  };
  pnlSeries: { time: number; value: number }[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  extractedStrategy?: Strategy;
}
