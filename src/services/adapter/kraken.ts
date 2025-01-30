import { AppCtx } from "@chainifynet/common-libs-node";
import { isTestnet } from "../../config/variables";

/**
 * Requesting all for now
 * @param appCtx
 * @returns
 */
export async function getPrices(appCtx: AppCtx): Promise<Record<string, Record<string, string>>> {
  const res = await appCtx.API.get("https://api.kraken.com/0/public/Ticker", {
    headers: {
      "Content-Type": "application/json",
    },
    params: {
      pair: "XXBTZUSD,XETHZUSD,TRXUSD,USDTZUSD,USDCUSD,BATUSD,XLTCZUSD,BCHUSD",
    },
    external: true,
  });
  const data = <ApiResponse>res.data;
  return parseResponse(data);
}

function parseResponse(res: ApiResponse): Record<string, Record<string, string>> {
  if (isTestnet) {
    return {
      TRX_SHASTA: usd(res, "TRXUSD"),
      USDT_TRX_SHASTA: usd(res, "USDTZUSD"),
      ETH_GOERLI: usd(res, "XETHZUSD"),
      USDC_ETH_GOERLI: usd(res, "USDCUSD"),
      BTC_TESTNET: usd(res, "XXBTZUSD"),
    };
  }
  return {
    TRX: usd(res, "TRXUSD"),
    USDT_TRX: usd(res, "USDTZUSD"),
    ETH: usd(res, "XETHZUSD"),
    USDT_ETH: usd(res, "USDTZUSD"),
    USDC_ETH: usd(res, "USDCUSD"),
    BAT_ETH: usd(res, "BATUSD"),
    BTC: usd(res, "XXBTZUSD"),
  };
}

function usd(res: ApiResponse, name: string) {
  return { USD: res?.result?.[name]?.b?.[0] };
}

interface ApiResponse {
  result: {
    [key: string]: {
      a: string[];
      b: string[];
      c: string[];
      v: string[];
      p: string[];
      t: number[];
      l: string[];
      h: string[];
      o: string;
    };
  };
  error: string[];
}
