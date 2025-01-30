import * as vaultModel from "../services/vault";
import * as txModel from "../services/tx";
import { KeygenJobResult, SignJobResult } from "../types/types";
import { KoaCtx } from "@chainifynet/common-libs-node";

export const keygenCallback = async (ctx: KoaCtx) => {
  const keygenRes = <KeygenJobResult>ctx.request.body;
  await vaultModel.keygenCallback(ctx.appCtx, keygenRes);
  ctx.body = { status: "ok" };
};

export const signCallback = async (ctx: KoaCtx) => {
  const signRes = <SignJobResult>ctx.request.body;
  await txModel.signCallback(ctx.appCtx, signRes);
  ctx.body = { status: "ok" };
};
