import { sqsClient } from "../../config/aws";
import { watchQueueUrl } from "../../config/variables";
import { TatumWebhook } from "../../types/types";
import { AppCtx } from "@chainifynet/common-libs-node";
import { MoralisWebhook } from "../../types/moralis";

export const sendTatumWebhook = async (appCtx: AppCtx, payload: TatumWebhook) => {
  appCtx.log.debug(`sending tatum message in the queue ${payload.txId}`);
  await sendWebhook(appCtx, "tatumwebhook", payload);
};

export const sendUTXOWebhook = async (appCtx: AppCtx, payload: UTXOWebhook) => {
  appCtx.log.debug(`sending utxo message in the queue ${payload.txHash}`);
  await sendWebhook(appCtx, "utxowebhook", payload);
};

export const sendUpdateUtxoBalance = async (appCtx: AppCtx, payload: UpdateUtxoBalance) => {
  appCtx.log.debug(`sending update utxo balance message in the queue ${payload.txId}`);
  await sendWebhook(appCtx, "updateutxobalance", payload);
};

export const sendMoralisWebhook = async (appCtx: AppCtx, payload: MoralisWebhook) => {
  appCtx.log.debug(`sending moralis message in the queue block: ${payload.block.number}`);
  await sendWebhook(appCtx, "moraliswebhook", payload);
};

async function sendWebhook(
  appCtx: AppCtx,
  name: string,
  payload: MoralisWebhook | TatumWebhook | UTXOWebhook | UpdateUtxoBalance
) {
  await sqsClient
    .sendMessage({
      QueueUrl: watchQueueUrl,
      MessageBody: JSON.stringify(payload),
      MessageAttributes: {
        messageType: {
          DataType: "String",
          StringValue: name,
        },
        requestId: {
          DataType: "String",
          StringValue: appCtx.reqId,
        },
      },
    })
    .promise();
}

interface UTXOWebhook {
  assetId: string;
  txHash: string;
  blockNumber: number; // maybe I won't have it
}

interface UpdateUtxoBalance {
  vaultId: string;
  walletId: string;
  txId: string;
}
