import { Candle } from './types';

/**
 * Fetches historical candle data (klines) from Binance.
 * Tries the Futures (fapi) endpoint first as requested, falling back to Spot if needed.
 */
export async function fetchKlines(
  symbol: string,
  timeframe: string,
  limit: number = 1000
): Promise<Candle[]> {
  const cleanSymbol = symbol.trim().toUpperCase().replace('/', '');
  
  const urls = [
    `https://fapi.binance.com/fapi/v1/klines?symbol=${cleanSymbol}&interval=${timeframe}&limit=${limit}`,
    `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=${timeframe}&limit=${limit}`
  ];

  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 6000); // 6 sec timeout
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`Binance API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Binance response is not an array');
      }

      // Format of klines in Binance is array of arrays:
      // [
      //   [
      //     1499040000000,      // Open time
      //     "0.01634790",       // Open
      //     "0.80000000",       // High
      //     "0.01575800",       // Low
      //     "0.01577100",       // Close
      //     "148976.11400000",  // Volume
      //     ...
      //   ]
      // ]
      const candles: Candle[] = data.map((item: any) => ({
        time: Number(item[0]), // millisecond timestamp
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),
      }));

      if (candles.length === 0) {
        throw new Error('No candle data returned');
      }

      return candles;
    } catch (err: any) {
      console.warn(`Failed fetch on ${url}:`, err);
      lastError = err;
    }
  }

  throw lastError || new Error(`Failed to fetch market data for ${symbol}`);
}

/**
 * Interacts with Pollinations AI chat completion endpoint.
 */
export async function askPollinationsAI(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
): Promise<string> {
  const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai',
      messages: messages,
      temperature: 0.1, // more deterministic responses
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Pollinations AI error (${response.status}): ${errorText || 'Server error'}`);
  }

  const result = await response.json();
  const text = result?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('No content returned from AI');
  }

  return text;
}
