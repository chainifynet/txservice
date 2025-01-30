import { AppCtx, AxiosRequestConfig } from "@chainifynet/common-libs-node";
import { getAssetData } from "../../common/asset";
import { newErrWithCode } from "../../common/errs";
import { isTestnet, tatumAPIKeyTestnet, tatumAPIKeyV4, tatumCallbackUrl, tatumUrlV4 } from "../../config/variables";

/**
 * Use for v3 tatum api (currently used for tron only)
 */
export const createAddressSubscription = async (
  appCtx: AppCtx,
  address: string,
  nativeAssetId: string,
  tatumAPIKey: string,
  tatumUrl: string
): Promise<string> => {
  return appCtx.API.post(
    `${tatumUrl}/v3/subscription`,
    {
      type: "ADDRESS_TRANSACTION",
      attr: {
        address,
        chain: toTatumChain(nativeAssetId),
        url: tatumCallbackUrl,
      },
    },
    getConfig(tatumAPIKey, nativeAssetId)
  )
    .then((res) => res.data.id)
    .catch((e) => {
      if (e.response?.data?.errorCode?.includes("subscription.exists")) {
        // subscription already there
        appCtx.log.error(`tatum subscription already exists for ${address} & ${nativeAssetId}`);
        return null;
      }
      appCtx.log.error(e, "error creating tatum subscription");
      throw e;
    });
};

/**
 * Use for v4 tatum api (currently tron and bitcoin supported) for evm use moralis
 *
 * Problems: we only get the notification on the first confirmation, not on the mempool!
 * They will send one notification per output, so if there is two outputs they will send another one with output 1
 * BTC payload example:
 * ```json
 * {
 *   "address": "tb1qkakvce045r0pw2wzkpr5ej0p4x7fesnl528ktd",
 *   "amount": "0.0002",
 *   "asset": "BTC",
 *   "blockNumber": 2474706,
 *   "txId": "aa9d31069a5aa41550340ebb8b803bb78c1b837e937c935511e0b3525a35c0a3",
 *   "index": 0,
 *   "type": "native",
 *   "subscriptionType": "ADDRESS_EVENT"
 * }
 * ```
 */
export const createAddressSubscriptionV4 = async (
  appCtx: AppCtx,
  address: string,
  nativeAssetId: string
): Promise<string> => {
  const conf: AxiosRequestConfig = {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": tatumAPIKeyV4,
      type: isTestnet ? "testnet" : "mainnet",
    },
    external: true,
  };

  return appCtx.API.post(
    `${tatumUrlV4}/subscription`,
    {
      type: "ADDRESS_EVENT",
      attr: {
        address,
        chain: toTatumChain(nativeAssetId),
        url: tatumCallbackUrl,
      },
    },
    conf
  )
    .then((res) => res.data.id)
    .catch((e) => {
      if (e.response?.data?.errorCode?.includes("subscription.exists")) {
        // subscription already there
        appCtx.log.error(`tatum subscription already exists for ${address} & ${nativeAssetId}`);
        return null;
      }
      appCtx.log.error(e, "error creating tatum subscription");
      throw e;
    });
};

/**
 * For a list of assets see {@link https://github.com/tatumio/tatum-js/blob/master/src/dto/Network.ts#L1}
 * @param nativeAssetId The native asset id
 * @returns The tatum asset
 */
function toTatumChain(nativeAssetId: string): string {
  switch (nativeAssetId) {
    case "TRX":
    case "TRX_SHASTA":
      return "TRON";
    case "BTC":
    case "BTC_TESTNET":
      return "BTC";
    default:
      throw newErrWithCode(`unsupported subscription chain: ${nativeAssetId}`, 400);
  }
}

function getConfig(tatumAPIKey: string, nativeAssetId: string) {
  const asset = getAssetData(nativeAssetId);
  const apiKey = asset.testnet ? tatumAPIKeyTestnet : tatumAPIKey;
  const config = {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    external: true,
  } as Record<string, any>;
  return config;
}
