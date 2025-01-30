import { AppCtx, KoaCtx } from "@chainifynet/common-libs-node";
import { getAssetData, isBTC, isETHOrERC20, isTRC20, isTRXOrTRC20, validateAddress } from "../common/asset";
import { newErrWithCode } from "../common/errs";
import { validate } from "../common/validator";

import { isTRX } from "../common/asset";
import * as ethFee from "../services/bc/fee/eth";
import * as btcFee from "../services/bc/fee/btc";
import * as tronFee from "../services/bc/fee/tron";
import * as utxoService from "../services/utxoTx";

const estimateFeeValidationRules = {
  assetId: "required|asset",
  from: "string",
  fromWalletId: "string|uuid",
  amount: "string|numeric", // in utxo coins we need to know the number of inputs to estimate the size of the tx, we can get it from the amount and checking utxos that might be needed
};

export async function estimateFee(ctx: KoaCtx) {
  const { assetId, from, amount, fromWalletId } = ctx.request.body;
  validateEstimate({ assetId, from, fromWalletId });

  if (isBTC(assetId)) {
    const res = await estimateBtcFee(ctx.appCtx, assetId, fromWalletId, amount);
    ctx.body = res;
    return;
  }
  const res = await estimateFeeForAssetCached(ctx.appCtx, assetId, from);

  ctx.body = res;
}

async function estimateFeeForAssetCached(appCtx: AppCtx, assetId: string, from?: string) {
  if (isETHOrERC20(assetId)) {
    // we are not using from in eth fee estimation so we can clear that to save cache space
    from = "";
  }
  return appCtx.cache.get(
    `fee-${assetId}-${from}`,
    async () => estimateFeeForAsset(appCtx, assetId, from),
    60 // 1 minute
  );
}

async function estimateBtcFee(appCtx: AppCtx, assetId: string, fromWalletId?: string, amount?: string) {
  const { feeRate } = await appCtx.cache.get(
    `feeRate-${assetId}`,
    async () => btcFee.estimateSmartFee(appCtx),
    60 // 1 minute
  );
  let fee;
  const feeFn = btcFee.calculateSegwitTxFeeByInputCount(2, feeRate);
  if (fromWalletId && amount) {
    const selected = await utxoService.selectUtxosForAmount(appCtx, fromWalletId, amount, feeFn);
    fee = selected.fee;
  } else {
    fee = feeFn(2); // default to 2 inputs
  }
  return {
    amount: fee,
    assetId: assetId,
  };
}

async function estimateFeeForAsset(appCtx: AppCtx, assetId: string, from?: string) {
  const asset = getAssetData(assetId);

  let amount = 0;
  if (isTRC20(assetId)) {
    amount = await tronFee.estimateTrc20Fee(appCtx, { from, contractAddress: asset.contractAddress });
  } else if (isTRX(assetId)) {
    amount = await tronFee.estimateTrxFee(appCtx, { from });
  } else if (isETHOrERC20(assetId)) {
    amount = await ethFee.getFeeEstimate(appCtx, asset);
  } else {
    throw newErrWithCode(`${assetId} fee estimation not supported`, 400);
  }

  return {
    amount,
    assetId: asset.nativeAsset,
  };
}

function validateEstimate({ assetId, from, fromWalletId }: { assetId: string; from?: string; fromWalletId?: string }) {
  validate({ assetId, from, fromWalletId }, estimateFeeValidationRules);
  if (isTRXOrTRC20(assetId) && !from) {
    throw newErrWithCode("from is required for TRX/TRC20", 400);
  }
  if (from) {
    validateAddress(from, assetId);
  }
}
