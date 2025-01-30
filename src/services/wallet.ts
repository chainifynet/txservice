import { AppCtx } from "@chainifynet/common-libs-node";
import { v5 as uuidv5 } from "uuid";
import { getAssetData, isBNB, isETH } from "../common/asset";
import { Err, newErrWithCode } from "../common/errs";
import {
  Address,
  Asset,
  AssetType,
  ChainType,
  InitWalletOpts,
  InitWalletStatus,
  Vault,
  VaultStatus,
  Wallet,
  WebhookType,
} from "../types/types";
import * as accountService from "./account";
import * as addressService from "./address";
import * as addressStore from "./store/address";
import { createAddressSubscription } from "./addressSubs";
import * as bc from "./bc/bc";
import * as vaultStore from "./store/vault";
import * as walletStore from "./store/wallet";
import * as addressSubService from "./addressSubs";
import { PaginatedWallets } from "./store/wallet";

/**
 * Every vault correcponds to a root key, if we want to generate a wallet using a child key then we need to pass an account id, this way we can
 * have the same address for multiple assets and chains on the same account,
 * for instance: the address will be the same for ETH and USDT_ETH and BSC and USDT_BSC in account 1.
 * e.g.:
 * ```
 *    root                      account 1           account 2
 *    -------------------       --------------      ------------------
 *    wallet 1 (TRX)            wallet 5 (TRX)      wallet 6 (ETH)
 *    wallet 2 (USDT_TRX)                           wallet 7 (USDT_ETH)
 *    wallet 3 (ETH)
 *    wallet 4 (BSC)
 *    ...
 * ```
 * For UTXO coins we could further divide the wallets into addresses so a BTC wallet will contain multiple addresses (including change addresses),
 * this way we will provide the balance of a wallet containing multiple UTXOs.
 * ```
 *    root                      account 1           account 2
 *    -------------------       --------------      ------------------
 *    wallet 1 (TRX)            wallet 5 (TRX)      wallet 6 (ETH)
 *    wallet 2 (BTC)            wallet 8 (BTC)      wallet 9 (BTC)
 *     - address 1               - address 1         - address 1
 *     - address 2               - address 2         - address 2
 *     - change 1
 *     - change 2
 *    wallet 3 (ETH)
 *    wallet 4 (BSC)
 *    ...
 * ```
 */
export const createWallet = async (
  appCtx: AppCtx,
  orgId: string,
  vaultId: string,
  assetId: string,
  name: string,
  webhookUrl: string,
  sweepTo: { vaultId: string; walletId: string },
  webhookTypes: WebhookType[],
  accountId?: string
): Promise<Wallet> => {
  const vault = await vaultStore.getVault(orgId, vaultId);
  if (vault.status !== VaultStatus.COMPLETED) {
    throw newErrWithCode(`vault ${vaultId} is not completed`, 409);
  }
  const asset = getAssetData(assetId);
  if (asset.chainType === ChainType.UTXO) {
    // UTXO logic
    return createUTXOWallet(appCtx, orgId, vault, asset, name, webhookUrl, webhookTypes, accountId);
  }
  if (asset.nativeAsset !== asset.assetId) {
    // check that we have the native asset wallet created
    const res = await walletStore.getWalletsByAssetId(orgId, vaultId, asset.nativeAsset, accountId);
    if (!res || res.length === 0) {
      throw newErrWithCode(`${asset.nativeAsset} wallet needs to be created first`, 404);
    }
  }
  let address;
  if (accountId) {
    const account = await accountService.getAccount(appCtx, orgId, vaultId, accountId);
    address = await bc.generateAddress(asset, account.pubKey.x, account.pubKey.y);
  } else {
    address = await bc.generateAddress(asset, vault.pubKey.x, vault.pubKey.y);
  }
  // TODO get previous txs for this address+asset (it might be there are already some txs-> usdt here but wallet not created yet)
  const balance = await bc.getBalance(asset, address);
  await createAddressSubscription(appCtx, orgId, address, asset);

  const now = new Date();
  const wallet: Wallet = {
    orgId,
    vaultId,
    name,
    walletId: generateDeterministicWalletId(vaultId, assetId, accountId), // for now to avoid creating two wallets for the same asset in the same vault
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    balance,
    address: bc.getAddress(asset, address, false),
    // pubKey: vault.pubKey, // for now just get the same pubkey from vault or account
    assetId,
    webhookUrl,
    webhookTypes,
    sweepTo,
  };
  if (accountId) {
    wallet.accountId = accountId;
  }
  if (isETH(asset.nativeAsset) || isBNB(asset.nativeAsset)) {
    wallet.addressChecksum = address;
  }
  try {
    await walletStore.createWallet(wallet);
    if (vault.initWallet?.assetId === wallet.assetId) {
      await vaultStore.updateInitWalletStatus(appCtx, vaultId, InitWalletStatus.COMPLETED, wallet.walletId);
    }
  } catch (err) {
    if (err.code !== Err.WALLET_ALREADY_EXISTS && vault.initWallet?.assetId === wallet.assetId) {
      await vaultStore.updateInitWalletStatus(appCtx, vaultId, InitWalletStatus.FAILED);
    }
    throw err;
  }

  return wallet;
};

async function createUTXOWallet(
  appCtx: AppCtx,
  orgId: string,
  vault: Vault,
  asset: Asset,
  name: string,
  webhookUrl: string,
  webhookTypes: WebhookType[],
  accountId: string
): Promise<Wallet> {
  const now = new Date();
  const walletId = generateDeterministicWalletId(vault.vaultId, asset.assetId, accountId);
  const account = await accountService.getAccount(appCtx, orgId, vault.vaultId, accountId);
  // generate first address
  const address = addressService.generateUTXOAddress(appCtx, orgId, {
    name,
    vault,
    asset,
    walletId,
    accountPath: account.path,
    index: 0,
  });
  const wallet: Wallet = {
    orgId,
    vaultId: vault.vaultId,
    name,
    walletId,
    balance: "0", // TODO sunset balance in favor of balanceV2
    balanceV2: {
      total: "0",
      available: "0",
      locked: "0",
      pending: "0",
      version: 0,
    },
    address: address.address,
    assetId: asset.assetId,
    accountId,
    webhookTypes,
    webhookUrl,
    lastDepositIndex: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await createAddressSubscription(appCtx, orgId, address.address, asset);
  await walletStore.createWalletAndAddress(appCtx, wallet, address);
  return wallet;
}

/**
 * Creates a new address for a UTXO wallet
 */
export async function createUTXOAddressForWallet(appCtx: AppCtx, wallet: Wallet, addressName: string): Promise<Address> {
  const addr = await addressService.generateUTXOAddressForWallet(appCtx, wallet, addressName);
  await walletStore.createAddressAndUpdateWallet(appCtx, wallet, addr);
  await addressSubService.createAddressSubscription(appCtx, wallet.orgId, addr.address, getAssetData(wallet.assetId));
  return addr;
}

export const getWalletsByVault = async (orgId: string, vaultId: string, esk?: string): Promise<PaginatedWallets> => {
  return walletStore.getWalletsByVault(orgId, vaultId, esk);
};

export const getWalletsByOrg = async (appCtx: AppCtx, orgId: string, esk: string): Promise<PaginatedWallets> => {
  return walletStore.getWalletsByOrgId(appCtx, orgId, esk);
};

export const getWalletsByAddress = async (
  appCtx: AppCtx,
  orgId: string,
  address: string,
  esk?: string
): Promise<PaginatedWallets> => {
  if (address.startsWith("0x")) {
    address = address.toLowerCase();
  }
  return walletStore.getWalletsByAddress(appCtx, orgId, address, esk);
};

/**
 * Get's the wallet by address and orgId, also valid for utxo wallets
 * Likely to return null if address is not in this org
 */
export async function getWalletByAddress(
  appCtx: AppCtx,
  orgId: string,
  assetId: string,
  address: string
): Promise<Wallet | null> {
  if (address.startsWith("0x")) {
    address = address.toLowerCase();
  }
  const asset = getAssetData(assetId);
  if (asset.chainType === ChainType.UTXO) {
    const addr = await addressStore.getAddress(appCtx, assetId, address);
    if (!addr || addr.orgId !== orgId) {
      appCtx.log.trace(`address ${address} not found for org ${orgId}`);
      return null;
    }
    return walletStore.getWallet(orgId, addr.vaultId, addr.walletId);
  } else {
    return walletStore.getWalletByAddress(appCtx, orgId, assetId, address);
  }
}

export const getWalletsByAccount = async (
  appCtx: AppCtx,
  orgId: string,
  accountId: string,
  esk?: string
): Promise<PaginatedWallets> => {
  return walletStore.getWalletsByAccount(appCtx, orgId, accountId, esk);
};

export const getWallet = async (
  orgId: string,
  vaultId: string,
  walletId: string,
  updateBalance = true
): Promise<Wallet> => {
  const wallet = await walletStore.getWallet(orgId, vaultId, walletId);
  const asset = getAssetData(wallet.assetId);
  if (updateBalance && asset.chainType !== ChainType.UTXO) {
    wallet.balance = await bc.getBalance(asset, wallet.address);
  }
  // TODO update balance if walletBalance != balance from bc; maybe we didn't process a tx yet or we missed a tx (for errors on processing or for non-supported-yet contract interactions)
  return wallet;
};

function generateDeterministicWalletId(vaultId: string, asset: string, accountId?: string): string {
  if (accountId) {
    return uuidv5(`$${vaultId}${asset}${accountId}`, uuidv5.URL);
  }
  return uuidv5(`$${vaultId}${asset}`, uuidv5.URL);
}

export const validateInitWallet = async (appCtx: AppCtx, orgId: string, initWallet: InitWalletOpts): Promise<void> => {
  const asset = getAssetData(initWallet.assetId);
  if (asset.assetType !== AssetType.NATIVE) {
    throw newErrWithCode(`only ${asset.nativeAsset} supported`, 404);
  }
  if (initWallet.sweepTo) {
    const sweepWallet = await walletStore.getWallet(orgId, initWallet.sweepTo.vaultId, initWallet.sweepTo.walletId);
    if (initWallet.assetId !== sweepWallet.assetId) {
      throw newErrWithCode(`sweepTo wallet ${initWallet.sweepTo.walletId} is not for the same asset`, 409);
    }
  }
};
