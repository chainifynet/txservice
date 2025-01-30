import { v5 as uuidv5 } from "uuid";

export function toBase64Url(data: any): string {
  if (!data) {
    return undefined;
  }
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function fromBase64Url(str: string): any {
  if (!str) {
    return undefined;
  }
  return JSON.parse(Buffer.from(str, "base64url").toString());
}

/**
 * Splits a string value into an array by "," otherwise returns an empty arrray
 * @param val The string value to split by ","
 */
export function toList(val: string) {
  return val ? val.split(",") : [];
}

export function generateDeterministicTxId(walletId: string, externalId: string): string {
  return uuidv5(`${walletId}#${externalId}`, uuidv5.URL);
}

