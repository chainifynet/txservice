import { AppCtx } from "@chainifynet/common-libs-node";
import { ec } from "elliptic";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { PubKey } from "../../types/types";

const secp256k1 = new ec("secp256k1");
const bip32 = BIP32Factory(ecc);

export function deriveChildPub(appCtx: AppCtx, { x, y }: KeyCoords, path: string, chainCode: string): PubKey {
  if (chainCode.length !== 64) {
    throw new Error("Invalid chain code");
  }
  if (x.length !== 64 || y.length !== 64) {
    throw new Error("Invalid public key lengths");
  }

  const parentPub = secp256k1.keyFromPublic({ x, y });

  const parentPubBuf = Buffer.from(parentPub.getPublic().encodeCompressed("hex"), "hex");
  const chainCodeBuf = Buffer.from(chainCode, "hex");

  const node = bip32.fromPublicKey(parentPubBuf, chainCodeBuf);
  const child = node.derivePath(path); // "m/0"

  const point = secp256k1.keyFromPublic(child.publicKey.toString("hex"), "hex");

  return {
    x: point.getPublic().getX().toString("hex", 64),
    y: point.getPublic().getY().toString("hex", 64),
    type: "ECDSAPub",
    curve: "secp256k1",
  };
}

export function parsePath(path: string): number[] {
  if (path.length === 0) {
    return [];
  }
  if (path[0] !== "m") {
    throw new Error(`invalid path ${path}`);
  }
  const pathParts = path.split("/");
  if (pathParts.length < 2) {
    throw new Error(`invalid path ${path}`);
  }
  return pathParts.slice(1).map((p) => parseInt(p, 10));
}

type KeyCoords = {
  x: string;
  y: string;
};
