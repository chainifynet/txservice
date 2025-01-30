import { AppCtx } from "@chainifynet/common-libs-node";
import { AWSError } from "aws-sdk";
import { newErrWithCode } from "../../common/errs";
import { fromBase64Url, toBase64Url } from "../../common/utils";
import { ddbClient } from "../../config/aws";
import { vaultTable, accountTable } from "../../config/variables";
import { Account } from "../../types/types";
import { Metric, getUpdateMetricParams } from "./metrics";

const vaultIdCreatedAtIndex = "vaultId-createdAt-index";

export async function createAccountAndUpdateIndex(
  appCtx: AppCtx,
  account: Account,
  newIndex: number,
  chainCode: string
): Promise<void> {
  const now = new Date();
  await ddbClient
    .transactWrite({
      TransactItems: [
        {
          // update the index on the vault
          Update: {
            TableName: vaultTable,
            Key: { vaultId: account.vaultId },
            UpdateExpression:
              "SET lastIndex = :newIndex, chainCode = if_not_exists(chainCode, :chainCode), updatedAt = :updatedAt",
            ConditionExpression:
              "attribute_exists(vaultId) AND (attribute_not_exists(lastIndex) OR lastIndex = :oldIndex)",
            ExpressionAttributeValues: {
              ":newIndex": newIndex,
              ":oldIndex": newIndex - 1,
              ":chainCode": chainCode,
              ":updatedAt": now.toISOString(),
            },
          },
        },
        {
          // create the new account
          Put: {
            TableName: accountTable,
            Item: account,
            ConditionExpression: "attribute_not_exists(accountId)",
          },
        },
        {
          // add to metrics the new account count for the org
          Update: getUpdateMetricParams(account.orgId, Metric.ACCOUNT_COUNT),
        },
      ],
    })
    .promise()
    .catch((err: AWSError) => {
      if (err.code === "TransactionCanceledException") {
        if (err.message.includes("TransactionConflict")) {
          // this is a conflict, it could be retried
          appCtx.log.error(err, "transaction conflict");
          throw newErrWithCode(`conflict on saving new account`, 500);
        }
        throw newErrWithCode(`account ${account.accountId} already exists or index issue: ${newIndex}`, 409);
      }
      throw err;
    });
}

export const getAccount = async (appCtx: AppCtx, orgId: string, accountId: string): Promise<Account> => {
  const res = await ddbClient
    .get({
      TableName: accountTable,
      Key: {
        accountId,
      },
      ConsistentRead: true,
    })
    .promise();
  if (!res.Item || res.Item.orgId !== orgId) {
    throw newErrWithCode(`account ${accountId} not found`, 404);
  }
  return res.Item as Account;
};

export const getAccountsOrderedByDate = async (
  appCtx: AppCtx,
  orgId: string,
  vaultId: string,
  esk: string = undefined,
  limit = 50
): Promise<PaginatedAccounts> => {
  const res = await ddbClient
    .query({
      TableName: accountTable,
      IndexName: vaultIdCreatedAtIndex,
      KeyConditionExpression: "vaultId = :vaultId",
      FilterExpression: "orgId = :orgId",
      ExpressionAttributeValues: {
        ":orgId": orgId,
        ":vaultId": vaultId,
      },
      ScanIndexForward: false,
      ExclusiveStartKey: fromBase64Url(esk),
      Limit: limit,
    })
    .promise();
  return {
    accounts: <Account[]>res.Items,
    last: toBase64Url(res.LastEvaluatedKey),
  };
};

export type PaginatedAccounts = {
  accounts: Account[];
  last: string;
};
