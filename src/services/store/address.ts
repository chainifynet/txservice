import { AppCtx } from "@chainifynet/common-libs-node";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { ddbClient } from "../../config/aws";
import { addressTable } from "../../config/variables";
import { Address } from "../../types/types";

export function getAddressPutInput(address: Address): DocumentClient.PutItemInput {
  return {
    TableName: addressTable,
    Item: {
      ...address,
      PK: `address#${address.address}`,
      SK: `asset#${address.assetId}`,
    },
    ConditionExpression: "attribute_not_exists(PK)",
  };
}

export async function getAddress(appCtx: AppCtx, assetId: string, address: string): Promise<Address> {
  const { Item } = await ddbClient
    .get({
      TableName: addressTable,
      Key: {
        PK: `address#${address}`,
        SK: `asset#${assetId}`,
      },
    })
    .promise();
  if (!Item) {
    appCtx.log.info(`address not found: ${address}`);
    return null;
  }
  return Item as Address;
}

/**
 * Get addresses from dynamo in batches of 100
 */
export async function getAddresses(
  appCtx: AppCtx,
  assetId: string,
  addresses: string[]
): Promise<Record<string, Address>> {
  const batchSize = 100;
  const batches = Math.ceil(addresses.length / batchSize);
  const results: Record<string, Address> = {};

  for (let i = 0; i < batches; i++) {
    const start = i * batchSize;
    const end = (i + 1) * batchSize;
    const batch = addresses.slice(start, end);

    const { Responses } = await ddbClient
      .batchGet({
        RequestItems: {
          [addressTable]: {
            Keys: batch.map((address) => ({
              PK: `address#${address}`,
              SK: `asset#${assetId}`,
            })),
          },
        },
      })
      .promise();
    Responses[addressTable].forEach((item: Address) => (results[item.address] = item));
  }

  return results;
}
