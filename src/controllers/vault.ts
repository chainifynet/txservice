import * as vaultModel from "../services/vault";
import * as walletModel from "../services/wallet";
import * as gasStationModel from "../services/gasStation";
import { validate } from "../common/validator";
import { Address, Vault, VaultStatus, Wallet, WebhookType } from "../types/types";
import { newErrWithCode } from "../common/errs";
import { KoaCtx } from "@chainifynet/common-libs-node";
import * as sweepManagerClient from "../services/client/sweepManager";

const createVaultValidationRules = {
  name: "required|string|min:1|max:255",
  externalId: "string|max:255",
  initWallet: {
    webhookUrl: "url",
    assetId: "required_with:initWallet|asset",
    sweepTo: {
      vaultId: "required_with:initWallet.sweepTo",
      walletId: "required_with:initWallet.sweepTo",
    },
  },
};

export const createVault = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { name, externalId, initWallet } = ctx.request.body;
  validate({ name, externalId, initWallet }, createVaultValidationRules);
  if (initWallet) {
    await walletModel.validateInitWallet(ctx.appCtx, orgId, initWallet);
  }
  const vault = await vaultModel.createVault(ctx.appCtx, orgId, externalId, name, 1, 3, initWallet);
  ctx.body = toVaultResponse(vault);
};

const retryCreateVaultValidationRules = {
  vaultId: "required|string|min:1|max:255",
};

export const retryCreateVault = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId } = ctx.params;
  validate({ vaultId }, retryCreateVaultValidationRules);
  const vault = await vaultModel.retryCreateVault(ctx.appCtx, orgId, vaultId);
  ctx.body = toVaultResponse(vault);
};

const createWalletValidationRules = {
  vaultId: "required",
  assetId: "required|asset",
  name: "string|max:255",
  webhookUrl: "url",
  webhookTypes: "array",
  accountId: "required:uuid",
  sweepTo: {
    vaultId: "required_with:sweepTo",
    walletId: "required_with:sweepTo",
  },
};

export const createWallet = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId } = ctx.params;
  const { assetId, name, webhookUrl, sweepTo, webhookTypes, accountId } = ctx.request.body;

  validate({ vaultId, assetId, name, webhookUrl, sweepTo, webhookTypes, accountId }, createWalletValidationRules);
  const whTypes = validateWebhookAndGetDefaults(webhookUrl, webhookTypes);
  const wallet = await walletModel.createWallet(
    ctx.appCtx,
    orgId,
    vaultId,
    assetId,
    name,
    webhookUrl,
    sweepTo,
    whTypes,
    accountId
  );
  ctx.body = toWalletResponse(wallet);
};

const createUTXOWalletAddressValidationRules = {
  vaultId: "required",
  walletId: "required",
  name: "string|max:255",
};

export const createUTXOWalletAddress = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, walletId } = ctx.params;
  const { name } = ctx.request.body;

  validate({ vaultId, walletId, name }, createUTXOWalletAddressValidationRules);
  const wallet = await walletModel.getWallet(orgId, vaultId, walletId, false);
  const address = await walletModel.createUTXOAddressForWallet(ctx.appCtx, wallet, name);
  ctx.body = toAddressResponse(address);
};



const getWalletsValidationRules = {
  vaultId: "required",
};

export const getWallets = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const last = <string>ctx.request.query.last;
  const { vaultId } = ctx.params;

  validate({ vaultId }, getWalletsValidationRules);
  const resp = await walletModel.getWalletsByVault(orgId, vaultId, last);
  ctx.body = { wallets: resp.wallets.map(toWalletResponse), last: resp.last };
};

const getAllWalletsByOrgIdValidationRules = {
  last: "string",
  address: "string|anyaddress",
};

export const getAllWalletsByOrgId = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const last = <string>ctx.request.query.last;
  const address = <string>ctx.request.query.address;
  const accountId = <string>ctx.request.query.account;

  validate({ last, address }, getAllWalletsByOrgIdValidationRules);
  let resp;
  if (address) {
    resp = await walletModel.getWalletsByAddress(ctx.appCtx, orgId, address, last);
  } else if (accountId) {
    resp = await walletModel.getWalletsByAccount(ctx.appCtx, orgId, accountId, last);
  } else {
    resp = await walletModel.getWalletsByOrg(ctx.appCtx, orgId, last);
  }
  ctx.body = { wallets: resp.wallets.map(toWalletResponse), last: resp.last };
};

const getGasStationValidationRules = {
  assetId: "required",
};

export const getGasStation = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { assetId } = ctx.params;

  validate({ assetId }, getGasStationValidationRules);
  const resp = await gasStationModel.getGasStation(ctx.appCtx, orgId, assetId);
  ctx.body = resp;
};

const getGasStationsValidationRules = {
  assetId: "asset",
};

export const getGasStations = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const assetId = <string>ctx.request.query.assetId;

  validate({ assetId }, getGasStationsValidationRules);
  const resp = await gasStationModel.getGasStationsForOrg(ctx.appCtx, orgId);
  ctx.body = resp;
};

const refuelValidationRules = {
  vaultId: "required",
  walletId: "required",
};

export const refuel = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, walletId } = ctx.params;

  validate({ vaultId, walletId }, refuelValidationRules);
  const res = await sweepManagerClient.refuel(ctx.appCtx, orgId, vaultId, walletId);
  ctx.body = res;
};

const getWalletValidationRules = {
  vaultId: "required",
  walletId: "required",
};

export const getWallet = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, walletId } = ctx.params;

  validate({ vaultId, walletId }, getWalletValidationRules);
  const wallet = await walletModel.getWallet(orgId, vaultId, walletId);
  ctx.body = toWalletResponse(wallet);
};

const internalGetWalletValidationRules = {
  vaultId: "required",
  walletId: "required",
  orgId: "required",
};

export const internalGetWallet = async (ctx: KoaCtx) => {
  const orgId = <string>ctx.request.header.orgid;
  const { vaultId, walletId } = ctx.params;

  validate({ vaultId, walletId, orgId }, internalGetWalletValidationRules);
  const wallet = await walletModel.getWallet(orgId, vaultId, walletId, false);
  ctx.body = wallet;
};

const getVaultsValidationRules = {
  last: "string",
};

export const getVaults = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const last = <string>ctx.request.query.last;

  validate({ last }, getVaultsValidationRules);
  const resp = await vaultModel.getVaults(orgId, last);
  ctx.body = { vaults: resp.vaults.map(toVaultResponse), last: resp.last };
};

export const getVault = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId } = ctx.params;

  const vault = await vaultModel.getVault(orgId, vaultId);
  ctx.body = toVaultResponse(vault);
};

type WalletResponse = {
  vaultId: string;
  walletId: string;
  accountId?: string;
  address?: string;
  balance: string;
  assetId: string;
  name: string;
  createdAt: string;
};

export function toWalletResponse(w: Wallet): WalletResponse {
  const address = w.addressChecksum ? w.addressChecksum : w.address;
  const res: WalletResponse = {
    vaultId: w.vaultId,
    walletId: w.walletId,
    address,
    balance: w.balance,
    assetId: w.assetId,
    name: w.name,
    createdAt: w.createdAt,
  };
  if (w.accountId) {
    res.accountId = w.accountId;
  }
  return res;
}

type AddressResponse = {
  orgId: string;
  vaultId: string;
  walletId: string;
  addressId: string;
  assetId: string;
  name: string;
  address: string;
  createdAt: string;
  externalId?: string;
  isChange?: boolean;
};

export function toAddressResponse(a: Address): AddressResponse {
  return {
    orgId: a.orgId,
    vaultId: a.vaultId,
    walletId: a.walletId,
    addressId: a.addressId,
    assetId: a.assetId,
    name: a.name,
    address: a.address,
    createdAt: a.createdAt,
    externalId: a.externalId,
    isChange: a.isChange,
  }
}

type VaultResponse = {
  vaultId: string;
  name: string;
  status: string;
  createdAt: string;
  walletId?: string;
  assetId?: string;
};

function toVaultResponse(v: Vault): VaultResponse {
  const res = {
    vaultId: v.vaultId,
    name: v.name,
    createdAt: v.createdAt,
    status: <string>v.status,
  } as VaultResponse;
  if (v.initWallet) {
    if (!v.initWallet.status && v.status === VaultStatus.COMPLETED) {
      res.status = "WALLET_IN_PROGRESS";
    } else if (v.initWallet.status) {
      res.status = v.initWallet.status;
    } else {
      res.status = v.status;
    }
    res.walletId = v.initWallet.walletId;
    res.assetId = v.initWallet.assetId;
  }
  return res;
}

function validateWebhookAndGetDefaults(url: string, types: WebhookType[]): WebhookType[] {
  if (!url && types?.length) {
    throw newErrWithCode(`cannot pass webhookTypes without webhookUrl`, 400);
  }
  if (url && !types?.length) {
    return [WebhookType.TX_IN];
  }
  if (!url && !types?.length) {
    return undefined;
  }
  for (const t of types) {
    if (WebhookType.TX_IN != t && WebhookType.TX_OUT != t) {
      throw newErrWithCode(`Invalid webhook type: ${t}`, 400);
    }
  }
  return types;
}
