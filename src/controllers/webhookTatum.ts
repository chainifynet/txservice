import { getAssetData } from "../common/asset";
import { isTestnet, tatumHmacSecret } from "../config/variables";
import * as watcherClient from "../services/client/watcher";
import { TatumWebhook } from "../types/types";
import { KoaCtx } from "@chainifynet/common-libs-node";
import { createHmac } from "crypto";

// prettier-ignore
const supportedTatumAssets = isTestnet
  ? ["TRON", getContractAddress("USDT_TRX_SHASTA")]
  : ["TRON", "USDT_TRON"];

export const tatumWebhook = async (ctx: KoaCtx): Promise<void> => {
  // https://docs.tatum.io/rest/subscriptions/b3A6MjgwMDMzMjY-enable-hmac-webhook-digest
  const body = <TatumWebhook>ctx.request.body;
  const hmacHeader = ctx.request.headers["x-payload-hash"];
  if (hmacHeader !== createHmac('sha512', tatumHmacSecret).update(JSON.stringify(body)).digest('base64')) {
    ctx.throw(401, "Unauthorized");
  }
  if (isSupported(body.asset)) {
    await watcherClient.sendTatumWebhook(ctx.appCtx, body);
    ctx.body = {
      status: "ok",
      message: `accepted asset ${body.asset} for processing`,
    };
  } else if (body.asset === "BTC") {
    await watcherClient.sendUTXOWebhook(ctx.appCtx, {
      assetId: isTestnet ? "BTC_TESTNET" : "BTC",
      txHash: body.txId,
      blockNumber: Number(body.blockNumber),
    });
    ctx.body = {
      status: "ok",
      message: `accepted asset ${body.asset} for processing`,
    };
  } else {
    ctx.appCtx.log.debug({ asset: body.asset, event: "unknown_asset" }, `unknown asset ${body.asset}, skip watcher`);
    ctx.body = {
      status: "ok",
      message: `unsupported asset ${body.asset}`,
    };
  }
};
function isSupported(tatumAsset?: string) {
  if (!tatumAsset) return false;
  return supportedTatumAssets.includes(tatumAsset) || supportedTatumAssets.includes(tatumAsset.toUpperCase());
}
function getContractAddress(assetId: string) {
  return getAssetData(assetId).contractAddress;
}

