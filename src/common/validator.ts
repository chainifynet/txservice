import * as Validator from "validatorjs";
import { isAddress } from "../services/bc/bc";
import { getSupportedAssetIds, supportedFiatCurrencies } from "./asset";

Validator.register(
  "uuid",
  (value) => {
    if (!value || typeof value !== "string") {
      return false;
    }
    return Boolean(value.match(/^[A-Z0-9]{8}-([A-Z0-9]{4}-){3}[A-Z0-9]{12}$/i));
  },
  "The :attribute must be a valid UUID."
);

Validator.register(
  "asset",
  (value) => {
    if (!value || typeof value !== "string") {
      return false;
    }
    return getSupportedAssetIds().includes(value);
  },
  "The :attribute must be a valid asset."
);

Validator.register(
  "assets",
  (value) => {
    if (!value || !Array.isArray(value)) {
      return false;
    }
    return value.every((v) => getSupportedAssetIds().includes(v));
  },
  "The :attribute must be a valid list of assets."
);

Validator.register(
  "fiats",
  (value) => {
    if (!value || !Array.isArray(value)) {
      return false;
    }
    return value.every((v) => supportedFiatCurrencies.includes(v));
  },
  "The :attribute must be a valid list of fiat currencies."
);

Validator.register(
  "anyaddress",
  (value) => {
    if (!value || typeof value !== "string") {
      return false;
    }
    return isAddress(value);
  },
  "The :attribute must be a valid address."
);

export const validate = (data: any, rules: Validator.Rules, messages?: Validator.ErrorMessages) => {
  const validation = new Validator(data, rules, messages);

  if (validation.fails()) {
    throw Object.assign(new Error("validation error"), { status: 400, errors: validation.errors });
  }

  return validation.passes();
};
