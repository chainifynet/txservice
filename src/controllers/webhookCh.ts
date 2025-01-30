import { isTestnet } from "../config/variables";
import * as watcherClient from "../services/client/watcher";
import { KoaCtx } from "@chainifynet/common-libs-node";

export const chWebhook = async (ctx: KoaCtx): Promise<void> => {
  const body = <WhData>ctx.request.body;
  if (body.test) {
    ctx.body = {
      ok: true,
      message: "test webhook received",
    };
    return;
  }
  if (isSupported(body.coin, body.network)) {
    await watcherClient.sendUTXOWebhook(ctx.appCtx, {
      assetId: isTestnet ? "BTC_TESTNET" : "BTC",
      txHash: body.txId,
      blockNumber: Number(body.blockHeight),
    });
    ctx.body = {
      status: "ok",
      message: `accepted asset ${body.coin} ${body.network} for processing`,
    };
  } else {
    ctx.appCtx.log.debug(
      { asset: body.coin, network: body.network, event: "unknown_asset" },
      `unknown asset ${body.coin}, skip watcher`
    );
    ctx.body = {
      status: "ok",
      message: `unsupported asset ${body.coin}`,
    };
  }
};

function isSupported(asset?: string, network?: string) {
  return asset === "btc" && isTestnet ? network === "testnet" : network === "mainnet";
}

type WhData = {
  addresses: string[];
  tx: Record<string, unknown>;
  txId: string;
  confs: number;
  coin: "btc";
  network: "mainnet" | "testnet";
  blockHash?: string;
  blockHeight?: number;
  test?: boolean; // creating the webhook
};
