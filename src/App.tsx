import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  LineChart, 
  Play, 
  Send, 
  Sliders, 
  Settings, 
  Download, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Sparkles, 
  RefreshCw, 
  Database, 
  Cpu, 
  Layers, 
  Info, 
  X,
  Plus,
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchKlines, askPollinationsAI } from './api';
import { BacktestEngine } from './engine';
import { loadSavedStrategy, saveStrategy, DEFAULT_STRATEGY } from './strategyStore';
import { Strategy, Candle, Trade, BacktestResults, ChatMessage } from './types';
import { ChartComponent } from './components/ChartComponent';

export default function App() {
  // Global central Trading Strategy state
  const [strategy, setStrategy] = useState<Strategy>(() => loadSavedStrategy());
  
  // Backtest engine simulation results
  const [results, setResults] = useState<BacktestResults | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);

  // Page level statuses
  const [loading, setLoading] = useState<boolean>(false);
  const [aiResponseWait, setAiResponseWait] = useState<boolean>(false);
  const [utcTime, setUtcTime] = useState<string>('');
  const [toasts, setToasts] = useState<{ id: string; type: 'success' | 'error' | 'info'; message: string }[]>([]);
  
  // Default wallet setting
  const [initialCapital, setInitialCapital] = useState<number>(100000);

  // Chat interface conversation history
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'welcome_msg',
        sender: 'assistant',
        text: `Salutations, I am your Senior Quantitative Strategy Engineer. 

I parse plain-text definitions into live indicator conditions. Try typing what you want in plain English, for example:
• *"Buy when RSI crosses below 25 and SMA 50 is above SMA 200, stop loss at 1.5% and take profit at 4.5% on SOLUSDT with 15m"*
• *"Gimme a breakout strategy on BNBUSDT 1h using Bollinger Bands logic"*`,
        timestamp: Date.now(),
      }
    ];
  });
  const [userInputMessage, setUserInputMessage] = useState<string>('');
  
  // Custom interactive system indicators stats
  const [latency, setLatency] = useState<number>(24);
  const [binanceActive, setBinanceActive] = useState<boolean>(true);

  // Auto-clock effect
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setUtcTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Soft fluctuate latency to simulate a live premium Bloomberg/Trading Desk API
  useEffect(() => {
    const timer = setInterval(() => {
      setLatency(prev => Math.max(12, Math.min(65, prev + Math.floor(Math.random() * 9) - 4)));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Notification Toast Helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Central trigger backtest routine
  const triggerBacktest = async (currentStrategy: Strategy) => {
    setLoading(true);
    setBinanceActive(true);
    try {
      showToast(`Fetching historical candles for ${currentStrategy.symbol} (${currentStrategy.timeframe})...`, 'info');
      // Fetch 1000 candles from Binance (Futures preferred, falls back to Spot)
      const fetchedCandles = await fetchKlines(currentStrategy.symbol, currentStrategy.timeframe, 1000);
      setCandles(fetchedCandles);

      showToast(`Compiling logic & simulating virtual index trades...`, 'info');
      
      // Instantiate simulation engine
      const engine = new BacktestEngine(currentStrategy, fetchedCandles, initialCapital);
      const output = engine.run();

      setResults(output);
      saveStrategy(currentStrategy); // Persist
      showToast(`Simulation successfully processed ${output.metrics.totalTrades} signals.`, 'success');
    } catch (error: any) {
      console.error(error);
      setBinanceActive(false);
      showToast(error?.message || 'Error occurred during market data loading.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Debouncing changes for the Control Sliders
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const debouncedRunBacktest = (nextStrat: Strategy) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      triggerBacktest(nextStrat);
    }, 350); // 350ms debounce window
  };

  // On first mount, run standard setup
  useEffect(() => {
    triggerBacktest(strategy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update a single strategy field and trigger immediate/debounced calculation
  const updateStrategyValue = (updater: (prev: Strategy) => Strategy, debounce: boolean = true) => {
    setStrategy((prev) => {
      const updated = updater(prev);
      saveStrategy(updated);
      if (debounce) {
        debouncedRunBacktest(updated);
      } else {
        triggerBacktest(updated);
      }
      return updated;
    });
  };

  // AI strategy text query handling
  const handleAISend = async () => {
    if (!userInputMessage.trim()) return;
    const userWords = userInputMessage;
    setUserInputMessage('');

    // Append to message stack
    const userMsgId = 'user_' + Date.now();
    setChatMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: userWords,
        timestamp: Date.now(),
      }
    ]);

    setAiResponseWait(true);
    showToast('Consulting Quant AI Broker Agent (Pollinations AI)...', 'info');

    try {
      // Build conversation block
      const systemInstruct = {
        role: 'system' as const,
        content: `You are a Senior Quantitative Analyst. Extract the user's strategy into a strict JSON schema: { "symbol": string, "timeframe": string, "indicators": [{ "type": "RSI"|"SMA"|"MACD"|"BB", "params": object }], "risk": { "stopLoss": number, "takeProfit": number }, "logic": string }. You must interpret details: indicators SMA shortPeriod/longPeriod, RSI period, MACD fastPeriod/slowPeriod/signalPeriod, BB period/stdDev; and risk takeProfit/stopLoss numbers (percentage e.g. 1.5, 3.0, do not write percent symbol). Convert common assets to format like "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT". If user specifies standard intervals (15 min, 1h, 4h, daily, 1d) map to "15m"|"1h"|"4h"|"1d". Provide extreme quality technical descriptions in "logic". Do not return any conversational text or markdown code guards outside of direct json parseable structure.`
      };

      // Extract a history summary to keep context
      const historyContext = chatMessages.slice(-4).map(m => ({
        role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: m.text
      }));

      const responseText = await askPollinationsAI([
        systemInstruct,
        ...historyContext,
        { role: 'user', content: userWords }
      ]);

      // Robust JSON extraction
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(responseText.trim());
      } catch {
        const regexMatch = responseText.match(/\{[\s\S]*\}/);
        if (regexMatch) {
          parsedJson = JSON.parse(regexMatch[0]);
        }
      }

      if (!parsedJson) {
        throw new Error('AI Response was not formatted as a valid Strategy schema.');
      }

      // Build safe Normalized strategy merged to existing
      const nextStrategy: Strategy = {
        symbol: parsedJson.symbol ? parsedJson.symbol.toUpperCase().replace('/', '').trim() : strategy.symbol,
        timeframe: parsedJson.timeframe || strategy.timeframe,
        risk: {
          stopLoss: parsedJson.risk?.stopLoss !== undefined ? parseFloat(parsedJson.risk.stopLoss) : strategy.risk.stopLoss,
          takeProfit: parsedJson.risk?.takeProfit !== undefined ? parseFloat(parsedJson.risk.takeProfit) : strategy.risk.takeProfit,
        },
        logic: parsedJson.logic || `Custom strategy extracted on ${new Date().toLocaleDateString()}`,
        indicators: JSON.parse(JSON.stringify(strategy.indicators)), // copy
      };

      // Synchronize indicators enabled list
      if (Array.isArray(parsedJson.indicators)) {
        nextStrategy.indicators.forEach((ind) => {
          const aiExtract = parsedJson.indicators.find(
            (item: any) => item.type?.toUpperCase() === ind.type.toUpperCase()
          );
          if (aiExtract) {
            ind.enabled = true;
            if (aiExtract.params && typeof aiExtract.params === 'object') {
              ind.params = { ...ind.params, ...aiExtract.params };
            }
          } else {
            ind.enabled = false;
          }
        });
      }

      // Add assistant response to history log
      setChatMessages((prev) => [
        ...prev,
        {
          id: 'ai_' + Date.now(),
          sender: 'assistant',
          text: `Strategy Engine synthesized successfully! 
  
📈 **Symbol**: ${nextStrategy.symbol}  
⏱️ **Timeframe**: ${nextStrategy.timeframe}  
🛡️ **Risk profile**: TP ${nextStrategy.risk.takeProfit}% | SL ${nextStrategy.risk.stopLoss}%  
⚙️ **Signals Active**: ${nextStrategy.indicators.filter(i => i.enabled).map(i => i.type).join(', ') || 'None'}

*Rule rationale: ${nextStrategy.logic}*`,
          timestamp: Date.now(),
          extractedStrategy: nextStrategy,
        }
      ]);

      // Apply state change and run simulation
      setStrategy(nextStrategy);
      triggerBacktest(nextStrategy);
      showToast(`AI Strategy applied successfully! Simulated on index.`, 'success');

    } catch (err: any) {
      console.error(err);
      setChatMessages((prev) => [
        ...prev,
        {
          id: 'ai_error_' + Date.now(),
          sender: 'assistant',
          text: `⚠️ I extracted strategy parameters, but encountered an issue or data block: "${err.message || 'Validation mismatch'}". 

Feel free to refine your command, or fine-tune indicators directly on the manual dashboard panels below.`,
          timestamp: Date.now(),
        }
      ]);
      showToast('Quantitative compilation failed. Use prompt refine tags.', 'error');
    } finally {
      setAiResponseWait(false);
    }
  };

  // Presets to let users run quick tests
  const selectPreset = (headline: string, desc: string) => {
    setUserInputMessage(desc);
    showToast(`Quick prompt populated. Press Send button.`, 'info');
  };

  // CSV down loader
  const downloadCSV = () => {
    if (!results || results.trades.length === 0) {
      showToast('No structured transactions logs found to build tables.', 'error');
      return;
    }

    const headers = [
      'Trade ID',
      'Asset Class',
      'Transaction Type',
      'Entry Price',
      'Entry Time (UTC)',
      'Exit Price',
      'Exit Time (UTC)',
      'Liquidation Trigger',
      'Virtual Allocation',
      'PnL absolute ($)',
      'PnL yield (%)',
      'Total Net Assets ($)'
    ];

    const rows = results.trades.map((t) => [
      t.id,
      strategy.symbol,
      t.type,
      t.entryPrice.toFixed(2),
      `"${new Date(t.entryTime).toISOString()}"`,
      t.exitPrice.toFixed(2),
      `"${new Date(t.exitTime).toISOString()}"`,
      t.exitReason,
      t.quantity.toFixed(4),
      t.pnl.toFixed(2),
      t.pnlPercent.toFixed(2),
      t.runningCapital.toFixed(2),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `quant_backtest_ledger_${strategy.symbol}_${strategy.timeframe}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Transaction CSV file generated and downloaded", "success");
  };

  // Indicators toggle handlers
  const toggleIndicatorEnabled = (type: 'RSI' | 'SMA' | 'MACD' | 'BB') => {
    updateStrategyValue((prev) => {
      const indicators = prev.indicators.map((ind) => {
        if (ind.type === type) {
          return { ...ind, enabled: !ind.enabled };
        }
        return ind;
      });
      return { ...prev, indicators };
    }, false); // trigger immediately on check
  };

  // Check state indicator is active
  const isIndicatorActive = (type: 'RSI' | 'SMA' | 'MACD' | 'BB') => {
    return strategy.indicators.find((ind) => ind.type === type)?.enabled || false;
  };

  return (
    <div className="min-h-screen bg-bg text-text-bright flex flex-col font-sans selection:bg-accent-blue/30 selection:text-white" id="main_viewport">
      
      {/* PROFESSIONAL Bloomberg/DTS TRADING HEADER PANEL */}
      <header className="h-12 border-b border-border-dim bg-sidebar px-4 flex flex-row items-center justify-between gap-4 z-40" id="trading_desk_header">
        <div className="flex items-center gap-2.5">
          <div className="font-mono font-bold text-accent-blue text-sm uppercase tracking-tight flex items-center gap-1.5">
            <span className="text-accent-blue font-black">[Σ]</span> QUANTECH TERMINAL v2.4
          </div>
          <span className="hidden sm:inline bg-accent-blue/10 text-accent-blue/90 border border-accent-blue/30 text-[9px] uppercase px-1.5 py-0.2 rounded font-mono font-black">BACKTEST_LIVE</span>
        </div>

        {/* Global strategy stats strip */}
        <div className="flex items-center gap-4 font-mono text-[11px] overflow-x-auto">
          <div className="flex items-center gap-1">
            <span className="text-text-dim">SYMBOL:</span>
            <span className="text-success-green font-bold">{strategy.symbol}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-text-dim">TICKER:</span>
            <span className="text-text-bright">$64,219.42</span>
          </div>
          <div className="hidden md:flex items-center gap-1 border-l border-border-dim pl-3">
            <span className="text-text-dim">MODE:</span>
            <span className="text-text-bright">BACKTEST_LIVE</span>
          </div>
          <div className="flex items-center gap-1 border-l border-border-dim pl-3">
            <span className="text-text-dim">BINANCE:</span>
            {binanceActive ? (
              <span className="text-success-green font-bold inline-flex items-center gap-1">
                ONLINE <span className="text-[9px] text-text-dim font-normal">({latency}ms)</span>
              </span>
            ) : (
              <span className="text-danger-red font-bold">FAIL</span>
            )}
          </div>
          <div className="hidden lg:flex items-center gap-1 border-l border-border-dim pl-3 text-text-dim">
            <Clock className="w-3.5 h-3.5 text-accent-blue" />
            <span>{utcTime || 'LOADING'}</span>
          </div>
        </div>

        {/* Action Controls in Header */}
        <div className="flex gap-2">
          <button 
            onClick={() => triggerBacktest(strategy)}
            disabled={loading}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/95 text-white border-none py-1 px-3 rounded-[2px] font-mono text-[11px] font-bold cursor-pointer transition disabled:opacity-55"
          >
            {loading ? 'RUNNING...' : 'RUN BACKTEST'}
          </button>
          <button 
            onClick={downloadCSV}
            disabled={!results || results.trades.length === 0}
            className="bg-transparent hover:bg-white/5 border border-border-dim text-text-bright py-1 px-3 rounded-[2px] font-mono text-[11px] cursor-pointer transition disabled:opacity-45"
          >
            EXPORT CSV
          </button>
        </div>
      </header>

      {/* PARENT FLEX BODY CONTAINER */}
      <main className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 bg-bg relative" id="trading_workspace">
        
        {/* LEFT PANEL COLUMN (CHATBOT AND MANUAL CONFIG FORM) */}
        <section className="lg:col-span-4 flex flex-col gap-3 max-h-full overflow-y-auto pr-1" id="configuration_column">
          
          {/* PARENT MODULE A: INTERACTIVE QUANT CHATBOT */}
          <div className="bg-sidebar border border-border-dim rounded-[4px] shadow-sm flex flex-col overflow-hidden relative min-h-[340px]">
            <div className="font-mono text-[10px] text-text-dim font-bold tracking-wider uppercase px-3 py-2 bg-white/[0.02] border-b border-border-dim flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="text-accent-blue font-bold">[Σ]</span> STRATEGY ARCHITECT (AI)
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-success-green animate-pulse"></span>
            </div>

            {/* Chat list history log */}
            <div className="flex-1 p-3 overflow-y-auto space-y-2.5 text-[12px] h-[220px] bg-bg/90 font-sans">
              {chatMessages.map(msg => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col max-w-[90%] ${msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                >
                  <p className="text-[9px] font-mono text-text-dim mb-0.5">
                    {msg.sender === 'user' ? 'USER PROMPT' : 'STRATEGY AGENT'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className={`p-2.5 rounded-[4px] leading-relaxed text-text-bright border ${
                    msg.sender === 'user' 
                      ? 'bg-accent-blue/10 border-accent-blue/30 text-right font-sans shadow-sm' 
                      : 'bg-white/[0.03] border-border-dim border-l-2 border-l-accent-blue text-left font-sans whitespace-pre-line'
                  }`}>
                    {msg.text}

                    {/* AI extracted setup loader button */}
                    {msg.extractedStrategy && (
                      <button 
                        onClick={() => {
                          setStrategy(msg.extractedStrategy!);
                          triggerBacktest(msg.extractedStrategy!);
                          showToast(`Recalibrated terminal strategy from historical node state.`, 'success');
                        }}
                        className="mt-2 w-full bg-bg hover:bg-white/5 text-[10px] text-accent-blue hover:text-white py-1 cursor-pointer rounded-sm border border-border-dim font-mono font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3 animate-spin duration-3000" /> Apply Strategy Parameters
                      </button>
                    )}
                  </div>
                </div>
              ))}
              
              {aiResponseWait && (
                <div className="flex flex-col items-start max-w-[85%]">
                  <span className="text-[9px] font-mono text-text-dim animate-pulse">Assistant compiling code...</span>
                  <div className="bg-white/[0.03] border border-border-dim border-l-2 border-l-accent-blue p-2.5 rounded-[4px] flex items-center gap-2">
                    <span className="animate-ping h-2 w-2 rounded-full bg-accent-blue"></span>
                    <span className="text-xs text-text-dim italic">Synthesizing indicator parameters...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Helper Presets */}
            <div className="border-t border-border-dim bg-white/[0.01] p-1.5 flex flex-col gap-1">
              <span className="text-[9px] font-mono font-bold text-text-dim uppercase px-1.5">Rapid Engineer Presets:</span>
              <div className="flex flex-wrap gap-1 px-1">
                <button 
                  onClick={() => selectPreset('RSI Oversold', 'Buy when RSI is below 24 on ETHUSDT on 1h, take profit at 6% and stop loss at 2%')}
                  className="bg-bg hover:bg-white/5 text-[9px] rounded-sm px-1.5 py-0.5 border border-border-dim text-accent-blue font-mono"
                >
                  RSI oversold
                </button>
                <button 
                  onClick={() => selectPreset('MACD Cross', 'Execute MACD crossing trades on SOLUSDT 15m, TP 4% and SL 1.5%')}
                  className="bg-bg hover:bg-white/5 text-[9px] rounded-sm px-1.5 py-0.5 border border-border-dim text-accent-blue font-mono"
                >
                  MACD momentum
                </button>
                <button 
                  onClick={() => selectPreset('SMA Cross', 'Run SMA 50/200 Trend crossover on BTCUSDT 4h, take profit at 15.0% and stop loss 3.5%')}
                  className="bg-bg hover:bg-white/5 text-[9px] rounded-sm px-1.5 py-0.5 border border-border-dim text-accent-blue font-mono"
                >
                  SMA Crossover
                </button>
              </div>
            </div>

            {/* Input message form box */}
            <div className="border-t border-border-dim p-2 bg-[#0A0A0C] flex gap-2">
              <input 
                type="text" 
                value={userInputMessage}
                onChange={(e) => setUserInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAISend();
                }}
                disabled={aiResponseWait}
                placeholder="Type strategy logic..."
                className="flex-1 bg-bg text-text-bright outline-none px-3 py-1.5 text-xs border border-border-dim focus:border-accent-blue rounded-sm placeholder-text-dim/60 font-mono"
                id="chatbot_text_input"
              />
              <button 
                onClick={handleAISend}
                disabled={aiResponseWait || !userInputMessage.trim()}
                className="bg-accent-blue hover:bg-accent-blue/90 disabled:bg-bg disabled:text-text-dim text-white px-2.5 py-1.5 flex items-center justify-center rounded-sm transition border-0 font-mono text-[11px]"
                title="Compile Strategy"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* PARENT MODULE B: MANUAL CONTROL PANEL (FINE-TUNING) */}
          <div className="bg-sidebar border border-border-dim rounded-[4px] shadow-sm flex flex-col overflow-hidden">
            <div className="font-mono text-[10px] text-text-dim font-bold tracking-wider uppercase px-3 py-2 bg-white/[0.02] border-b border-border-dim">
              MANUAL TUNING
            </div>
            
            <div className="p-3 flex flex-col gap-3">
              {/* Asset Selection Controls Row */}
              <div className="grid grid-cols-2 gap-3 pb-2 border-b border-white/[0.03]">
                <div>
                  <label className="text-[9px] tracking-wider uppercase font-mono text-text-dim font-bold block mb-1">CONTRACT / SYMBOL</label>
                  <select 
                    value={strategy.symbol}
                    onChange={(e) => {
                      const nextSym = e.target.value;
                      updateStrategyValue((prev) => ({ ...prev, symbol: nextSym }), false);
                    }}
                    className="w-full bg-bg text-text-bright border border-border-dim font-mono text-[11px] p-1 rounded-sm focus:border-accent-blue focus:outline-none"
                  >
                    <option value="BTCUSDT">BTC/USDT Spot/Fut</option>
                    <option value="ETHUSDT">ETH/USDT Spot/Fut</option>
                    <option value="SOLUSDT">SOL/USDT Spot/Fut</option>
                    <option value="BNBUSDT">BNB/USDT Spot/Fut</option>
                    <option value="XRPUSDT">XRP/USDT Spot/Fut</option>
                    <option value="DOGEUSDT">DOGE/USDT Spot/Fut</option>
                    <option value="ADAUSDT">ADA/USDT Spot/Fut</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9px] tracking-wider uppercase font-mono text-text-dim font-bold block mb-1">TIMEFRAME / INTERVAL</label>
                  <select 
                    value={strategy.timeframe}
                    onChange={(e) => {
                      const nextTF = e.target.value;
                      updateStrategyValue((prev) => ({ ...prev, timeframe: nextTF }), false);
                    }}
                    className="w-full bg-bg text-text-bright border border-border-dim font-mono text-[11px] p-1 rounded-sm focus:border-accent-blue focus:outline-none"
                  >
                    <option value="15m">15 Minutes</option>
                    <option value="1h">1 Hour (Standard)</option>
                    <option value="4h">4 Hours</option>
                    <option value="1d">Daily (1d)</option>
                  </select>
                </div>
              </div>

              {/* RISK RULES COMPONENT */}
              <div className="bg-bg/40 p-2.5 rounded-sm border border-border-dim space-y-2.5 pb-3">
                <span className="text-[9px] tracking-wider uppercase font-mono font-bold text-accent-blue block pb-0.5 border-b border-border-dim/60">Risk Constraints</span>
                
                {/* Stop Loss Slider */}
                <div className="space-y-0.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-danger-red flex items-center gap-1">STOP LOSS</span>
                    <span className="font-mono bg-danger-red/10 text-danger-red border border-danger-red/20 px-1 rounded-sm text-[9px]">-{strategy.risk.stopLoss.toFixed(1)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="15.0" 
                    step="0.1"
                    value={strategy.risk.stopLoss}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      updateStrategyValue((prev) => ({
                        ...prev,
                        risk: { ...prev.risk, stopLoss: val }
                      }), true);
                    }}
                    className="w-full h-1 bg-bg rounded-sm appearance-none cursor-pointer accent-danger-red"
                  />
                </div>

                {/* Take Profit Slider */}
                <div className="space-y-0.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-success-green flex items-center gap-1">TAKE PROFIT</span>
                    <span className="font-mono bg-success-green/10 text-success-green border border-success-green/20 px-1 rounded-sm text-[9px]">+{strategy.risk.takeProfit.toFixed(1)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="25.0" 
                    step="0.5"
                    value={strategy.risk.takeProfit}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      updateStrategyValue((prev) => ({
                        ...prev,
                        risk: { ...prev.risk, takeProfit: val }
                      }), true);
                    }}
                    className="w-full h-1 bg-bg rounded-sm appearance-none cursor-pointer accent-success-green"
                  />
                </div>
              </div>

              {/* CENTRAL TECHNICAL INDICATORS SELECTORS AND SLIDERS */}
              <div className="space-y-2.5">
                <span className="text-[9px] tracking-wider uppercase font-mono font-bold text-text-dim block pb-0.5 border-b border-border-dim/60">Indicator Modules</span>
                
                {/* RSI Settings Wrapper */}
                <div className={`p-2 rounded-sm border transition ${isIndicatorActive('RSI') ? 'bg-bg/60 border-border-dim' : 'bg-transparent border-transparent opacity-50'}`}>
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-text-bright">
                      <input 
                        type="checkbox"
                        checked={isIndicatorActive('RSI')}
                        onChange={() => toggleIndicatorEnabled('RSI')}
                        className="rounded-sm accent-accent-blue"
                      />
                      RSI (Relative Strength)
                    </label>
                    {isIndicatorActive('RSI') && (
                      <span className="font-mono text-[9px] bg-accent-blue/10 border border-accent-blue/20 text-accent-blue px-1 rounded-sm">ACTIVE</span>
                    )}
                  </div>

                  {isIndicatorActive('RSI') && (
                    <div className="space-y-1.5 mt-2 pl-3.5 text-[11px]">
                      <div>
                        <div className="flex justify-between text-[10px] text-text-dim mb-0.5">
                          <span>Period:</span>
                          <span className="font-mono text-accent-blue">{strategy.indicators.find(i => i.type === 'RSI')?.params.period || 14}</span>
                        </div>
                        <input 
                          type="range" 
                          min="2" 
                          max="40"
                          value={strategy.indicators.find(i => i.type === 'RSI')?.params.period || 14}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateStrategyValue((prev) => {
                              const map = prev.indicators.map(ind => ind.type === 'RSI' ? { ...ind, params: { ...ind.params, period: val } } : ind);
                              return { ...prev, indicators: map };
                            }, true);
                          }}
                          className="w-full h-1 bg-bg accent-accent-blue block"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
                        <div>
                          <span className="text-text-dim block mb-0.5 font-sans">Oversold (Buy):</span>
                          <input 
                            type="number"
                            min="10"
                            max="45"
                            value={strategy.indicators.find(i => i.type === 'RSI')?.params.oversold || 30}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 30;
                              updateStrategyValue((prev) => {
                                const map = prev.indicators.map(ind => ind.type === 'RSI' ? { ...ind, params: { ...ind.params, oversold: val } } : ind);
                                return { ...prev, indicators: map };
                              }, true);
                            }}
                            className="w-full bg-bg border border-border-dim px-1.5 py-0.5 text-[10px] font-mono text-accent-blue rounded-sm focus:outline-none"
                          />
                        </div>
                        <div>
                          <span className="text-text-dim block mb-0.5 font-sans">Overbought (Sell):</span>
                          <input 
                            type="number"
                            min="55"
                            max="90"
                            value={strategy.indicators.find(i => i.type === 'RSI')?.params.overbought || 70}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 70;
                              updateStrategyValue((prev) => {
                                const map = prev.indicators.map(ind => ind.type === 'RSI' ? { ...ind, params: { ...ind.params, overbought: val } } : ind);
                                return { ...prev, indicators: map };
                              }, true);
                            }}
                            className="w-full bg-bg border border-border-dim px-1.5 py-0.5 text-[10px] font-mono text-accent-blue rounded-sm focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* SMA Dual Crossover settings wrapper */}
                <div className={`p-2 rounded-sm border transition ${isIndicatorActive('SMA') ? 'bg-bg/60 border-border-dim' : 'bg-transparent border-transparent opacity-50'}`}>
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-text-bright">
                      <input 
                        type="checkbox"
                        checked={isIndicatorActive('SMA')}
                        onChange={() => toggleIndicatorEnabled('SMA')}
                        className="rounded-sm accent-accent-blue"
                      />
                      SMA Double Crossover
                    </label>
                    {isIndicatorActive('SMA') && (
                      <span className="font-mono text-[9px] bg-accent-blue/10 border border-accent-blue/20 text-accent-blue px-1 rounded-sm">ACTIVE</span>
                    )}
                  </div>

                  {isIndicatorActive('SMA') && (
                    <div className="space-y-1.5 mt-2 pl-3.5 text-[11px]">
                      <div>
                        <div className="flex justify-between text-[10px] text-text-dim mb-0.5">
                          <span>Short (SMA Fast) Period:</span>
                          <span className="font-mono text-accent-blue">{strategy.indicators.find(i => i.type === 'SMA')?.params.shortPeriod || 50}</span>
                        </div>
                        <input 
                          type="range" 
                          min="5" 
                          max="100"
                          value={strategy.indicators.find(i => i.type === 'SMA')?.params.shortPeriod || 50}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateStrategyValue((prev) => {
                              const map = prev.indicators.map(ind => ind.type === 'SMA' ? { ...ind, params: { ...ind.params, shortPeriod: val } } : ind);
                              return { ...prev, indicators: map };
                            }, true);
                          }}
                          className="w-full h-1 bg-bg accent-accent-blue"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] text-text-dim mb-0.5">
                          <span>Long (SMA Slow) Period:</span>
                          <span className="font-mono text-accent-blue">{strategy.indicators.find(i => i.type === 'SMA')?.params.longPeriod || 200}</span>
                        </div>
                        <input 
                          type="range" 
                          min="100" 
                          max="350"
                          value={strategy.indicators.find(i => i.type === 'SMA')?.params.longPeriod || 200}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateStrategyValue((prev) => {
                              const map = prev.indicators.map(ind => ind.type === 'SMA' ? { ...ind, params: { ...ind.params, longPeriod: val } } : ind);
                              return { ...prev, indicators: map };
                            }, true);
                          }}
                          className="w-full h-1 bg-bg accent-accent-blue"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* MACD Settings Checkbox Box */}
                <div className={`p-2 rounded-sm border transition ${isIndicatorActive('MACD') ? 'bg-bg/60 border-border-dim' : 'bg-transparent border-transparent opacity-50'}`}>
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-text-bright">
                      <input 
                        type="checkbox"
                        checked={isIndicatorActive('MACD')}
                        onChange={() => toggleIndicatorEnabled('MACD')}
                        className="rounded-sm accent-accent-blue"
                      />
                      MACD Histogram
                    </label>
                  </div>

                  {isIndicatorActive('MACD') && (
                    <div className="space-y-1.5 mt-2 pl-3.5 text-[11px]">
                      <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                        <div>
                          <span className="text-text-dim block mb-0.5">Fast EMA:</span>
                          <input 
                            type="number"
                            value={strategy.indicators.find(i => i.type === 'MACD')?.params.fastPeriod || 12}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 12;
                              updateStrategyValue((prev) => {
                                const map = prev.indicators.map(ind => ind.type === 'MACD' ? { ...ind, params: { ...ind.params, fastPeriod: val } } : ind);
                                return { ...prev, indicators: map };
                              }, true);
                            }}
                            className="w-full bg-bg border border-border-dim px-1 py-0.5 text-[10px] font-mono text-accent-blue rounded-sm focus:outline-none"
                          />
                        </div>
                        <div>
                          <span className="text-text-dim block mb-0.5">Slow EMA:</span>
                          <input 
                            type="number"
                            value={strategy.indicators.find(i => i.type === 'MACD')?.params.slowPeriod || 26}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 26;
                              updateStrategyValue((prev) => {
                                const map = prev.indicators.map(ind => ind.type === 'MACD' ? { ...ind, params: { ...ind.params, slowPeriod: val } } : ind);
                                return { ...prev, indicators: map };
                              }, true);
                            }}
                            className="w-full bg-bg border border-border-dim px-1 py-0.5 text-[10px] font-mono text-accent-blue rounded-sm focus:outline-none"
                          />
                        </div>
                        <div>
                          <span className="text-text-dim block mb-0.5">Signal:</span>
                          <input 
                            type="number"
                            value={strategy.indicators.find(i => i.type === 'MACD')?.params.signalPeriod || 9}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 9;
                              updateStrategyValue((prev) => {
                                const map = prev.indicators.map(ind => ind.type === 'MACD' ? { ...ind, params: { ...ind.params, signalPeriod: val } } : ind);
                                return { ...prev, indicators: map };
                              }, true);
                            }}
                            className="w-full bg-bg border border-border-dim px-1 py-0.5 text-[10px] font-mono text-accent-blue rounded-sm focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bollinger Bands settings wrapper */}
                <div className={`p-2 rounded-sm border transition ${isIndicatorActive('BB') ? 'bg-bg/60 border-border-dim' : 'bg-transparent border-transparent opacity-50'}`}>
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-text-bright">
                      <input 
                        type="checkbox"
                        checked={isIndicatorActive('BB')}
                        onChange={() => toggleIndicatorEnabled('BB')}
                        className="rounded-sm accent-accent-blue"
                      />
                      Bollinger Bands
                    </label>
                  </div>

                  {isIndicatorActive('BB') && (
                    <div className="space-y-1.5 mt-2 pl-3.5 text-[11px]">
                      <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                        <div>
                          <span className="text-text-dim block mb-0.5 font-sans">Period:</span>
                          <input 
                            type="number"
                            value={strategy.indicators.find(i => i.type === 'BB')?.params.period || 20}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 20;
                              updateStrategyValue((prev) => {
                                const map = prev.indicators.map(ind => ind.type === 'BB' ? { ...ind, params: { ...ind.params, period: val } } : ind);
                                return { ...prev, indicators: map };
                              }, true);
                            }}
                            className="w-full bg-bg border border-border-dim px-1 py-0.5 text-[10px] font-mono text-accent-blue rounded-sm focus:outline-none"
                          />
                        </div>
                        <div>
                          <span className="text-text-dim block mb-0.5 font-sans">StdDev:</span>
                          <input 
                            type="number"
                            step="0.1"
                            value={strategy.indicators.find(i => i.type === 'BB')?.params.stdDev || 2}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 2;
                              updateStrategyValue((prev) => {
                                const map = prev.indicators.map(ind => ind.type === 'BB' ? { ...ind, params: { ...ind.params, stdDev: val } } : ind);
                                return { ...prev, indicators: map };
                              }, true);
                            }}
                            className="w-full bg-bg border border-border-dim px-1 py-0.5 text-[10px] font-mono text-accent-blue rounded-sm focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Logical Evaluator statement display */}
              <div className="bg-bg p-2 rounded-sm border border-border-dim font-mono text-[10px]">
                <span className="text-[9px] text-text-dim uppercase font-bold block mb-0.5">Active Quant Logic Rationale</span>
                <p className="text-accent-blue italic leading-snug line-clamp-2">
                  "{strategy.logic}"
                </p>
              </div>

              {/* Run immediate simulation compiler and execute */}
              <button 
                onClick={() => triggerBacktest(strategy)}
                disabled={loading}
                className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white border-0 py-2.5 rounded-sm font-mono text-[11px] font-bold cursor-pointer transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" /> COMPILING STRATEGY...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current text-white" /> COMPILE & RUN BACKTEST
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT PANEL COLUMN (CHARTS, LEDGER, METRICS SHEET) */}
        <section className="lg:col-span-8 flex flex-col gap-3 overflow-hidden" id="analytics_column">
          
          {/* BENTO-GRID PERFORMANCE METRICS DECK */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" id="quant_bento_metrics">
            
            {/* Metric Card 1: Cumulative Returns */}
            <div className="bg-sidebar border border-border-dim rounded-sm p-3 flex flex-col justify-between shadow-xs relative overflow-hidden">
              <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-text-dim">Cumulative Return</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-xl font-bold font-mono leading-tight ${(!results || results.metrics.totalReturn >= 0) ? 'text-success-green' : 'text-danger-red'}`}>
                  {results ? `${results.metrics.totalReturn >= 0 ? '+' : ''}${results.metrics.totalReturn.toFixed(1)}%` : '0.00%'}
                </span>
              </div>
              <p className="text-[10px] text-text-dim mt-0.5 font-mono">
                Final Capital: ${results ? results.metrics.finalCapital.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '100,000.00'}
              </p>
            </div>

            {/* Metric Card 2: Drawdown */}
            <div className="bg-sidebar border border-border-dim rounded-sm p-3 flex flex-col justify-between shadow-xs relative overflow-hidden">
              <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-text-dim">Max Drawdown</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono leading-tight text-danger-red">
                  {results ? `-${results.metrics.maxDrawdown.toFixed(2)}%` : '0.00%'}
                </span>
              </div>
              <p className="text-[10px] text-text-dim mt-0.5 font-mono">Peak-to-Trough drawdown</p>
            </div>

            {/* Metric Card 3: Sharpe Ratio */}
            <div className="bg-sidebar border border-border-dim rounded-sm p-3 flex flex-col justify-between shadow-xs relative overflow-hidden">
              <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-text-dim">Sharpe Ratio (Rf=0)</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono leading-tight text-accent-blue">
                  {results ? results.metrics.sharpeRatio.toFixed(3) : '0.000'}
                </span>
              </div>
              <p className="text-[10px] text-text-dim mt-0.5 font-mono">Trade-risk adjusted ratio</p>
            </div>

            {/* Metric Card 4: Hit win rate ratio */}
            <div className="bg-sidebar border border-border-dim rounded-sm p-3 flex flex-col justify-between shadow-xs relative overflow-hidden">
              <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-text-dim">Hit Rate (WinRatio)</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono leading-tight text-success-green">
                  {results ? `${results.metrics.winRate.toFixed(1)}%` : '0.0%'}
                </span>
                <span className="text-[10px] text-text-dim font-mono">
                  ({results ? results.metrics.profitableTrades : 0}/{results ? results.metrics.totalTrades : 0} tr)
                </span>
              </div>
              <div className="w-full bg-bg h-1 rounded-sm overflow-hidden mt-1 flex border border-border-dim/50">
                <span 
                  className="bg-success-green h-full transition-all duration-500" 
                  style={{ width: `${results ? results.metrics.winRate : 0}%` }}
                ></span>
              </div>
            </div>
          </div>

          {/* DYNAMIC MULTI-PANE CHART PLATFORM */}
          <div className="flex-1 min-h-[350px] relative flex flex-col" id="charting_platform">
            {candles.length > 0 ? (
              <ChartComponent 
                candles={candles} 
                trades={results ? results.trades : []}
                activeIndicators={{
                  rsi: isIndicatorActive('RSI'),
                  sma: isIndicatorActive('SMA'),
                  macd: isIndicatorActive('MACD'),
                  bb: isIndicatorActive('BB'),
                }}
              />
            ) : (
              <div className="w-full h-full min-h-[480px] rounded-sm border border-border-dim bg-sidebar flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 text-text-dim animate-spin" />
                <p className="text-xs font-mono text-text-dim">Retrieving candle arrays from Binance ledger nodes...</p>
              </div>
            )}
          </div>

          {/* TRANS-LEDGER LOGS PANEL */}
          <div className="bg-sidebar border border-border-dim rounded-sm overflow-hidden shadow h-[250px] flex flex-col">
            <div className="bg-white/[0.02] border-b border-border-dim px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-accent-blue" />
                <h2 className="text-xs uppercase font-mono font-bold text-text-bright tracking-wider">Historical Transaction Ledger</h2>
              </div>
              
              <button 
                onClick={downloadCSV}
                disabled={!results || results.trades.length === 0}
                className="bg-bg border border-border-dim hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-text-bright font-mono text-[10px] font-bold px-2.5 py-1 rounded-sm transition flex items-center gap-1.5"
                id="csv_download_button"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-success-green" /> DOWNLOAD CSV
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-bg" id="trade_ledger_scrollable">
              {results && results.trades.length > 0 ? (
                <table className="w-full text-left font-mono border-collapse">
                  <thead className="bg-[#101014] text-[10px] text-text-dim sticky top-0 border-b border-border-dim border-collapse">
                    <tr>
                      <th className="p-2.5 pl-4">ID</th>
                      <th className="p-2.5">SIGNAL / ASSET</th>
                      <th className="p-2.5">ENTRY PRICE</th>
                      <th className="p-2.5">EXIT PRICE</th>
                      <th className="p-2.5">REASON</th>
                      <th className="p-2.5 text-right">PNL</th>
                      <th className="p-2.5 text-right pr-4">PnL YIELD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim/60 text-xs">
                    {results.trades.map((trade) => (
                      <tr key={trade.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-2.5 pl-4 text-[10px] text-text-dim">#{trade.id.replace('trade_', '')}</td>
                        <td className="p-2.5 font-bold text-text-bright">
                          <span className="text-success-green text-[9px] font-bold bg-success-green/10 border border-success-green/20 px-1 py-0.5 rounded-sm mr-1.5 align-middle">BUY LONG</span> {strategy.symbol}
                        </td>
                        <td className="p-2.5 text-text-bright">${trade.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                        <td className="p-2.5 text-text-bright">${trade.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                        <td className="p-2.5">
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wide rounded-sm ${
                            trade.exitReason === 'TAKE_PROFIT' 
                              ? 'bg-success-green/10 text-success-green border border-success-green/20' 
                              : trade.exitReason === 'STOP_LOSS' 
                                ? 'bg-danger-red/10 text-danger-red border border-danger-red/20'
                                : trade.exitReason === 'SIGNAL_REVERSAL'
                                  ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                                  : 'bg-bg text-text-dim border border-border-dim'
                          }`}>
                            {trade.exitReason.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={`p-2.5 text-right font-bold ${trade.pnl >= 0 ? 'text-success-green' : 'text-danger-red'}`}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`p-2.5 text-right pr-4 font-bold ${trade.pnlPercent >= 0 ? 'text-success-green' : 'text-danger-red'}`}>
                          {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-text-dim" id="empty_ledger_message">
                  <AlertTriangle className="w-5 h-5 text-accent-blue mb-1" />
                  <p className="text-xs font-mono">No simulation trades generated in this frame window.</p>
                  <p className="text-[10px] text-text-dim max-w-sm mt-0.5 font-mono">
                    Adjust triggers (e.g., enable RSI, cross thresholds) & click "Compile & Run Backtest".
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

      </main>

      {/* FLOAT TOAST ALERT PANEL */}
      <div className="fixed bottom-3 right-3 z-50 flex flex-col gap-1.5 max-w-xs w-full pointer-events-none" id="toasts_deck">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              layout
              key={toast.id}
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ type: 'spring', stiffness: 450, damping: 25 }}
              className={`pointer-events-auto p-2.5 rounded-sm border shadow-md flex items-center justify-between gap-2 bg-[#0C0C0F] border-border-dim text-text-bright`}
            >
              <div className="flex items-center gap-2 font-mono text-[10px]">
                {toast.type === 'success' && <span className="w-1.5 h-1.5 rounded-full bg-success-green" />}
                {toast.type === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-danger-red animate-ping" />}
                {toast.type === 'info' && <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" />}
                <span className="leading-tight">{toast.message}</span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setToasts(prev => prev.filter(t => t.id !== toast.id));
                }}
                className="text-text-dim hover:text-white cursor-pointer p-0.5 rounded border-none bg-transparent"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
