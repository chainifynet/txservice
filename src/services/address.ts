import { AppCtx } from "@chainifynet/common-libs-node";
import { v5 as uuidv5 } from "uuid";

import { getAssetData } from "../common/asset";
import { newErrWithCode } from "../common/errs";
import { Address, Asset, ChainType, Vault, Wallet } from "../types/types";
import * as accountService from "./account";
import * as bitcoin from "./bc/bitcoin";
import * as pubKeyUtil from "./bc/pubkey";
import * as vaultStore from "./store/vault";

/**
 * TODO currently only BTC supported, should be enhanced to support other UTXO assets
 */
export function generateUTXOAddress(appCtx: AppCtx, orgId: string, params: CreateUTXOAddressParams): Address {
  const now = new Date();

  // TODO only BTC for now, change to UTXO for litecoin, bch, etc
  if (!["BTC", "BTC_TESTNET"].includes(params.asset.assetId)) {
    throw newErrWithCode(`asset ${params.asset.assetId} is not BTC, for now only BTC supported`, 400);
  }
  if (!params.vault.chainCode) {
    appCtx.log.warn(`chainCode not set for vault ${params.vault.vaultId}`);
  }
  const depositOrChange = params.isChangeForTxId ? "1" : "0";
  const index = params.index || 0;
  const path = `${params.accountPath}/${depositOrChange}/${index}`;
  const derivedPubKey = pubKeyUtil.deriveChildPub(appCtx, params.vault.pubKey, path, params.vault.chainCode);

  // TODO derive for specific utxo asset (currently only BTC)
  const address = bitcoin.generateAddress(derivedPubKey.x, derivedPubKey.y);

  const utxoAddress: Address = {
    addressId: generateDeterministicAddressId(params.walletId, path),
    assetId: params.asset.assetId,
    orgId,
    vaultId: params.vault.vaultId,
    walletId: params.walletId,
    name: params.name,
    path, // number comes from a counter in the wallet
    pubKey: derivedPubKey,
    address,
    isChange: params.isChangeForTxId ? true : false,
    isChangeForTxId: params.isChangeForTxId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  if (params.externalId) {
    utxoAddress.externalId = params.externalId;
  }
  return utxoAddress;
}

export async function generateUTXOAddressForWallet(
  appCtx: AppCtx,
  wallet: Wallet,
  name: string,
  isChangeForTxId?: string
): Promise<Address> {
  const isChange = isChangeForTxId ? true : false;
  const asset = getAssetData(wallet.assetId);
  if (asset.chainType !== ChainType.UTXO) {
    throw newErrWithCode(`asset ${wallet.assetId} is not UTXO`, 400);
  }
  const [account, vault] = await Promise.all([
    accountService.getAccount(appCtx, wallet.orgId, wallet.vaultId, wallet.accountId),
    vaultStore.getVault(wallet.orgId, wallet.vaultId),
  ]);
  return generateUTXOAddress(appCtx, wallet.orgId, {
    name,
    vault,
    asset,
    walletId: wallet.walletId,
    accountPath: account.path,
    isChangeForTxId,
    index: getNextIndex(wallet, isChange),
  });
}

function getNextIndex(wallet: Wallet, isChange: boolean): number {
  if (isChange) {
    return !wallet.lastChangeIndex && wallet.lastChangeIndex !== 0 ? 0 : wallet.lastChangeIndex + 1;
  }
  return !wallet.lastDepositIndex && wallet.lastDepositIndex !== 0 ? 0 : wallet.lastDepositIndex + 1;
}

function generateDeterministicAddressId(walletId: string, path: string): string {
  return uuidv5(`$${walletId}${path}`, uuidv5.URL);
}

type CreateUTXOAddressParams = {
  name: string;
  externalId?: string;
  vault: Vault;
  asset: Asset;
  walletId: string;
  isChangeForTxId?: string;
  index?: number; // if not provided then 0
  accountPath: string;
};
