import { userServiceUrl } from "../../config/variables";
import { AppCtx } from "@chainifynet/common-libs-node";

export async function getOrg(ctx: AppCtx, orgId: string): Promise<Org> {
  const res = await ctx.API.get(`${userServiceUrl}/private/orgs/${orgId}`); // org, orgSubscription, userCount
  return res.data.data?.org;
}

export async function getOrgWithSubscription(
  ctx: AppCtx,
  orgId: string
): Promise<{ org: Org; orgSubscription: OrgSubscription; userCount: number }> {
  const res = await ctx.API.get(`${userServiceUrl}/private/orgs/${orgId}`); // org, orgSubscription, userCount
  return res.data.data;
}

const enum OrgSubscriptionStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export interface PlanFeatures {
  maxVaultCount: number;
  maxAccountCount: number;
  maxUserCount: number;
}

export interface OrgSubscription {
  planId: Plan;
  orgId: string;
  status: OrgSubscriptionStatus;
  expiresAt?: string;
  features: PlanFeatures;
}

const enum OrgTenancy {
  DEFAULT = "DEFAULT",
  DEDICATED = "DEDICATED",
}

export interface Org {
  orgId: string;
  name: string;
  tenant: string;
  cosigners: string[];
  tenancy: OrgTenancy;
  moralisStreamId: string;
  chSubId?: string;
}

export enum Plan {
  DEVELOPER = "DEVELOPER",
  STARTUP = "STARTUP",
  BUSINESS = "BUSINESS",
  ENTERPRISE = "ENTERPRISE",
}
