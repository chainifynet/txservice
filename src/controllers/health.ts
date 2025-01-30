import { KoaCtx } from "@chainifynet/common-libs-node";

export const healthCheck = async (ctx: KoaCtx): Promise<void> => {
  ctx.body = {
    status: "ok",
  };
};
