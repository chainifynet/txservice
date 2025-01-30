import { AppCtx } from "@chainifynet/common-libs-node";
import { ddbClient } from "../../config/aws";
import { metricsTable } from "../../config/variables";
import { DocumentClient } from "aws-sdk/clients/dynamodb";

export enum Metric {
  ACCOUNT_COUNT = "ACCOUNT_COUNT",
  VAULT_COUNT = "VAULT_COUNT",
  USER_COUNT = "USER_COUNT",
}

export const getMetric = async (appCtx: AppCtx, orgId: string, metricName: Metric): Promise<number> => {
  const res = await ddbClient
    .get({
      TableName: metricsTable,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `METRICS#${metricName}`,
      },
      ConsistentRead: true,
    })
    .promise();
  if (!res.Item) {
    return 0; // not found return 0
  }
  return res.Item?.count as number;
};

export const getUpdateMetricParams = (orgId: string, metric: Metric): DocumentClient.Update => {
  return {
    TableName: metricsTable,
    Key: {
      PK: `ORG#${orgId}`,
      SK: `METRICS#${metric}`,
    },
    // prettier-ignore
    UpdateExpression: "SET " +
      "orgId = if_not_exists(orgId, :orgId), " + // insert only
      "metric = if_not_exists(metric, :metric) " + // insert only
      "ADD #count :one",
    ExpressionAttributeNames: {
      "#count": "count",
    },
    ExpressionAttributeValues: {
      ":one": 1,
      ":orgId": orgId,
      ":metric": metric,
    },
  };
};

export const getMetrics = async (appCtx: AppCtx, orgId: string): Promise<Record<Metric, MetricData> | null> => {
  const res = await ddbClient
    .query({
      TableName: metricsTable,
      KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}`,
        ":sk": "METRICS#",
      },
      // ConsistentRead: true,
    })
    .promise();
  if (!res.Items) {
    return null; // not found return null
  }
  const mappedResult = {} as Record<Metric, MetricData>;
  for (const item of res.Items) {
    mappedResult[item.metric as Metric] = {
      metric: item.metric,
      count: item.count,
    };
  }
  return mappedResult;
};

interface MetricData {
  metric: Metric;
  count: number;
}
