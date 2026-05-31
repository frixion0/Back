import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, LineStyle, UTCTimestamp, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { Candle, Trade } from '../types';

interface ChartComponentProps {
  candles: Candle[];
  trades: Trade[];
  activeIndicators: {
    rsi: boolean;
    sma: boolean;
    macd: boolean;
    bb: boolean;
  };
}

export const ChartComponent: React.FC<ChartComponentProps> = ({
  candles,
  trades,
  activeIndicators,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);

  const mainChartRef = useRef<any | null>(null);
  const rsiChartRef = useRef<any | null>(null);
  const macdChartRef = useRef<any | null>(null);

  // Synchronize timescale logic for multi-pane view
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // Common options for deep midnight styling
    const chartOptions = {
      layout: {
        background: { color: '#0A0A0C' },
        textColor: '#71717A',
        fontSize: 11,
        fontFamily: 'Courier New, Courier, monospace',
      },
      grid: {
        vertLines: { color: '#26262C', style: LineStyle.Dotted },
        horzLines: { color: '#26262C', style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { labelBackgroundColor: '#26262C' },
        horzLine: { labelBackgroundColor: '#26262C' },
      },
      timeScale: {
        borderColor: '#26262C',
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: (price: number) => price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
      },
    };

    // 1. CREATE MAIN CHART
    const mainChart = createChart(chartContainerRef.current, {
      ...chartOptions,
      width: chartContainerRef.current.clientWidth,
      height: 480,
    }) as any;
    mainChartRef.current = mainChart;

    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Sort and deduplicate candles
    const uniqueCandlesMap = new Map<number, Candle>();
    candles.forEach((c) => {
      const sec = Math.floor(c.time / 1000);
      uniqueCandlesMap.set(sec, c);
    });
    const uniqueCandlesArray = Array.from(uniqueCandlesMap.values()).sort((a, b) => a.time - b.time);

    // Map candles to TradingView format
    const chartCandleData = uniqueCandlesArray.map((c) => ({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candlestickSeries.setData(chartCandleData);

    // Overlay SMAs
    let smaShortSeries: ISeriesApi<'Line'> | null = null;
    let smaLongSeries: ISeriesApi<'Line'> | null = null;

    if (activeIndicators.sma) {
      smaShortSeries = mainChart.addSeries(LineSeries, {
        color: '#3b82f6', // blue
        lineWidth: 1.5,
        title: 'SMA Short',
      });
      const smaShortData = uniqueCandlesArray
        .filter((c) => c.smaShort !== undefined)
        .map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.smaShort as number,
        }));
      smaShortSeries.setData(smaShortData);

      smaLongSeries = mainChart.addSeries(LineSeries, {
        color: '#f59e0b', // amber
        lineWidth: 1.5,
        title: 'SMA Long',
      });
      const smaLongData = uniqueCandlesArray
        .filter((c) => c.smaLong !== undefined)
        .map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.smaLong as number,
        }));
      smaLongSeries.setData(smaLongData);
    }

    // Overlay Bollinger Bands
    let bbUpperSeries: ISeriesApi<'Line'> | null = null;
    let bbMiddleSeries: ISeriesApi<'Line'> | null = null;
    let bbLowerSeries: ISeriesApi<'Line'> | null = null;

    if (activeIndicators.bb) {
      bbUpperSeries = mainChart.addSeries(LineSeries, {
        color: 'rgba(168, 85, 247, 0.6)', // purple transparent
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: 'BB Upper',
      });
      const bbUpperData = uniqueCandlesArray
        .filter((c) => c.bb !== undefined)
        .map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.bb!.upper,
        }));
      bbUpperSeries.setData(bbUpperData);

      bbMiddleSeries = mainChart.addSeries(LineSeries, {
        color: 'rgba(168, 85, 247, 0.4)',
        lineWidth: 1,
        title: 'BB Basis',
      });
      const bbMiddleData = uniqueCandlesArray
        .filter((c) => c.bb !== undefined)
        .map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.bb!.middle,
        }));
      bbMiddleSeries.setData(bbMiddleData);

      bbLowerSeries = mainChart.addSeries(LineSeries, {
        color: 'rgba(168, 85, 247, 0.6)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: 'BB Lower',
      });
      const bbLowerData = uniqueCandlesArray
        .filter((c) => c.bb !== undefined)
        .map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.bb!.lower,
        }));
      bbLowerSeries.setData(bbLowerData);
    }

    // Buy / Sell Markers
    const chartMarkers: any[] = [];
    trades.forEach((trade) => {
      const entrySec = Math.floor(trade.entryTime / 1000);
      const exitSec = Math.floor(trade.exitTime / 1000);

      // Verify that this time exists in candledata map
      if (uniqueCandlesMap.has(entrySec)) {
        chartMarkers.push({
          time: entrySec as UTCTimestamp,
          position: 'belowBar',
          color: '#22c55e',
          shape: 'arrowUp',
          text: `BUY @ $${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          size: 1.5,
        });
      }

      if (uniqueCandlesMap.has(exitSec)) {
        let label = 'SELL';
        if (trade.exitReason === 'TAKE_PROFIT') label = 'TP (Profit)';
        else if (trade.exitReason === 'STOP_LOSS') label = 'SL (Stop)';
        else if (trade.exitReason === 'SIGNAL_REVERSAL') label = 'REVERSAL';

        chartMarkers.push({
          time: exitSec as UTCTimestamp,
          position: 'aboveBar',
          color: '#ef4444',
          shape: 'arrowDown',
          text: `${label} @ $${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(1)}%)`,
          size: 1.5,
        });
      }
    });

    // Apply markers sorted by time
    chartMarkers.sort((a, b) => a.time - b.time);
    candlestickSeries.setMarkers(chartMarkers);

    // 2. CREATE RSI SUB-CHART (IF ACTIVE)
    let rsiChart: any = null;
    if (activeIndicators.rsi && rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        ...chartOptions,
        width: rsiContainerRef.current.clientWidth,
        height: 180,
      }) as any;
      rsiChartRef.current = rsiChart;

      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#bfdbfe', // light blue
        lineWidth: 1.5,
        title: 'RSI',
      });

      const rsiData = uniqueCandlesArray
        .filter((c) => c.rsi !== undefined)
        .map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.rsi as number,
        }));
      rsiSeries.setData(rsiData);

      // Draw horizontal lines at 30 and 70
      const limit30 = rsiChart.addSeries(LineSeries, {
        color: 'rgba(239, 68, 68, 0.4)', // red
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
      });
      limit30.setData(chartCandleData.map(c => ({ time: c.time, value: 30 })));

      const limit70 = rsiChart.addSeries(LineSeries, {
        color: 'rgba(239, 68, 68, 0.4)', // red
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
      });
      limit70.setData(chartCandleData.map(c => ({ time: c.time, value: 70 })));
    }

    // 3. CREATE MACD SUB-CHART (IF ACTIVE)
    let macdChart: any = null;
    if (activeIndicators.macd && macdContainerRef.current) {
      macdChart = createChart(macdContainerRef.current, {
        ...chartOptions,
        width: macdContainerRef.current.clientWidth,
        height: 180,
      }) as any;
      macdChartRef.current = macdChart;

      const macdLineSeries = macdChart.addSeries(LineSeries, {
        color: '#60a5fa', // blue MACD
        lineWidth: 1.5,
        title: 'MACD',
      });
      const validMacd = uniqueCandlesArray
        .filter((c) => c.macd !== undefined)
        .map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.macd!.macd,
        }));
      macdLineSeries.setData(validMacd);

      const signalLineSeries = macdChart.addSeries(LineSeries, {
        color: '#f87171', // red signal
        lineWidth: 1.5,
        title: 'Signal',
      });
      const validSignal = uniqueCandlesArray
        .filter((c) => c.macd !== undefined)
        .map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.macd!.signal,
        }));
      signalLineSeries.setData(validSignal);

      const histogramSeries = macdChart.addSeries(HistogramSeries, {
        title: 'Histogram',
      });
      const validHist = uniqueCandlesArray
        .filter((c) => c.macd !== undefined)
        .map((c) => {
          const val = c.macd!.histogram;
          return {
            time: Math.floor(c.time / 1000) as UTCTimestamp,
            value: val,
            color: val >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
          };
        });
      histogramSeries.setData(validHist);
    }

    // Synchronize visible ranges across charts
    const chartsList = [mainChart, rsiChart, macdChart].filter((c) => c !== null) as IChartApi[];
    if (chartsList.length > 1) {
      chartsList.forEach((chart, index) => {
        chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (!range) return;
          chartsList.forEach((otherChart, otherIndex) => {
            if (index !== otherIndex) {
              otherChart.timeScale().setVisibleLogicalRange(range);
            }
          });
        });
      });
    }

    // Resize Observer to handle responsiveness beautifully without fixed coordinates
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (mainChartRef.current) {
          mainChartRef.current.resize(width, 480);
        }
        if (rsiChartRef.current && rsiContainerRef.current) {
          rsiChartRef.current.resize(rsiContainerRef.current.clientWidth, 180);
        }
        if (macdChartRef.current && macdContainerRef.current) {
          macdChartRef.current.resize(macdContainerRef.current.clientWidth, 180);
        }
      }
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    // Cleanup on destroy
    return () => {
      resizeObserver.disconnect();
      mainChart.remove();
      if (rsiChart) rsiChart.remove();
      if (macdChart) macdChart.remove();
      mainChartRef.current = null;
      rsiChartRef.current = null;
      macdChartRef.current = null;
    };
  }, [candles, trades, activeIndicators]);

  return (
    <div className="flex flex-col gap-2 w-full h-full bg-sidebar p-3 rounded-sm border border-border-dim">
      {/* Price Candlesticks Chart */}
      <div className="relative w-full">
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-bg/90 px-2.5 py-0.5 rounded-sm border border-border-dim backdrop-blur-xs font-mono text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-success-green animate-pulse"></span>
          <span className="font-bold text-text-bright">LIVE CANDLE HISTORY (1000 candles)</span>
        </div>
        <div ref={chartContainerRef} className="w-full h-[480px] rounded-sm overflow-hidden border border-border-dim" id="main-candle-pane" />
      </div>

      {/* RSI Sub-pane Chart */}
      {activeIndicators.rsi && (
        <div className="relative w-full">
          <div className="absolute top-1.5 left-2 z-10 bg-bg/90 px-2 py-0.5 rounded-sm border border-border-dim backdrop-blur-xs font-mono text-[9px]">
            <span className="text-text-dim">RSI OSCILLATOR</span>
          </div>
          <div ref={rsiContainerRef} className="w-full h-[180px] rounded-sm overflow-hidden border border-border-dim" id="rsi-oscillator-pane" />
        </div>
      )}

      {/* MACD Sub-pane Chart */}
      {activeIndicators.macd && (
        <div className="relative w-full">
          <div className="absolute top-1.5 left-2 z-10 bg-bg/90 px-2 py-0.5 rounded-sm border border-border-dim backdrop-blur-xs font-mono text-[9px]">
            <span className="text-text-dim">MACD MOMENTUM</span>
          </div>
          <div ref={macdContainerRef} className="w-full h-[180px] rounded-sm overflow-hidden border border-border-dim" id="macd-oscillator-pane" />
        </div>
      )}
    </div>
  );
};
