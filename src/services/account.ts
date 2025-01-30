import { AppCtx } from "@chainifynet/common-libs-node";
import { v5 as uuidv5 } from "uuid";
import { Account, VaultStatus } from "../types/types";
import * as vaultService from "./vault";
import * as accountStore from "./store/account";
import * as metricsStore from "./store/metrics";
import * as pubKeyUtil from "./bc/pubkey";
import * as userClient from "./client/user";
import { Err, newErrWithCode } from "../common/errs";
import { randomBytes } from "crypto";
import { PaginatedAccounts } from "./store/account";

export async function createAccount(appCtx: AppCtx, orgId: string, params: CreateAccountParams): Promise<Account> {
  const now = new Date();

  await validateAccountPlan(appCtx, orgId);
  const vault = await vaultService.getVault(orgId, params.vaultId);
  if (vault.status !== VaultStatus.COMPLETED) {
    throw newErrWithCode(`vault ${params.vaultId} is not completed`, 409);
  }
  const chainCode = vault.chainCode || randomBytes(32).toString("hex").padStart(64, "0");
  const pathIndex = vault.lastIndex || vault.lastIndex === 0 ? vault.lastIndex + 1 : 0;
  const path = `m/${pathIndex}`;
  const derivedPubKey = pubKeyUtil.deriveChildPub(appCtx, vault.pubKey, path, chainCode);
  const accountId = generateDeterministicAccountId(params.vaultId, path); // This will enforce unique path per account

  // TODO: enforce unique external id
  const account: Account = {
    orgId,
    accountId,
    vaultId: params.vaultId,
    name: params.name,
    path, // number comes from a counter in the vault
    pubKey: derivedPubKey,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  if (params.externalId) {
    account.externalId = params.externalId;
  }
  await accountStore.createAccountAndUpdateIndex(appCtx, account, pathIndex, chainCode);
  return account;
}

export async function getAccount(appCtx: AppCtx, orgId: string, vaultId: string, accountId: string): Promise<Account> {
  const account = await accountStore.getAccount(appCtx, orgId, accountId);
  if (account.vaultId !== vaultId) {
    throw newErrWithCode(`account ${accountId} not found in vault ${vaultId}`, 404);
  }
  return account;
}

export const getAccounts = async (
  appCtx: AppCtx,
  orgId: string,
  vaultId: string,
  esk?: string
): Promise<PaginatedAccounts> => {
  return accountStore.getAccountsOrderedByDate(appCtx, orgId, vaultId, esk);
};

function generateDeterministicAccountId(vaultId: string, path: string): string {
  return uuidv5(`$${vaultId}${path}`, uuidv5.URL);
}

type CreateAccountParams = {
  name: string;
  vaultId: string;
  externalId?: string;
};

async function validateAccountPlan(appCtx: AppCtx, orgId: string) {
  const [orgWithSub, count] = await Promise.all([
    userClient.getOrgWithSubscription(appCtx, orgId),
    metricsStore.getMetric(appCtx, orgId, metricsStore.Metric.ACCOUNT_COUNT),
  ]);
  const maxAccountCount = orgWithSub?.orgSubscription?.features?.maxAccountCount;
  const planId = orgWithSub?.orgSubscription?.planId;
  if (!maxAccountCount || maxAccountCount < 0) {
    // unlimited
    return;
  }
  if (count >= maxAccountCount) {
    throw newErrWithCode(
      `reached account limit in ${planId} tier, consider upgrading`,
      403,
      Err.MAX_ACCOUNT_COUNT_REACHED
    );
  }
}
