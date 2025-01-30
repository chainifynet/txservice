import { KoaCtx } from "@chainifynet/common-libs-node";
import { validate } from "../common/validator";
import * as accountService from "../services/account";
import { Account } from "../types/types";

const createAccountValidationRules = {
  name: "required|string|min:1|max:255",
  vaultId: "required|uuid",
  externalId: "string|max:255",
};

export async function createAccount(ctx: KoaCtx) {
  const { orgId } = ctx.appCtx.state;
  const { vaultId } = ctx.params;
  const { name, externalId } = ctx.request.body;

  validate({ name, vaultId, externalId }, createAccountValidationRules);
  const account = await accountService.createAccount(ctx.appCtx, orgId, {
    name,
    vaultId,
    externalId,
  });
  ctx.body = toAccountResponse(account);
}

export const getAccounts = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId } = ctx.params;
  const last = <string>ctx.request.query.last;

  const resp = await accountService.getAccounts(ctx.appCtx, orgId, vaultId, last);
  ctx.body = { accounts: resp.accounts.map(toAccountResponse), last: resp.last };
};

export const getAccount = async (ctx: KoaCtx) => {
  const { orgId } = ctx.appCtx.state;
  const { vaultId, accountId } = ctx.params;

  const account = await accountService.getAccount(ctx.appCtx, orgId, vaultId, accountId);
  ctx.body = toAccountResponse(account);
};

function toAccountResponse(a: Account): AccountResponse {
  const res: AccountResponse = {
    accountId: a.accountId,
    name: a.name,
    vaultId: a.vaultId,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
  if (a.externalId) {
    res.externalId = a.externalId;
  }
  return res;
}

type AccountResponse = {
  accountId: string;
  name: string;
  vaultId: string;
  createdAt: string;
  updatedAt: string;
  externalId?: string;
};
