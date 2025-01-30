import { KoaCtx } from "@chainifynet/common-libs-node";
import * as metricsService from "../services/metrics";

export const getMetrics = async (ctx: KoaCtx): Promise<void> => {
  const { orgId } = ctx.appCtx.state;

  const metrics = await metricsService.getMetrics(ctx.appCtx, orgId);

  ctx.body = { metrics };
};
