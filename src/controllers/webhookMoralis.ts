import { KoaCtx } from "@chainifynet/common-libs-node";
import { getAssetData } from "../common/asset";
import { isTestnet } from "../config/variables";
import { validateWebhookSignature } from "../services/client/moralis";
import { MoralisWebhook } from "../types/moralis";
import * as watcherClient from "../services/client/watcher";

const supportedMoralisChains = isTestnet ? ["0x5", "0x61"] : ["0x1", "0x38"];
const supportedMoralisAssets = isTestnet
  ? [getContractAddress("USDC_ETH_GOERLI"), getContractAddress("BUSD_BNB_TESTNET")]
  : [
      getContractAddress("USDT_ETH"),
      getContractAddress("USDC_ETH"),
      getContractAddress("BAT_ETH"),
      getContractAddress("BUSD_BNB"),
    ];

export const moralisWebhook = async (ctx: KoaCtx): Promise<void> => {
  const body = <MoralisWebhook>ctx.request.body;
  const signature = <string>ctx.headers["x-signature"];
  validateWebhookSignature(body, signature);

  // TODO save in Dynamo to allow replays easily, this has data on internal txs but there is no API to get the internal ones so it is best just to keep the original webhook body
  ctx.log.info({ body }, "moralis webhook");
  if (hasSupportedTransfers(body)) {
    await watcherClient.sendMoralisWebhook(ctx.appCtx, body);
    ctx.body = {
      status: "ok",
      message: `accepted for processing`,
    };
  } else {
    ctx.appCtx.log.debug(
      {
        event: "unsupported_chain_or_tokens",
        chain: body.chainId,
        erc20Tokens: body.erc20Transfers?.map((t) => ({ contract: t.contract, tokenSymbol: t.tokenSymbol })),
      },
      `unsupported chain or tokents, skip watcher`
    );
    ctx.body = {
      status: "ok",
      message: `unsupported`,
    };
  }
};

function hasSupportedTransfers(payload: MoralisWebhook): boolean {
  if (!supportedMoralisChains.includes(payload.chainId)) {
    return false;
  }
  if (!payload.erc20Transfers?.length) {
    return true;
  }
  for (const erc20Transfer of payload.erc20Transfers) {
    if (supportedMoralisAssets.includes(erc20Transfer.contract)) {
      return true;
    }
  }
  return false;
}

function getContractAddress(assetId: string) {
  return getAssetData(assetId).contractAddress.toLocaleLowerCase();
}
