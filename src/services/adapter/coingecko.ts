import { newErrWithCode } from "../../common/errs";
import { coingeckoUrl, isTestnet } from "../../config/variables";
import { AppCtx } from "@chainifynet/common-libs-node";

export const getPrices = async (appCtx: AppCtx, currencies: string[], vsCurrencies: string[]) => {
  const cgCurrencies = currencies.map(toCoinGeckoAsset);
  try {
    const resp = await appCtx.API.get(`${coingeckoUrl}/simple/price`, {
      headers: {
        "Content-Type": "application/json",
      },
      params: {
        ids: cgCurrencies.join(","),
        vs_currencies: vsCurrencies.map((v) => v.toLowerCase()).join(","),
      },
      external: true,
    });
    return mapToCfResponse(resp.data);
  } catch (err) {
    appCtx.log.error(err);
    throw newErrWithCode("failed to get rates", 500);
  }
};

/** Keep in sync with the supportted assets */
const cfAssetToCgAsset = {
  TRX: "tron",
  USDT_TRX: "tether",
  ETH: "ethereum",
  USDT_ETH: "tether",
  USDC_ETH: "usd-coin",
  BAT_ETH: "basic-attention-token",
} as Record<string, string>;

const cfAssetToCgAssetTestnet = {
  TRX_SHASTA: "tron",
  USDT_TRX_SHASTA: "tether",
  ETH_GOERLI: "ethereum",
  USDC_ETH_GOERLI: "usd-coin",
} as Record<string, string>;

const cgAssetToCfAssets = (() => {
  const result: Record<string, string[]> = {};
  const cfToCgAsset = isTestnet ? cfAssetToCgAssetTestnet : cfAssetToCgAsset;
  Object.entries(cfToCgAsset).forEach(([cfAsset, cgAsset]) => {
    if (!result[cgAsset]) {
      result[cgAsset] = [];
    }
    result[cgAsset].push(cfAsset);
  });
  return result;
})();

function toCoinGeckoAsset(assetId: string): string {
  const cfToCgAsset = isTestnet ? cfAssetToCgAssetTestnet : cfAssetToCgAsset;
  const cgAsset = cfToCgAsset[assetId];
  if (!cgAsset) {
    throw newErrWithCode(`asset ${assetId} not supported`, 400);
  }
  return cgAsset;
}

function toChainifyAssets(currency: string): string[] {
  const cfAssets = cgAssetToCfAssets[currency];
  if (!cfAssets) {
    throw newErrWithCode(`asset not supported`, 400);
  }
  return cfAssets;
}

function mapToCfResponse(cgResponse: Record<string, Record<string, string>>) {
  const result: Record<string, Record<string, string>> = {};
  Object.entries(cgResponse).forEach((entry) => {
    const fiat: Record<string, string> = {};
    Object.entries(entry[1]).forEach((fiatEntry) => {
      fiat[fiatEntry[0].toUpperCase()] = fiatEntry[1];
    });

    const cfAssets = toChainifyAssets(entry[0]);
    cfAssets.forEach((cfAsset) => {
      result[cfAsset] = fiat;
    });
  });
  return result;
}
