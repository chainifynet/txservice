import { newErrWithCode } from "../../common/errs";
import { sweepManagerUrl } from "../../config/variables";
import { AppCtx } from "@chainifynet/common-libs-node";

export const getGasStation = async (appCtx: AppCtx, orgId: string, assetId: string): Promise<GasStation> => {
  const resp = await appCtx.API.get(`${sweepManagerUrl}/gasstation/${assetId}`, {
    headers: {
      orgId,
    },
  });
  return resp.data;
};

export const getGasStationsForOrg = async (appCtx: AppCtx, orgId: string): Promise<{ gasStations: GasStation[] }> => {
  const resp = await appCtx.API.get(`${sweepManagerUrl}/gasstations`, {
    headers: {
      orgId,
    },
  });
  return resp.data;
};

export type GasStation = {
  gasCap: string;
  gasThreshold: string;
  assetId: string;
  address: string;
  balance?: string;
};

export const refuel = async (appCtx: AppCtx, orgId: string, vaultId: string, walletId: string): Promise<{ refuelTxHash: string }> => {
  try {
    const resp = await appCtx.API.post(`${sweepManagerUrl}/refuel`, { vaultId, walletId }, {
      headers: {
        orgId,
      },
    });
    return resp.data;
  } catch (error) {
    if (error.response?.status >= 400 && error.response?.status < 500) {
      const errorMessage = error.response?.data?.error || "Wallet or gas station not found";
      throw newErrWithCode(errorMessage, error.response?.status);
    }
    throw error;
  }
}
