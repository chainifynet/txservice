import { AppCtx } from "@chainifynet/common-libs-node";
import { AWSError } from "aws-sdk";
import { DocumentClient, QueryInput } from "aws-sdk/clients/dynamodb";
import { newErrWithCode } from "../../common/errs";
import { fromBase64Url, toBase64Url } from "../../common/utils";
import { ddbClient } from "../../config/aws";
import { walletTable } from "../../config/variables";
import { Address, Wallet } from "../../types/types";
import * as addressStore from "./address";

const orgIdCreatedAtIndex = "orgId-createdAt-index";
const addressAssetIdIndex = "address-assetId-index";
const accountIdIndex = "accountId-index";

export const createWallet = async (wallet: Wallet): Promise<void> => {
  try {
    await ddbClient.put(getWalletPutInput(wallet)).promise();
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      throw newErrWithCode(`wallet already exists`, 409);
    }
    throw e;
  }
};

export async function createWalletAndAddress(appCtx: AppCtx, wallet: Wallet, address: Address): Promise<void> {
  await ddbClient
    .transactWrite({
      TransactItems: [{ Put: getWalletPutInput(wallet) }, { Put: addressStore.getAddressPutInput(address) }],
    })
    .promise()
    .catch((e: AWSError) => {
      if (e.code === "TransactionCanceledException" && e.message.includes("ConditionalCheckFailed")) {
        throw newErrWithCode(`wallet ${wallet.walletId} or address ${address.address} already exists`, 409);
      }
      throw e;
    });
}

export async function createAddressAndUpdateWallet(appCtx: AppCtx, wallet: Wallet, address: Address): Promise<void> {
  const indexName = address.isChange ? "lastChangeIndex" : "lastDepositIndex";
  const { index } = parseAddressIndex(address);
  const now = new Date();
  await ddbClient
    .transactWrite({
      TransactItems: [
        {
          Update: {
            TableName: walletTable,
            Key: { vaultId: wallet.vaultId, walletId: wallet.walletId },
            UpdateExpression: `SET ${indexName} = :newIndex, updatedAt = :updatedAt`,
            ConditionExpression: `attribute_exists(walletId) AND (attribute_not_exists(${indexName}) OR ${indexName} = :oldIndex)`,
            ExpressionAttributeValues: {
              ":newIndex": index,
              ":oldIndex": index - 1,
              ":updatedAt": now.toISOString(),
            },
          },
        },
        { Put: addressStore.getAddressPutInput(address) },
      ],
    })
    .promise()
    .catch((e: AWSError) => {
      if (e.code === "TransactionCanceledException" && e.message.includes("ConditionalCheckFailed")) {
        throw newErrWithCode(
          `address ${address.address} already exists or wallet ${wallet.walletId} index failed `,
          409
        );
      }
      throw e;
    });
}

function parseAddressIndex(address: Address): { index: number; isChange: boolean } {
  const path = address.path.split("/");
  if (path.length !== 4 && path[0] !== "m") {
    throw newErrWithCode(`invalid address path ${address.path}`, 400);
  }
  return {
    index: Number(path.pop()),
    isChange: path.pop() === "1",
  };
}

function getWalletPutInput(wallet: Wallet): DocumentClient.PutItemInput {
  return {
    TableName: walletTable,
    Item: wallet,
    ConditionExpression: "attribute_not_exists(walletId)",
  };
}

export const getWalletsByVault = async (
  orgId: string,
  vaultId: string,
  esk: string = undefined,
  limit = 50
): Promise<PaginatedWallets> => {
  const res = await ddbClient
    .query({
      TableName: walletTable,
      KeyConditionExpression: "vaultId = :vaultId",
      FilterExpression: "orgId = :orgId",
      ExpressionAttributeValues: {
        ":vaultId": vaultId,
        ":orgId": orgId,
      },
      ExclusiveStartKey: fromBase64Url(esk),
      Limit: limit,
    })
    .promise();
  return {
    wallets: <Wallet[]>res.Items,
    last: toBase64Url(res.LastEvaluatedKey),
  };
};

export const getWalletsByAssetId = async (
  orgId: string,
  vaultId: string,
  assetId: string,
  accountId?: string
): Promise<Wallet[]> => {
  const query = {
    TableName: walletTable,
    KeyConditionExpression: "vaultId = :vaultId",
    FilterExpression: "orgId = :orgId and assetId = :assetId",
    ExpressionAttributeValues: {
      ":vaultId": vaultId,
      ":orgId": orgId,
      ":assetId": assetId,
    },
  } as QueryInput;
  if (accountId) {
    query.FilterExpression += " and accountId = :accountId";
    query.ExpressionAttributeValues[":accountId"] = accountId as any;
  }
  const res = await ddbClient.query(query).promise();
  return res.Items as Wallet[];
};

export const getWallet = async (orgId: string, vaultId: string, walletId: string): Promise<Wallet> => {
  const res = await ddbClient
    .get({
      TableName: walletTable,
      Key: {
        vaultId,
        walletId,
      },
    })
    .promise();
  if (!res.Item || res.Item.orgId !== orgId) {
    throw newErrWithCode(`wallet not found`, 404);
  }
  return res.Item as Wallet;
};

export const getWalletsByOrgId = async (
  appCtx: AppCtx,
  orgId: string,
  esk: string = undefined,
  limit = 50
): Promise<PaginatedWallets> => {
  const res = await ddbClient
    .query({
      TableName: walletTable,
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
    wallets: <Wallet[]>res.Items,
    last: toBase64Url(res.LastEvaluatedKey),
  };
};

export const getWalletByAddress = async (
  appCtx: AppCtx,
  orgId: string,
  assetId: string,
  address: string
): Promise<Wallet> => {
  const res = await ddbClient
    .query({
      TableName: walletTable,
      IndexName: addressAssetIdIndex,
      KeyConditionExpression: "address = :address AND assetId = :assetId",
      FilterExpression: "orgId = :orgId",
      ExpressionAttributeValues: {
        ":orgId": orgId,
        ":address": address,
        ":assetId": assetId,
      },
    })
    .promise();
  if (!res.Items?.length) {
    return null;
  }
  if (res.Items.length > 1) {
    throw newErrWithCode(`multiple wallets found for address ${address} and asset ${assetId}`, 500);
  }
  return res.Items[0] as Wallet;
};

export const getWalletsByAddress = async (
  appCtx: AppCtx,
  orgId: string,
  address: string,
  esk: string = undefined,
  limit = 50
): Promise<PaginatedWallets> => {
  const res = await ddbClient
    .query({
      TableName: walletTable,
      IndexName: addressAssetIdIndex,
      KeyConditionExpression: "address = :address",
      FilterExpression: "orgId = :orgId",
      ExpressionAttributeValues: {
        ":orgId": orgId,
        ":address": address,
      },
      ScanIndexForward: false,
      ExclusiveStartKey: fromBase64Url(esk),
      Limit: limit,
    })
    .promise();
  return {
    wallets: <Wallet[]>res.Items,
    last: toBase64Url(res.LastEvaluatedKey),
  };
};

export const getWalletsByAccount = async (
  appCtx: AppCtx,
  orgId: string,
  accountId: string,
  esk: string = undefined,
  limit = 50
): Promise<PaginatedWallets> => {
  const res = await ddbClient
    .query({
      TableName: walletTable,
      IndexName: accountIdIndex,
      KeyConditionExpression: "accountId = :accountId",
      FilterExpression: "orgId = :orgId",
      ExpressionAttributeValues: {
        ":orgId": orgId,
        ":accountId": accountId,
      },
      ExclusiveStartKey: fromBase64Url(esk),
      Limit: limit,
    })
    .promise();
  return {
    wallets: <Wallet[]>res.Items,
    last: toBase64Url(res.LastEvaluatedKey),
  };
};

export type PaginatedWallets = {
  wallets: Wallet[];
  last: string;
};
