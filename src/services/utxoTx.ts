import { AppCtx } from "@chainifynet/common-libs-node";
import * as Big from "big.js";
import { v4 as uuidv4 } from "uuid";
import { getAssetData } from "../common/asset";
import { Err, newErrWithCode } from "../common/errs";
import { generateDeterministicTxId } from "../common/utils";
import { isTestnet } from "../config/variables";
import { CreateTxRequest, JobStatus, JobType, SignJobResult, Tx, TxStatus, Utxo, Vault } from "../types/types";
import * as addressService from "./address";
import * as addressSubService from "./addressSubs";
import * as bitcoin from "./bc/bitcoin";
import * as bitcoinFee from "./bc/fee/btc";
import * as pubKeyUtil from "./bc/pubkey";
import * as cosignerClient from "./client/cosigner";
import * as watcherClient from "./client/watcher";
import * as rateModel from "./rate";
import * as addressStore from "./store/address";
import * as outTxStore from "./store/outTx";
import * as txStore from "./store/tx";
import * as utxoStore from "./store/utxo";
import * as walletStore from "./store/wallet";
import * as walletModel from "./wallet";
import KSUID = require("ksuid");

const fakeAddress = isTestnet
  ? "tb1q08gdktv6ka8nux98t8tlwce0kfduefvdjfap3m"
  : "bc1q4lg5wndgfxw6r7a6g3m9tvzfdd6myyjt3evu6a";

function toAddressListNoDups(utxos: Utxo[]): string[] {
  return [...new Set(utxos.map((u) => u.address))];
}

/**
 * Creates an utxo tx
 */
export async function createUtxoTx(appCtx: AppCtx, req: CreateTxRequest): Promise<Tx> {
  const txId = req.externalId ? generateDeterministicTxId(req.walletId, req.externalId) : uuidv4();
  const [wallet, dstWallet] = await Promise.all([
    walletModel.getWallet(appCtx.state.orgId, req.vaultId, req.walletId),
    walletModel.getWalletByAddress(appCtx, appCtx.state.orgId, req.assetId, req.toAddress),
  ]);
  if (wallet.assetId !== req.assetId) {
    throw newErrWithCode("assets do not match", 404);
  }
  if (dstWallet?.walletId === wallet.walletId) {
    // TODO in cases we should allow: reconcile multiple utxos into one... For now keep it simple
    appCtx.log.error(`cannot send to same wallet`);
    throw newErrWithCode("cannot send to same wallet", 400);
  }
  if (wallet.balanceV2 && Big(wallet.balanceV2.available || 0).lte(req.amount)) {
    // fail fast without checking the utxos
    throw newErrWithCode("insufficient funds in wallet", 400);
  }
  const { feeRate } = await bitcoinFee.estimateSmartFee(appCtx);
  const feeFn = bitcoinFee.calculateSegwitTxFeeByInputCount([req.toAddress, fakeAddress], feeRate);
  if (wallet.balanceV2 && Big(wallet.balanceV2.available || 0).lte(Big(req.amount).plus(feeFn(1)))) {
    // fail fast checking the amount plus one utxo
    throw newErrWithCode("insufficient funds in wallet for amount and fee", 400);
  }

  const amountUsd = await rateModel.toUSD(appCtx, req.amount, req.assetId);
  if (amountUsd === undefined) {
    throw newErrWithCode("cannot convert amount to usd", 500);
  }

  const changeAddress = await addressService.generateUTXOAddressForWallet(appCtx, wallet, "change", txId);
  // TODO This will actually create a change address, save it to the address table and update the wallet's change address index
  // if this method fails down the line then we would have already created a change address that we will never use,
  // we are saving the property `isChangeForTxId` that could be used to clean up in the future (querying by txIds)
  // also we could consider removing the address from DB within this method as well
  await walletStore.createAddressAndUpdateWallet(appCtx, wallet, changeAddress);

  // Gather utxos to send
  const { utxos, fee } = await selectUtxosForAmount(appCtx, wallet.walletId, req.amount, feeFn);
  const [feeUsd, addresses] = await Promise.all([
    rateModel.toUSD(appCtx, fee, req.assetId),
    addressStore.getAddresses(appCtx, req.assetId, toAddressListNoDups(utxos)),
  ]);
  const bcTx = await bitcoin.buildTxForSigning(
    appCtx,
    utxos,
    addresses,
    req.toAddress,
    changeAddress.address,
    req.amount,
    fee
  );
  const now = new Date();
  const tx: Tx = {
    txId,
    initiator: appCtx.state.userId,
    orgId: appCtx.state.orgId,
    walletId: req.walletId,
    vaultId: req.vaultId,
    accountId: wallet.accountId,
    direction: "OUT",
    status: TxStatus.NEW,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    tx: bcTx.unsigenedTxHex,
    amount: req.amount,
    assetId: req.assetId,
    from: wallet.address,
    to: req.toAddress,
    note: req.note,
    externalId: req.externalId,
    minerFee: fee,
    type: req.type,
  };
  if (amountUsd !== undefined) {
    tx.amountUsd = amountUsd;
  }
  if (dstWallet) {
    // for intra org txs
    tx.dstVaultId = dstWallet.vaultId;
    tx.dstWalletId = dstWallet.walletId;
    tx.dstAccountId = dstWallet.accountId;
  }
  if (feeUsd) {
    tx.minerFeeUsd = feeUsd;
  }

  await utxoStore.runInDbTransaction(appCtx, async (conn: import("mysql2/promise").Connection) => {
    await utxoStore.updateUtxosToSignWithConn(appCtx, conn, txId, bcTx.toSignData);
    await outTxStore.createOutTxWithConn(appCtx, conn, outTxStore.toOutTx(tx));
    await txStore.createTx(tx);
  });

  await addressSubService
    .createAddressSubscription(appCtx, wallet.orgId, changeAddress.address, getAssetData(req.assetId))
    .catch((err) => {
      // It doesn't matter too much if the subscription is not created for the change address since we are not meant to receive external deposits in it
      appCtx.log.error(
        {
          err,
          address: changeAddress.address,
          txId,
          vaultId: tx.vaultId,
          walletId: wallet.walletId,
          orgId: wallet.orgId,
        },
        "creating change address subscription, skipping"
      );
    });

  await watcherClient
    .sendUpdateUtxoBalance(appCtx, {
      vaultId: tx.vaultId,
      walletId: tx.walletId,
      txId: tx.txId,
    })
    .catch((err) => {
      // We are ok
      appCtx.log.error(
        { err, txId, vaultId: tx.vaultId, walletId: wallet.walletId, orgId: wallet.orgId },
        "sending update utxo balance to watcher"
      );
    });
  return tx;
}

export async function signUtxosForTx(
  appCtx: AppCtx,
  cosigners: string[],
  vault: Vault,
  walletId: string,
  txId: string
): Promise<Tx> {
  const utxos = await utxoStore.selectUtxosToSign(appCtx, txId);
  if (!utxos.length) {
    throw newErrWithCode("no_utxos_to_sign", 400);
  }
  // Gather the addresses' HD paths
  const addresses = await addressStore.getAddresses(appCtx, utxos[0].assetId, toAddressListNoDups(utxos));

  const tx = await txStore.updateAndGetUtxoTxForSign(appCtx, walletId, txId);
  appCtx.log.debug(tx, "tx to sign");

  // This might be up to 250 utxos
  for (const utxo of utxos) {
    const jobId = (await KSUID.random()).string;
    appCtx.log.info({ jobId, utxoId: utxo.id, txId }, `sending signing utxo job, total for tx: ${utxos.length}`);
    await cosignerClient.initiateJob(
      appCtx,
      tx.orgId,
      {
        jobId,
        type: JobType.SignInit,
        cosigners: cosigners,
        metadata: {
          utxoId: utxo.id,
          orgId: tx.orgId,
          vaultId: tx.vaultId,
          walletId: tx.walletId,
          txId: tx.txId,
        },
        params: {
          toSign: utxo.toSign,
          keyId: vault.keyId,
          hdChainCode: vault.chainCode,
          hdPath: pubKeyUtil.parsePath(addresses[utxo.address].path),
        },
      },
      txId
    );
  }
  return tx;
}

export async function handleSignUtxoCallback(appCtx: AppCtx, tx: Tx, res: SignJobResult) {
  if (res.status === JobStatus.Finished) {
    await utxoStore.addSignature(appCtx, res.utxoId, res.signResult.signature);
    const utxosWaitingForSignature = await utxoStore.countUnsignedUtxosForTx(appCtx, tx.txId);
    if (!utxosWaitingForSignature) {
      await signTx(appCtx, tx);
    }
  } else if (res.status === JobStatus.Failed) {
    await utxoStore.failSignature(appCtx, res.utxoId);
    // TODO retry any utxos that failed or fail tx if max retry has happened
    // await txStore.updateTxAfterSignFailed(appCtx, res.walletId, res.txId);
    // return;
  }
}

export async function broadcastUtxoTx(appCtx: AppCtx, tx: Tx): Promise<Tx> {
  if (!tx.signedTxHex || tx.status !== TxStatus.SIGNED) {
    throw newErrWithCode(`tx not signed`, 400);
  }
  try {
    const res = await bitcoin.broadcast(appCtx, tx.assetId, tx.signedTxHex);
    appCtx.log.info({ res }, `tx broadcasted`);
    return await txStore.updateTxAfterBroadcast(appCtx, tx.walletId, tx.txId, TxStatus.BROADCASTED);
  } catch (err) {
    await txStore.updateTxAfterBroadcast(appCtx, tx.walletId, tx.txId, TxStatus.FAILED_BROADCAST);
    throw err;
  }
}

async function signTx(appCtx: AppCtx, tx: Tx): Promise<string> {
  const utxos = await utxoStore.getUtxosForTx(appCtx, tx.txId);
  if (utxos.some((u) => !u.signature)) {
    throw newErrWithCode("some_utxos_not_signed_yet", 404);
  }
  const signData = utxos.map((u) => ({
    utxoId: u.id,
    toSign: u.toSign,
    pubKeyHex: u.pubKey,
    signature: u.signature,
  }));
  const { txHash, signedTxHex } = await bitcoin.signTx(tx.tx, signData);
  await txStore.updateUtxoTxAfterSignSuccess(appCtx, tx.walletId, tx.txId, txHash, signedTxHex);
  return signedTxHex;
}

export async function selectUtxosForAmount(
  appCtx: AppCtx,
  walletId: string,
  amount: string,
  feeFn: (inCount: number) => number
): Promise<{ utxos: Utxo[]; fee: string }> {
  const topUtxos = await utxoStore.selectTopUnspentUtxos(appCtx, walletId); // top 200 for wallet
  return filterUtxos(appCtx, topUtxos, amount, feeFn);
}

function filterUtxos(
  appCtx: AppCtx,
  allUtxos: Utxo[],
  amount: string,
  feeFn: (inCount: number) => number
): { utxos: Utxo[]; fee: string } {
  const utxos: Utxo[] = [];
  let selectedAmount = BigInt(0);
  let count = 0;
  let fee = BigInt(0);

  for (const utxo of allUtxos) {
    count += 1;
    fee = BigInt(feeFn(count));
    utxos.push(utxo);
    selectedAmount += BigInt(utxo.amount);
    if (selectedAmount >= BigInt(amount) + fee) {
      return { utxos, fee: fee.toString() };
    }
  }

  throw newErrWithCode(
    `${utxos.length} utxos not enough to cover amount: ${amount} + ${fee}`,
    400,
    Err.NOT_ENOUGHT_UTXOS_FOR_AMOUNT
  );
}
