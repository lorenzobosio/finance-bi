import { generateKeyPairSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// Wave-0 RED test (ING-02) — freezes the contract for the not-yet-existent
// src/lib/ingestion/enable-banking/jwt.ts. This file imports `signEbJwt`, which
// does NOT exist yet (it is created GREEN in plan 01-04). Until then this suite
// fails at import-resolution time — that is the intended RED state.
//
// Contract frozen here (RESEARCH § Code Examples — signEbJwt):
//   signEbJwt(appId, privateKeyPem) -> Promise<string> (a compact JWS)
//   - protected header: alg="RS256", kid===appId, typ="JWT"
//   - payload: iss="enablebanking.com", aud="api.enablebanking.com"
//   - exp - iat <= 86400 (24h ceiling); for a "1h" token, exp - iat === 3600
//
// The RSA key is generated at test setup (never hardcoded — no real key material
// in a committed file).
import { signEbJwt } from "@/lib/ingestion/enable-banking/jwt";

/** Decode a base64url segment of a compact JWS into a parsed JSON object. */
function decodeSegment(segment: string): Record<string, unknown> {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

const APP_ID = "app-id-1234-kid";

let privateKeyPem: string;

beforeAll(() => {
  // Generate a throwaway RSA-2048 keypair, export the private key as PKCS8 PEM.
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
});

describe("signEbJwt — Enable Banking RS256 app credential (ING-02)", () => {
  it("sets a protected header with alg=RS256 and kid === appId", async () => {
    const jwt = await signEbJwt(APP_ID, privateKeyPem);
    const [headerSeg] = jwt.split(".");
    const header = decodeSegment(headerSeg);
    expect(header.alg).toBe("RS256");
    expect(header.kid).toBe(APP_ID);
    expect(header.typ).toBe("JWT");
  });

  it("sets the EB issuer and audience claims", async () => {
    const jwt = await signEbJwt(APP_ID, privateKeyPem);
    const [, payloadSeg] = jwt.split(".");
    const payload = decodeSegment(payloadSeg);
    expect(payload.iss).toBe("enablebanking.com");
    expect(payload.aud).toBe("api.enablebanking.com");
  });

  it("bounds the token TTL to the 24h ceiling and uses exactly 1h", async () => {
    const jwt = await signEbJwt(APP_ID, privateKeyPem);
    const [, payloadSeg] = jwt.split(".");
    const payload = decodeSegment(payloadSeg);
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(typeof iat).toBe("number");
    expect(typeof exp).toBe("number");
    expect(exp - iat).toBeLessThanOrEqual(86400); // 24h PSD2 ceiling
    expect(exp - iat).toBe(3600); // signEbJwt issues a 1h token
  });

  it("produces a three-segment compact JWS", async () => {
    const jwt = await signEbJwt(APP_ID, privateKeyPem);
    expect(jwt.split(".")).toHaveLength(3);
  });
});
