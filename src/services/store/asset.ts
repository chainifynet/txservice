import { Asset } from "../../types/types";
import { ddbClient } from "../../config/aws";
import { assetTable } from "../../config/variables";

// TODO ok for now with no pagination since it's only intended to run once on startup and we are expected to return less than 100
export async function getAllAssets(mainnet = true): Promise<Asset[]> {
  const items: Asset[] = [];
  let lastEvaluatedKey;
  do {
    const { Items, LastEvaluatedKey } = await ddbClient
      .scan({
        TableName: assetTable,
        ExclusiveStartKey: lastEvaluatedKey,
        FilterExpression: "isMainnet = :val",
        ExpressionAttributeValues: { ":val": mainnet },
      })
      .promise();
    if (Items && Items.length) {
      items.push(...(Items as Asset[]));
    }
    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return items;
}