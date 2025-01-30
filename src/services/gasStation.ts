import * as sweepManagerClient from "./client/sweepManager";
import * as bc from "./bc/bc";
import { AppCtx } from "@chainifynet/common-libs-node";
import { getAssetData } from "../common/asset";

export const getGasStation = async (appCtx: AppCtx, orgId: string, assetId: string) => {
  const resp = await getGasStationCached(appCtx, orgId, assetId);
  if (resp.address) {
    resp.balance = await getBalanceCached(appCtx, assetId, resp.address);
  }
  return resp;
};

export const getGasCap = async (appCtx: AppCtx, orgId: string, assetId: string) => {
  const resp = await getGasStationCached(appCtx, orgId, assetId);
  return resp.gasCap;
};

export const getGasStationsForOrg = async (appCtx: AppCtx, orgId: string) => {
  const resp = await getGasStationsCached(appCtx, orgId);
  for (let i = 0; i < resp.gasStations.length; i++) {
    resp.gasStations[i].balance = await getBalanceCached(
      appCtx,
      resp.gasStations[i].assetId,
      resp.gasStations[i].address
    );
  }
  return resp;
};

async function getGasStationsCached(appCtx: AppCtx, orgId: string) {
  return appCtx.cache.get(
    `gasstation:${orgId}`,
    () => sweepManagerClient.getGasStationsForOrg(appCtx, orgId),
    60
  );
}
async function getGasStationCached(appCtx: AppCtx, orgId: string, assetId: string) {
  return appCtx.cache.get(
    `gasstation:${orgId}:${assetId}`,
    () => sweepManagerClient.getGasStation(appCtx, orgId, assetId),
    60
  );
}

async function getBalanceCached(appCtx: AppCtx, assetId: string, address: string) {
  return appCtx.cache.get(
    `balance:${assetId}:${address}`,
    () => {
      const asset = getAssetData(assetId);
      return bc.getBalance(asset, address);
    },
    60 // 1 min
  );
}
