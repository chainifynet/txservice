import { toList } from "../common/utils";
import { validate } from "../common/validator";
import * as rateModel from "../services/rate";
import { KoaCtx } from "@chainifynet/common-libs-node";

const priceValidationRules = {
  currencies: "array|assets",
  vsCurrencies: "array|fiats",
};

/**
 * Send will do the same as `createTx` but `vt-tx-automation` will immediatelly sign it and then broadcast it
 * @param ctx
 */
export const price = async (ctx: KoaCtx) => {
  const currencies = toList(ctx.query.currencies as string);
  const vsCurrencies = toList(ctx.query.vsCurrencies as string);

  validate({ currencies, vsCurrencies }, priceValidationRules);

  const prices = await rateModel.getPrices(ctx.appCtx, currencies, vsCurrencies);
  ctx.body = prices;
};
