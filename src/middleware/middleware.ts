/* eslint-disable @typescript-eslint/ban-ts-comment */
import { validate } from "../common/validator";
import { KoaMiddlewareHandler } from "@chainifynet/common-libs-node";

const userHeadersValidationRules = {
  userId: "required|max:36",
  orgId: "required|uuid",
};

export const userHeadersMiddleware: KoaMiddlewareHandler = async (ctx, next) => {
  const orgId = <string>ctx.request.header.orgid;
  const userId = <string>ctx.request.header.userid;
  try {
    validate({ orgId, userId }, userHeadersValidationRules);
    ctx.appCtx.state.orgId = orgId;
    ctx.appCtx.state.userId = userId;
  } catch (err) {
    ctx.log.error({ err }, `failed header middleware`);
    ctx.status = err.status;
    ctx.body = err.errors || err.message;
    return;
  }
  return next();
};
