import { AppCtx } from "@chainifynet/common-libs-node";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";
import { InitWalletOpts, JobStatus, JobType, KeygenJobResult, Vault, VaultStatus } from "../types/types";
import * as cosignerClient from "./client/cosigner";
import * as userClient from "./client/user";
import * as vaultStore from "./store/vault";
import * as metricsStore from "./store/metrics";
import { PaginatedVaults } from "./store/vault";
import KSUID = require("ksuid");
import { newErrWithCode, Err } from "../common/errs";

/**
 * Creates a new vault and sends the keygen job to cosigners
 */
export const createVault = async (
  appCtx: AppCtx,
  orgId: string,
  externalId: string,
  name: string,
  threshold: number,
  partyCount: number,
  initWallet: InitWalletOpts
): Promise<Vault> => {
  const now = new Date();
  const jobId = (await KSUID.random()).string;
  const { org, orgSubscription } = await userClient.getOrgWithSubscription(appCtx, orgId);
  await validateVaultPlan(appCtx, orgSubscription);

  const vaultId = externalId ? generateDeterministicVaultId(orgId, externalId) : uuidv4();
  const vault: Vault = {
    orgId,
    vaultId,
    name,
    threshold,
    partyCount,
    status: VaultStatus.KEYGEN_IN_PROGRESS,
    keygenJobId: jobId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    externalId,
    initWallet,
  };

  await vaultStore.createVault(vault);

  await cosignerClient.initiateJob(appCtx, orgId, {
    jobId,
    type: JobType.KeygenInit,
    cosigners: org.cosigners,
    metadata: {
      orgId,
      vaultId: vault.vaultId,
    },
  });
  return vault;
};

/**
 * Creates a new job id and retries the keygen job only if KEYGEN_FAILED
 */
export const retryCreateVault = async (appCtx: AppCtx, orgId: string, vaultId: string): Promise<Vault> => {
  const jobId = (await KSUID.random()).string;
  const org = await userClient.getOrg(appCtx, orgId);
  const vault = await vaultStore.retryKeyGenSetup(appCtx, orgId, vaultId, jobId);

  await cosignerClient.initiateJob(appCtx, orgId, {
    jobId,
    type: JobType.KeygenInit,
    cosigners: org.cosigners,
    metadata: {
      orgId,
      vaultId: vault.vaultId,
    },
  });
  return vault;
};

export const keygenCallback = async (appCtx: AppCtx, res: KeygenJobResult) => {
  appCtx.log.info({ keygenCallback: res }, "keygenCallback");
  if (res.status === JobStatus.Finished) {
    await vaultStore.updateVaultAfterKeygenSuccess(appCtx, res.orgId, res.vaultId, res.keygenResult);
    return;
  }
  if (res.status === JobStatus.Failed) {
    await vaultStore.updateVaultAfterKeygenFailed(appCtx, res.orgId, res.vaultId);
    return;
  }
};

export const getVault = async (orgId: string, vaultId: string): Promise<Vault> => {
  return vaultStore.getVault(orgId, vaultId);
};

export const getVaults = async (orgId: string, esk?: string): Promise<PaginatedVaults> => {
  return vaultStore.getVaultsOrderedByDate(orgId, esk);
};

function generateDeterministicVaultId(orgId: string, externalId: string): string {
  return uuidv5(`$${orgId}${externalId}`, uuidv5.URL);
}

async function validateVaultPlan(appCtx: AppCtx, orgSubscription: userClient.OrgSubscription) {
  const maxVaultCount = orgSubscription?.features?.maxVaultCount;
  if (!maxVaultCount || maxVaultCount < 0) {
    // unlimited
    return;
  }
  const count = await metricsStore.getMetric(appCtx, orgSubscription?.orgId, metricsStore.Metric.VAULT_COUNT);
  if (count >= maxVaultCount) {
    throw newErrWithCode(
      `reached vault limit in ${orgSubscription?.planId} tier, consider upgrading`,
      403,
      Err.MAX_VAULT_COUNT_REACHED
    );
  }
}
