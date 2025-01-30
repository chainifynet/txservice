import { KoaCtx } from "@chainifynet/common-libs-node";
import * as walletService from "../services/wallet";
import * as txService from "../services/tx";
import { toWalletResponse } from "./vault";
import { toTxResponse } from "./transaction";

const enum QType {
  ADDRESS = "ADDRESS",
  TX = "TX",
}

/**
 * Search for now will only be used to search wallet for address or transactions by tx hash
 *
 * This is quite restrictive since we are only using the current DDB schema indexes
 */
export const search = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const q = <string>ctx.request.query.q;
  // for now q needs to be either an address or a tx hash
  const qType = getQType(q);
  switch (qType) {
    case QType.ADDRESS: {
      const resp = await walletService.getWalletsByAddress(ctx.appCtx, orgId, q);
      ctx.body = { wallets: resp.wallets.map(toWalletResponse) };
      break;
    }
    case QType.TX: {
      const resp = await txService.getTxsByHash(ctx.appCtx, orgId, q);
      ctx.body = { txs: resp.map(toTxResponse) };
      break;
    }
    default:
      ctx.throw(400, "invalid term, must be an address or a tx hash");
  }
};

const patterns = {
  [QType.ADDRESS]: [
    /^T[a-zA-Z1-9]{33}$/, // Tron address
    /^0x[a-fA-F0-9]{40}$/, // Eth address
  ],
  [QType.TX]: [
    /^[a-fA-F0-9]{64}$/, // Tron tx hash
    /^0x[a-fA-F0-9]{64}$/, // Eth tx hash
  ],
};

function getQType(input: string): string | null {
  const res = Object.entries(patterns).find(([, val]) => val.some((p) => p.test(input)));
  return res ? res[0] : null;
}
