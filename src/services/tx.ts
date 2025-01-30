import { AppCtx } from "@chainifynet/common-libs-node";
import { v4 as uuidv4 } from "uuid";
import { getAssetData } from "../common/asset";
import { newErrWithCode } from "../common/errs";
import { generateDeterministicTxId } from "../common/utils";
import {
  ChainType,
  CreateTxRequest,
  JobStatus,
  JobType,
  SignJobResult,
  SqsJobParams,
  Tx,
  TxStatus,
} from "../types/types";
import * as accountService from "./account";
import * as bc from "./bc/bc";
import * as pubKeyUtil from "./bc/pubkey";
import * as cosignerClient from "./client/cosigner";
import * as userClient from "./client/user";
import * as rateModel from "./rate";
import * as txStore from "./store/tx";
import * as outTxStore from "./store/outTx";
import * as utxoTxService from "./utxoTx";
import * as vaultModel from "./vault";
import * as walletModel from "./wallet";
import KSUID = require("ksuid");
import { runInDbTransaction } from "./store/utxo";

export const createTx = async (appCtx: AppCtx, req: CreateTxRequest): Promise<Tx> => {
  const asset = getAssetData(req.assetId);
  if (asset.chainType === ChainType.UTXO) {
    return utxoTxService.createUtxoTx(appCtx, req);
  }
  const wallet = await walletModel.getWallet(appCtx.state.orgId, req.vaultId, req.walletId);
  if (wallet.assetId !== req.assetId) {
    throw newErrWithCode("asset_not_match", 404);
  }
  if (!wallet.address || wallet.address === req.toAddress) {
    appCtx.log.error(
      `cannot build tx if wallet address (${wallet.address}) is not set or is the same as toAddress (${req.toAddress})`
    );
    throw newErrWithCode("cannot send to same wallet", 400);
  }
  await bc.validateBalanceBeforeSend(wallet, req.toAddress, req.amount);

  const now = new Date();
  const bcTx = await bc.buildTx(asset, wallet.address, req.toAddress, req.amount);
  const txId = req.externalId ? generateDeterministicTxId(req.walletId, req.externalId) : uuidv4();
  const tx: Tx = {
    txId,
    initiator: appCtx.state.userId,
    orgId: appCtx.state.orgId,
    walletId: req.walletId,
    vaultId: req.vaultId,
    accountId: wallet.accountId,
    direction: "OUT",
    status: TxStatus.NEW,
    tx: bcTx.unsignedTx,
    toSign: bcTx.toSign,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    amount: req.amount,
    assetId: req.assetId,
    from: wallet.address,
    to: req.toAddress,
    note: req.note,
    externalId: req.externalId,
    type: req.type,
  };
  if (bcTx.txHash) {
    // eth doesn't compute this one before signing
    tx.txHash = bcTx.txHash;
  }
  const amountUsd = await rateModel.toUSD(appCtx, req.amount, req.assetId);
  if (amountUsd) {
    tx.amountUsd = amountUsd;
  }
  const dstWallet = await walletModel.getWalletByAddress(appCtx, appCtx.state.orgId, req.assetId, req.toAddress);
  if (dstWallet) {
    // for intra org txs
    tx.dstVaultId = dstWallet.vaultId;
    tx.dstWalletId = dstWallet.walletId;
    tx.dstAccountId = dstWallet.accountId;
  }
  await runInDbTransaction(appCtx, async (conn) => {
    await outTxStore.createOutTxWithConn(appCtx, conn, outTxStore.toOutTx(tx));
    await txStore.createTx(tx);
  });
  return tx;
};

export const signTx = async (
  appCtx: AppCtx,
  orgId: string,
  vaultId: string,
  walletId: string,
  txId: string
): Promise<Tx> => {
  const [vault, wallet, org] = await Promise.all([
    vaultModel.getVault(orgId, vaultId),
    walletModel.getWallet(orgId, vaultId, walletId),
    userClient.getOrg(appCtx, orgId),
  ]);
  const asset = getAssetData(wallet.assetId);
  if (asset.chainType === ChainType.UTXO) {
    return utxoTxService.signUtxosForTx(appCtx, org.cosigners, vault, walletId, txId);
  }
  let account;
  if (wallet.accountId) {
    account = await accountService.getAccount(appCtx, orgId, vaultId, wallet.accountId);
  }
  const jobId = (await KSUID.random()).string;
  const tx = await updateAndGetTxForSign(appCtx, walletId, txId, jobId);
  appCtx.log.debug(tx, "tx to sign");
  const params: SqsJobParams = {
    toSign: tx.toSign || tx.tx.txID, // TODO remove the tx.tx.txID fallback
    keyId: vault.keyId,
  };
  if (account) {
    params.hdPath = pubKeyUtil.parsePath(account.path);
    params.hdChainCode = vault.chainCode;
  }
  await cosignerClient.initiateJob(appCtx, tx.orgId, {
    jobId,
    type: JobType.SignInit,
    cosigners: org.cosigners,
    metadata: {
      orgId: tx.orgId,
      vaultId: tx.vaultId,
      walletId: tx.walletId,
      txId: tx.txId,
    },
    params,
  });
  return tx;
};

export const broadcastTx = async (
  appCtx: AppCtx,
  orgId: string,
  vaultId: string,
  walletId: string,
  txId: string
): Promise<Tx> => {
  const tx = await txStore.getTx(walletId, txId);
  const asset = getAssetData(tx.assetId);
  if (asset.chainType === ChainType.UTXO) {
    return utxoTxService.broadcastUtxoTx(appCtx, tx);
  }
  if (!tx.signature?.sig) {
    throw newErrWithCode("tx_not_signed_yet", 404);
  }
  try {
    const res = await bc.broadcast(asset, tx.signedTxHex || tx.tx);
    appCtx.log.info({ broadcastedTx: res }, `tx broadcasted`);
  } catch (err) {
    await txStore.updateTxAfterBroadcast(appCtx, walletId, txId, TxStatus.FAILED_BROADCAST);
    throw err;
  }
  // TODO be proactive and don't wait for tatum webhook here we can just send watchtx with a 10 secs delay
  return txStore.updateTxAfterBroadcast(appCtx, walletId, txId, TxStatus.BROADCASTED);
};

export const getTxs = async (walletId: string, esk: string) => {
  return txStore.getTxsOrderedByDate(walletId, esk);
};

export const getMontlyTxs = async (appCtx: AppCtx, walletId: string, month: string) => {
  return txStore.getMontlyTxs(appCtx, walletId, month);
};

export const getTx = async (walletId: string, txId: string) => {
  return txStore.getTx(walletId, txId);
};

export const signCallback = async (appCtx: AppCtx, res: SignJobResult) => {
  appCtx.log.info({ signCallback: res }, "signCallback");

  const tx = await txStore.getTx(res.walletId, res.txId);
  const asset = getAssetData(tx.assetId);
  if (asset.chainType === ChainType.UTXO) {
    await utxoTxService.handleSignUtxoCallback(appCtx, tx, res);
    return;
  }
  if (res.status === JobStatus.Finished) {
    const signed = await bc.addSignature(
      asset,
      tx.tx,
      res.signResult.r,
      res.signResult.s,
      res.signResult.signatureRecovery
    );
    await txStore.updateTxAfterSignSuccess(appCtx, res.walletId, res.txId, res.signResult, signed);
    return;
  }
  if (res.status === JobStatus.Failed) {
    await txStore.updateTxAfterSignFailed(appCtx, res.walletId, res.txId);
    return;
  }
};

export const getTxsByHash = async (appCtx: AppCtx, orgId: string, txHash: string) => {
  return txStore.getTxsByHash(appCtx, orgId, txHash);
};

async function updateAndGetTxForSign(appCtx: AppCtx, walletId: string, txId: string, jobId: string) {
  const txToSign = await txStore.getTx(walletId, txId);
  if (!txToSign.toSign) {
    const asset = getAssetData(txToSign.assetId);
    const { unsignedTx, toSign } = await bc.prepareForSignature(asset, txToSign.from, txToSign.tx);
    return txStore.updateAndGetTxForSign(appCtx, walletId, txId, jobId, { unsignedTx, toSign });
  }
  return txStore.updateAndGetTxForSign(appCtx, walletId, txId, jobId);
}
