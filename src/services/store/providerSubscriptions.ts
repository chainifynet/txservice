import { ddbClient } from "../../config/aws";
import { providerSubscriptionTable } from "../../config/variables";
import { SubscriptionProvider } from "../../types/types";

type ProviderSubscription = {
  address: string;
  assetId: string;
  subscriptionId: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Holds the provider (tatum) subscription id for the address
 * @returns `false` if subscription already exists (`true` if new subscription created)
 */
export const createSubscription = async (address: string, assetId: string): Promise<boolean> => {
  const now = new Date().toISOString();
  try {
    await ddbClient
      .put({
        TableName: providerSubscriptionTable,
        ConditionExpression: "attribute_not_exists(subscriptionId) and attribute_not_exists(subscriptions)",
        Item: {
          address,
          assetId,
          createdAt: now,
          updatedAt: now,
        } as ProviderSubscription,
      })
      .promise();
    return true;
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      return false;
    }
    throw e;
  }
};

export const updateSubscription = async (address: string, subscriptions: Subscription[]): Promise<void> => {
  const now = new Date().toISOString();
  try {
    await ddbClient
      .update({
        TableName: providerSubscriptionTable,
        Key: {
          address,
        },
        UpdateExpression: "set subscriptions = :subscriptions, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":subscriptions": subscriptions,
          ":updatedAt": now,
        },
      })
      .promise();
  } catch (e) {
    throw e;
  }
};

type Subscription = {
  id: string;
  provider: SubscriptionProvider;
  streamId?: string;
};
