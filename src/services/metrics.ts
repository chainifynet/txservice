import { AppCtx } from "@chainifynet/common-libs-node";
import { Metric, getMetrics as storeGetMetrics } from "../services/store/metrics";
import * as userClient from "../services/client/user";

export const getMetrics = async (appCtx: AppCtx, orgId: string): Promise<ComposedMetrics> => {
  return appCtx.cache.get(
    `METRICS#${orgId}`,
    async () => {
      // prettier-ignore
      const [metrics, orgWithSub] = await Promise.all([
        storeGetMetrics(appCtx, orgId), 
        userClient.getOrgWithSubscription(appCtx, orgId)
      ]);

      const features = orgWithSub?.orgSubscription?.features;
      return {
        [Metric.VAULT_COUNT]: {
          count: metrics?.[Metric.VAULT_COUNT]?.count || 0,
          max: features?.maxVaultCount,
          name: Metric.VAULT_COUNT,
        },
        [Metric.ACCOUNT_COUNT]: {
          count: metrics?.[Metric.ACCOUNT_COUNT]?.count || 0,
          max: features?.maxAccountCount,
          name: Metric.ACCOUNT_COUNT,
        },
        [Metric.USER_COUNT]: {
          count: orgWithSub.userCount,
          max: features?.maxUserCount,
          name: Metric.USER_COUNT,
        },
      };
    },
    5 // 5 seconds
  );
};

type ComposedMetrics = Record<
  Metric,
  {
    count: number;
    max?: number;
    name: Metric;
  }
>;
