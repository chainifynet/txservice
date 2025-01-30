import { validate } from "../common/validator";
import { getAssetData, validateAddress } from "../common/asset";
import * as txModel from "../services/tx";
import * as walletModel from "../services/wallet";
import * as gasStationModel from "../services/gasStation";
import { AssetType, Tx, TxType } from "../types/types";
import { newErrWithCode } from "../common/errs";
import { KoaCtx } from "@chainifynet/common-libs-node";

const createTxValidationRules = {
  vaultId: "required",
  walletId: "required",
  toAddress: "required",
  assetId: "required|asset",
  amount: "required|integer|min:1",
  note: "string",
  externalId: "string",
};

/**
 * Send will do the same as `createTx` but `vt-tx-automation` will immediatelly sign it and then broadcast it
 * @param ctx
 */
export const send = async (ctx: KoaCtx) => {
  const { vaultId, walletId } = ctx.params;
  const { toAddress, assetId, amount, note, externalId } = ctx.request.body;
  validate({ vaultId, walletId, toAddress, assetId, amount, note, externalId }, createTxValidationRules);
  validateAddress(toAddress, assetId);
  const tx = await txModel.createTx(ctx.appCtx, {
    vaultId,
    walletId,
    toAddress,
    assetId,
    amount,
    note,
    externalId,
    type: TxType.USER_SEND,
  });
  ctx.body = toTxResponse(tx);
};

/**
 * If wallet has a sweep wallet id set up will send the funds to that address
 * @param ctx
 */
export const sweep = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, walletId } = ctx.params;
  const wallet = await walletModel.getWallet(orgId, vaultId, walletId);
  if (!wallet.sweepTo?.vaultId || !wallet.sweepTo?.walletId) {
    throw newErrWithCode("Wallet has no sweep wallet set up", 400);
  }
  const asset = getAssetData(wallet.assetId);
  let amountToSweep = BigInt(wallet.balance);
  if (asset.assetType === AssetType.NATIVE) {
    const minAmount = await gasStationModel.getGasCap(ctx.appCtx, wallet.orgId, wallet.assetId);
    amountToSweep = amountToSweep - BigInt(minAmount);
  }
  if (amountToSweep <= 0) {
    throw newErrWithCode(`Wallet has not enough balance to sweep: ${wallet.balance} ${wallet.assetId}`, 400);
  }
  const sweepToWallet = await walletModel.getWallet(orgId, wallet.sweepTo.vaultId, wallet.sweepTo.walletId, false);
  if (wallet.assetId !== sweepToWallet.assetId) {
    throw newErrWithCode("Sweep wallet asset id does not match", 400);
  }
  validateAddress(sweepToWallet.address, sweepToWallet.assetId);
  const tx = await txModel.createTx(ctx.appCtx, {
    vaultId,
    walletId,
    toAddress: sweepToWallet.address,
    assetId: wallet.assetId,
    amount: amountToSweep.toString(),
    type: TxType.SWEEP,
  });
  ctx.body = toTxResponse(tx);
};

export const createTx = async (ctx: KoaCtx) => {
  const { vaultId, walletId } = ctx.params;
  const { toAddress, assetId, amount, note, externalId } = ctx.request.body;
  validate({ vaultId, walletId, toAddress, assetId, amount, note, externalId }, createTxValidationRules);
  validateAddress(toAddress, assetId);
  const tx = await txModel.createTx(ctx.appCtx, {
    vaultId,
    walletId,
    toAddress,
    assetId,
    amount,
    note,
    externalId,
    type: TxType.USER,
  });
  ctx.body = toTxResponse(tx);
};

const signTxValidationRules = {
  vaultId: "required",
  walletId: "required",
  txId: "required",
};

export const signTx = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, walletId, txId } = ctx.params;
  validate({ vaultId, walletId, txId }, signTxValidationRules);

  const tx = await txModel.signTx(ctx.appCtx, orgId, vaultId, walletId, txId);
  ctx.body = toTxResponse(tx);
};

const broadcastTxValidationRules = {
  vaultId: "required",
  walletId: "required",
  txId: "required",
};

export const broadcastTx = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, walletId, txId } = ctx.params;
  validate({ vaultId, walletId, txId }, broadcastTxValidationRules);
  const tx = await txModel.broadcastTx(ctx.appCtx, orgId, vaultId, walletId, txId);
  ctx.body = toTxResponse(tx);
};

const getTxsValidationRules = {
  vaultId: "required",
  walletId: "required",
  last: "string",
};

export const getTxs = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, walletId } = ctx.params;
  const last = <string>ctx.request.query.last;
  validate({ vaultId, walletId, last }, getTxsValidationRules);
  // to verify the orgId
  await walletModel.getWallet(orgId, vaultId, walletId, false);

  const resp = await txModel.getTxs(walletId, last);
  ctx.body = { transactions: resp.txs.map(toTxResponse), last: resp.last };
};

const getTxValidationRules = {
  vaultId: "required",
  walletId: "required",
  txId: "required",
};

export const getTx = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, walletId, txId } = ctx.params;
  validate({ vaultId, walletId, txId }, getTxValidationRules);
  // to verify the orgId
  await walletModel.getWallet(orgId, vaultId, walletId, false);
  const tx = await txModel.getTx(walletId, txId);
  ctx.body = toTxResponse(tx);
};

export function toTxResponse(t: Tx) {
  return {
    orgId: t.orgId,
    vaultId: t.vaultId,
    walletId: t.walletId,
    txId: t.txId,
    txHash: t.txHash,
    status: t.status,
    direction: t.direction,
    from: t.from,
    to: t.to,
    amount: t.amount,
    assetId: t.assetId,
    note: t.note,
    externalId: t.externalId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    type: t.type,
    timestamp: t.tx?.timestamp,
    expiration: t.tx?.expiration,
    confirmations: t.blockData?.confs,
    minerFee: t.minerFee || t.blockData?.fee,
  };
}
