import * as WAValidator from "multicoin-address-validator";
import { isTestnet } from "../config/variables";
import { Asset, AssetType } from "../types/types";
import { newErrWithCode } from "./errs";


// GLOBAL assets loaded in memory
const assets: Record<string, Asset> = {};

export function populateGlobalAssetCache(assetsData: Asset[]) {
  for (const asset of assetsData) {
    assets[asset.assetId] = asset;
  }
}

/**
 * List of supported fiat currencies currently just to provide prices
 */
export const supportedFiatCurrencies = ["USD"];

export const getAssetData = (assetId: string): Asset => {
  const asset = assets[assetId];
  if (!asset) {
    throw newErrWithCode(`asset ${assetId} not supported`, 400);
  }
  return asset;
};

export const getSupportedAssetIds = (): string[] => {
  return Object.keys(assets);
}

// ===================================================
// Helpers

export const isETH = (assetId: string): boolean => {
  const asset = getAssetData(assetId);
  if (isTestnet) {
    return ["ETH_GOERLI"].includes(asset.assetId);
  }
  return asset.assetId === "ETH";
};

export const isBNB = (assetId: string): boolean => {
  const asset = getAssetData(assetId);
  if (isTestnet) {
    return ["BNB_TESTNET"].includes(asset.assetId);
  }
  return asset.assetId === "BNB";
};

export const isBTC = (assetId: string): boolean => {
  const asset = getAssetData(assetId);
  if (isTestnet) {
    return ["BTC_TESTNET"].includes(asset.assetId);
  }
  return asset.assetId === "BTC";
};

export const isERC20 = (assetId: string): boolean => {
  const asset = getAssetData(assetId);
  return asset.assetType === AssetType.ERC20;
};

export const isETHOrERC20 = (assetId: string): boolean => {
  const asset = getAssetData(assetId);
  if (isERC20(assetId)) {
    return true;
  }
  if (isTestnet) {
    return ["ETH_GOERLI"].includes(asset.assetId);
  }
  return asset.assetId === "ETH";
};

export const isTRX = (assetId: string): boolean => {
  const asset = getAssetData(assetId);
  if (isTestnet) {
    return ["TRX", "TRX_SHASTA"].includes(asset.assetId);
  }
  return asset.assetId === "TRX";
};

export const isTRC20 = (assetId: string): boolean => {
  const asset = getAssetData(assetId);
  return asset.assetType === AssetType.TRC20;
};

export const isTRXOrTRC20 = (assetId: string): boolean => {
  const asset = getAssetData(assetId);
  if (isTRC20(asset.assetId)) {
    return true;
  }
  if (isTestnet) {
    return ["TRX", "TRX_SHASTA"].includes(asset.assetId);
  }
  return asset.assetId === "TRX";
};

export const getAssetContract = (assetId: string): string => {
  const asset = getAssetData(assetId);
  if (!asset) {
    throw newErrWithCode("asset not supported", 400);
  }
  if (!asset.contractAddress) {
    throw newErrWithCode("asset is not a token", 400);
  }
  return asset.contractAddress;
};

export const validateAddress = (address: string, assetId: string) => {
  const asset = getAssetData(assetId);
  if (!asset) {
    throw newErrWithCode("asset not supported", 400);
  }
  let symbol = asset.symbol;
  if (asset.assetType !== AssetType.NATIVE) {
    symbol = getAssetData(asset.nativeAsset)?.symbol;
  }
  if (!WAValidator.validate(address, symbol.toLowerCase(), isTestnet ? "testnet" : "prod")) {
    throw newErrWithCode(`invalid ${assetId} address`, 400);
  }
};
