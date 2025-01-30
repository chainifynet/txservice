import { validate } from "../common/validator";
import * as txService from "../services/tx";
import * as walletService from "../services/wallet";
import { KoaCtx } from "@chainifynet/common-libs-node";
import { Tx } from "../types/types";

const getWalletTxsReportValidationRules = {
  month: "required|size:7|regex:/^\\d{4}-\\d{2}$/",
  orgId: "required|uuid",
  vaultId: "required|uuid",
  walletId: "required|uuid",
};

/**
 * Gets all the transactions for a given month in the format YYYY-MM
 */
export const getWalletTxsReport = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, walletId } = ctx.params;
  const month = <string>ctx.query.month; // in the following format: YYYY-MM

  validate({ month, orgId, walletId, vaultId }, getWalletTxsReportValidationRules);

  // to verify the orgId
  await walletService.getWallet(orgId, vaultId, walletId, false);

  const txs = await txService.getMontlyTxs(ctx.appCtx, walletId, month);
  ctx.body = { transactions: txs.map(toTxResponse) };
};

function toTxResponse(t: Tx) {
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
    amountUsd: t.amountUsd,
    assetId: t.assetId,
    note: t.note,
    externalId: t.externalId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    type: t.type,
    timestamp: t.tx?.timestamp,
    expiration: t.tx?.expiration,
    confirmations: t.blockData?.confs,
    minerFee: t.minerFee,
    minerFeeUsd: t.minerFeeUsd,
  };
}
