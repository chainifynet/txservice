import { AppCtx } from "@chainifynet/common-libs-node";
import { DocumentClient, QueryInput } from "aws-sdk/clients/dynamodb";
import { newErrWithCode } from "../../common/errs";
import { fromBase64Url, toBase64Url } from "../../common/utils";
import { ddbClient } from "../../config/aws";
import { txTable } from "../../config/variables";
import { SignResult, Tx, TxSignedResult, TxStatus, TxType } from "../../types/types";

const walletIdCreatedAtIndex = "walletId-createdAt-index";
const txHashIndex = "txHash-index";

export const createTx = async (tx: Tx) => {
  try {
    await ddbClient
      .put({
        TableName: txTable,
        Item: tx,
        ConditionExpression: "attribute_not_exists(txId)",
      })
      .promise();
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      throw newErrWithCode(`tx already exists`, 409);
    }
    throw e;
  }
};

export const getTxs = async (walletId: string): Promise<Tx[]> => {
  // TODO pagination
  const res = await ddbClient
    .query({
      TableName: txTable,
      KeyConditionExpression: "walletId = :walletId",
      ExpressionAttributeValues: {
        ":walletId": walletId,
      },
      ScanIndexForward: false,
    })
    .promise();
  if (!res.Items?.length) {
    return [];
  }
  return res.Items as Tx[];
};

export const getMontlyTxs = async (appCtx: AppCtx, walletId: string, month: string): Promise<Tx[]> => {
  let lek;
  const all = [];
  do {
    const input = {
      TableName: txTable,
      IndexName: walletIdCreatedAtIndex,
      KeyConditionExpression: "walletId = :walletId AND begins_with(createdAt, :month)",
      ExpressionAttributeValues: {
        ":walletId": walletId,
        ":month": month,
      },
      ScanIndexForward: false,
    } as QueryInput;
    if (lek) {
      input.ExclusiveStartKey = lek;
    }
    const res = await ddbClient.query(input).promise();
    lek = res.LastEvaluatedKey;
    all.push(...res.Items);
  } while (lek);
  return all as Tx[];
};

export const getTxsOrderedByDate = async (
  walletId: string,
  esk: string = undefined,
  limit = 50
): Promise<PaginatedTxs> => {
  const res = await ddbClient
    .query({
      TableName: txTable,
      IndexName: walletIdCreatedAtIndex,
      KeyConditionExpression: "walletId = :walletId",
      ExpressionAttributeValues: {
        ":walletId": walletId,
      },
      ScanIndexForward: false,
      ExclusiveStartKey: fromBase64Url(esk),
      Limit: limit,
    })
    .promise();
  return {
    txs: res.Items as Tx[],
    last: toBase64Url(res.LastEvaluatedKey),
  };
};

export type PaginatedTxs = {
  txs: Tx[];
  last: string;
};

export const getTx = async (walletId: string, txId: string): Promise<Tx> => {
  const res = await ddbClient
    .get({
      TableName: txTable,
      Key: {
        walletId,
        txId,
      },
    })
    .promise();
  if (!res.Item) {
    throw newErrWithCode(`tx ${txId} not found`, 404);
  }
  return res.Item as Tx;
};

export const updateAndGetTxForSign = async (
  appCtx: AppCtx,
  walletId: string,
  txId: string,
  jobId: string,
  txData?: { unsignedTx: any; toSign: string }
): Promise<Tx> => {
  let updateExpression = "SET #status = :status, signJobId = :signJobId, updatedAt = :updatedAt";
  let conditionExpression = "#status = :expectedS1 AND attribute_not_exists(signature)";
  const expressionAttributeValues = {
    ":expectedS1": TxStatus.NEW,
    ":status": TxStatus.SIGN_IN_PROGRESS,
    ":signJobId": jobId,
    ":updatedAt": new Date().toISOString(),
  } as DocumentClient.ExpressionAttributeValueMap;

  if (txData?.toSign && txData?.unsignedTx) {
    updateExpression += ", tx = :tx, toSign = :toSign";
    conditionExpression += " AND attribute_not_exists(toSign)";
    expressionAttributeValues[":tx"] = txData.unsignedTx;
    expressionAttributeValues[":toSign"] = txData.toSign;
  }
  try {
    const res = await ddbClient
      .update({
        TableName: txTable,
        Key: {
          walletId,
          txId,
        },
        UpdateExpression: updateExpression,
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
      .promise();
    if (res.Attributes) {
      return res.Attributes as Tx;
    }
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`wrong status or existing signature or toSign`, e.message);
      throw newErrWithCode(`error tx cannot be signed`, 404);
    }
    throw e;
  }
};

export const updateAndGetUtxoTxForSign = async (appCtx: AppCtx, walletId: string, txId: string): Promise<Tx> => {
  try {
    const res = await ddbClient
      .update({
        TableName: txTable,
        Key: {
          walletId,
          txId,
        },
        ConditionExpression: "#status = :expectedS1",
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":expectedS1": TxStatus.NEW,
          ":status": TxStatus.SIGN_IN_PROGRESS,
          ":updatedAt": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      })
      .promise();
    if (res.Attributes) {
      return res.Attributes as Tx;
    }
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`wrong status`, e.message);
      throw newErrWithCode(`error tx cannot be signed`, 404);
    }
    throw e;
  }
};

export const updateTxAfterBroadcast = async (
  appCtx: AppCtx,
  walletId: string,
  txId: string,
  newStatus: TxStatus
): Promise<Tx> => {
  appCtx.log.info(`DDB updating tx (${walletId},${txId}) to ${newStatus}`);
  try {
    const res = await ddbClient
      .update({
        TableName: txTable,
        Key: {
          walletId,
          txId,
        },
        ConditionExpression: "#status = :expectedStatus",
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":expectedStatus": TxStatus.SIGNED,
          ":status": newStatus,
          ":updatedAt": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      })
      .promise();
    if (res.Attributes) {
      return <Tx>res.Attributes;
    }
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`wrong tx status`, e.message);
      throw newErrWithCode(`failed to update tx`, 400);
    }
    throw e;
  }
};

export const updateTxAfterSignSuccess = async (
  appCtx: AppCtx,
  walletId: string,
  txId: string,
  sig: SignResult,
  txSigned: TxSignedResult
): Promise<void> => {
  try {
    appCtx.log.info(`DDB updating tx (${walletId},${txId}) to SIGNED`);
    const values = {
      ":expectedStatus": TxStatus.SIGN_IN_PROGRESS,
      ":status": TxStatus.SIGNED,
      ":signature": {
        sig: sig.signature,
        r: sig.r,
        s: sig.s,
        v: sig.signatureRecovery,
        m: sig.m,
      },
      ":tx": txSigned.signedTx, // will override the unsigned tx with the signed one
      ":txHash": txSigned.txHash,
      ":updatedAt": new Date().toISOString(),
    } as Record<string, any>;
    if (txSigned.txHex) {
      values[":signedTxHex"] = txSigned.txHex;
    }
    await ddbClient
      .update({
        TableName: txTable,
        Key: {
          walletId,
          txId,
        },
        ConditionExpression: "#status = :expectedStatus and attribute_not_exists(signature)",
        UpdateExpression:
          "SET " +
          "#status = :status, " +
          "signature = :signature, " +
          "tx = :tx, " +
          (txSigned.txHex ? "signedTxHex = :signedTxHex, " : "") +
          "txHash = if_not_exists(txHash, :txHash), " +
          "updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: values,
      })
      .promise();
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`wrong tx status or sig already exists`, e.message);
      throw newErrWithCode(`failed to update tx`, 400);
    }
    throw e;
  }
};

export const updateUtxoTxAfterSignSuccess = async (
  appCtx: AppCtx,
  walletId: string,
  txId: string,
  txHash: string,
  signedTxHex: string
): Promise<void> => {
  try {
    appCtx.log.info(`DDB updating utxo tx (${walletId},${txId}) to SIGNED`);
    await ddbClient
      .update({
        TableName: txTable,
        Key: {
          walletId,
          txId,
        },
        ConditionExpression: "#status = :expectedStatus",
        UpdateExpression: "SET #status = :status, signedTxHex = :signedTxHex, txHash = :txHash, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":expectedStatus": TxStatus.SIGN_IN_PROGRESS,
          ":signedTxHex": signedTxHex,
          ":status": TxStatus.SIGNED,
          ":txHash": txHash,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`wrong tx status`, e.message);
      throw newErrWithCode(`failed to update tx`, 400);
    }
    throw e;
  }
};

export const updateTxAfterSignFailed = async (appCtx: AppCtx, walletId: string, txId: string): Promise<void> => {
  try {
    appCtx.log.info(`DDB updating tx (${walletId},${txId}) to FAILED_SIGNED`);
    await ddbClient
      .update({
        TableName: txTable,
        Key: {
          walletId,
          txId,
        },
        ConditionExpression: "#status = :expectedStatus and attribute_not_exists(signature)",
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":expectedStatus": TxStatus.SIGN_IN_PROGRESS,
          ":status": TxStatus.FAILED_SIGNED,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      appCtx.log.error(`wrong status or signature already exists`, e.message);
      throw newErrWithCode(`cannot fail tx sign`, 400);
    }
    throw e;
  }
};

export const getTxsByHash = async (appCtx: AppCtx, orgId: string, txHash: string): Promise<Tx[]> => {
  const res = await ddbClient
    .query({
      TableName: txTable,
      IndexName: txHashIndex,
      KeyConditionExpression: "txHash = :txHash",
      FilterExpression: "orgId = :orgId AND #type <> :excludeType",
      ExpressionAttributeNames: {
        "#type": "type",
      },
      ExpressionAttributeValues: {
        ":txHash": txHash,
        ":orgId": orgId,
        ":excludeType": TxType.FEE_FOR_TOKEN_SEND,
      },
    })
    .promise();
  return (res.Items as Tx[]) || [];
};
