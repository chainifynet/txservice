import * as Big from "big.js";
import * as krakenAdapter from "./adapter/kraken";
import { getAssetData } from "../common/asset";
import { AppCtx } from "@chainifynet/common-libs-node";

export const getPrices = async (appCtx: AppCtx, currencies: string[], vsCurrencies: string[] = []) => {
  if (!vsCurrencies?.length) {
    vsCurrencies = ["USD"];
  }
  const prices = await appCtx.cache.get(
    "prices",
    // request all to cache, for now it is ok since we don't have that many
    () => krakenAdapter.getPrices(appCtx),
    300 // 5 minutes
  );
  return filterPrices(prices, currencies, vsCurrencies);
};

export const toUSD = async (appCtx: AppCtx, ammount: string, assetId: string): Promise<string | undefined> => {
  try {
    if (Big(ammount).eq(0)) {
      return "0";
    }
    const prices = await getPrices(appCtx, [assetId]);
    const price = prices?.[assetId]?.USD;
    if (!price) {
      return undefined;
    }
    return fromNativeAmount(ammount, assetId).times(price).toFixed(2);
  } catch (err) {
    appCtx.log.error(err, "failed to convert to USD");
    return undefined;
  }
};

function fromNativeAmount(amount: string | number, assetId: string): Big {
  const asset = getAssetData(assetId);
  if (!asset) {
    throw new Error(`unknown asset ${assetId}`);
  }
  return Big(amount).div(Big(10).pow(asset.decimals));
}

function filterPrices(
  prices: Record<string, Record<string, string>>,
  currencies: string[] = [],
  vsCurrencies: string[] = []
) {
  const result: Record<string, Record<string, string>> = {};

  Object.entries(prices).forEach((entry) => {
    const fiat: Record<string, string> = {};
    Object.entries(entry[1]).forEach((fiatEntry) => {
      if (vsCurrencies.includes(fiatEntry[0])) {
        fiat[fiatEntry[0]] = fiatEntry[1];
      }
    });
    if (!currencies.length || (currencies.includes(entry[0]) && Object.keys(fiat).length > 0)) {
      result[entry[0]] = fiat;
    }
  });

  return result;
}
