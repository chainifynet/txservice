import { AppCtx } from "@chainifynet/common-libs-node";
import { AWSError } from "aws-sdk";
import { newErrWithCode } from "../../common/errs";
import { fromBase64Url, toBase64Url } from "../../common/utils";
import { ddbClient } from "../../config/aws";
import { vaultTable } from "../../config/variables";
import { InitWalletStatus, KeygenResult, Vault, VaultStatus } from "../../types/types";
import { Metric, getUpdateMetricParams } from "./metrics";

const orgIdCreatedAtIndex = "orgId-createdAt-index";
/**
 * Creates a vault
 */
export const createVault = async (vault: Vault) => {
  return ddbClient
    .transactWrite({
      TransactItems: [
        {
          // add the vault
          Put: {
            TableName: vaultTable,
            Item: vault,
            ConditionExpression: "attribute_not_exists(vaultId)",
          },
        },
        {
          // add to metrics the new vault count for the org
          Update: getUpdateMetricParams(vault.orgId, Metric.VAULT_COUNT),
        },
      ],
    })
    .promise()
    .catch((e: AWSError) => {
      if (e.code === "TransactionCanceledException" && e.message.includes("ConditionalCheckFailed")) {
        throw newErrWithCode(`vault ${vault.vaultId} already exists`, 409);
      }
      throw e;
    });
};

/**
 * Will update the vault status and keygen job id to retry the keygen job in case of previous failure
 */
export const retryKeyGenSetup = async (
  appCtx: AppCtx,
  orgId: string,
  vaultId: string,
  jobId: string
): Promise<Vault> => {
  try {
    const res = await ddbClient
      .update({
        TableName: vaultTable,
        Key: {
          vaultId: vaultId,
        },
        ConditionExpression: "#status = :expectedStatus and attribute_not_exists(keyId) and orgId = :orgId",
        UpdateExpression:
          "SET #status = :status, keygenJobId = :keygenJobId, updatedAt = :updatedAt ADD retryCount :retryCount",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":expectedStatus": VaultStatus.KEYGEN_FAILED,
          ":status": VaultStatus.KEYGEN_IN_PROGRESS,
          ":keygenJobId": jobId,
          ":orgId": orgId,
          ":retryCount": 1,
          ":updatedAt": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      })
      .promise();
    if (res.Attributes) {
      return res.Attributes as Vault;
    }
    throw newErrWithCode("vault not found", 404);
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`vault ${vaultId} already has a keyId or wrong status`, e.message);
      throw newErrWithCode(`cannot retry keygen`, 409);
    }
    throw e;
  }
};

export const getVault = async (orgId: string, vaultId: string): Promise<Vault> => {
  const res = await ddbClient
    .get({
      TableName: vaultTable,
      Key: {
        vaultId,
      },
      ConsistentRead: true,
    })
    .promise();
  if (!res.Item || res.Item.orgId !== orgId) {
    throw newErrWithCode(`vault ${vaultId} not found`, 404);
  }
  return res.Item as Vault;
};

export const getVaultsOrderedByDate = async (orgId: string, esk?: string, limit = 50): Promise<PaginatedVaults> => {
  const res = await ddbClient
    .query({
      TableName: vaultTable,
      IndexName: orgIdCreatedAtIndex,
      KeyConditionExpression: "orgId = :orgId",
      ExpressionAttributeValues: {
        ":orgId": orgId,
      },
      ScanIndexForward: false,
      ExclusiveStartKey: fromBase64Url(esk),
      Limit: limit,
    })
    .promise();
  return {
    vaults: <Vault[]>res.Items,
    last: toBase64Url(res.LastEvaluatedKey),
  };
};

export const updateVaultAfterKeygenSuccess = async (
  appCtx: AppCtx,
  orgId: string,
  vaultId: string,
  res: KeygenResult
): Promise<void> => {
  try {
    await ddbClient
      .update({
        TableName: vaultTable,
        Key: {
          vaultId: vaultId,
        },
        ConditionExpression: "#status = :expectedStatus and attribute_not_exists(keyId) and orgId = :orgId",
        UpdateExpression: "SET #status = :status, keyId = :keyId, pubKey = :pubKey, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":expectedStatus": VaultStatus.KEYGEN_IN_PROGRESS,
          ":status": VaultStatus.COMPLETED,
          ":keyId": res.keyId,
          ":pubKey": {
            x: res.x,
            y: res.y,
            type: res.type,
            curve: res.curve,
          },
          ":orgId": orgId,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`vault ${vaultId} already has a keyId or wrong status`, e.message);
      throw newErrWithCode(`cannot add key to vault`, 409);
    }
    throw e;
  }
};

export const updateVaultAfterKeygenFailed = async (appCtx: AppCtx, orgId: string, vaultId: string): Promise<void> => {
  try {
    await ddbClient
      .update({
        TableName: vaultTable,
        Key: {
          vaultId: vaultId,
        },
        ConditionExpression: "orgId = :orgId and #status = :expectedStatus and attribute_not_exists(keyId)",
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":expectedStatus": VaultStatus.KEYGEN_IN_PROGRESS,
          ":orgId": orgId,
          ":status": VaultStatus.KEYGEN_FAILED,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`vault ${vaultId} already has a keyId or wrong status`, e.message);
      throw newErrWithCode(`cannot add key to vault`, 409);
    }
    throw e;
  }
};

export const updateInitWalletStatus = async (
  appCtx: AppCtx,
  vaultId: string,
  status: InitWalletStatus,
  walletId = ""
): Promise<void> => {
  try {
    await ddbClient
      .update({
        TableName: vaultTable,
        Key: {
          vaultId: vaultId,
        },
        ConditionExpression: "attribute_exists(vaultId) AND attribute_not_exists(initWallet.walletId)",
        UpdateExpression: "SET initWallet.#status = :status, initWallet.walletId = :walletId, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": status,
          ":walletId": walletId,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`vault ${vaultId} doesn't exist`, e.message);
      throw newErrWithCode(`vault ${vaultId} not found`, 404);
    }
    throw e;
  }
};

export type PaginatedVaults = {
  vaults: Vault[];
  last?: string;
};
