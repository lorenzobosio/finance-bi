// src/lib/ingestion/enable-banking/jwt.ts
//
// Enable Banking machine credential (ING-02, T-01-10). The JWT *is* the app
// credential — there is no client-secret exchange. We sign an RS256 token with
// `kid = <application id>`, `iss = enablebanking.com`, `aud = api.enablebanking.com`,
// and a 1h TTL (the PSD2 ceiling is 24h; 1h keeps the blast radius small).
//
// SERVER-PLANE ONLY: this module lives under src/lib/ingestion and must never be
// imported into the Next app/client bundle (FND-03). The RSA private key is read
// from env/secret by the caller and passed in as PEM — it is never logged, echoed,
// or committed (V2/V6/V7). Contract frozen in test/jwt.test.ts.

import { SignJWT, importPKCS8 } from "jose";

/**
 * Sign a 1h RS256 JWT that authenticates this application to the Enable Banking API.
 *
 * @param appId         The Enable Banking application id — used as the JWS `kid` header.
 * @param privateKeyPem The RSA private key (PKCS8 PEM). NEVER logged or committed.
 * @returns A compact JWS (three base64url segments).
 */
export async function signEbJwt(
  appId: string,
  privateKeyPem: string,
): Promise<string> {
  const key = await importPKCS8(privateKeyPem, "RS256");
  return new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: appId }) // kid = application id
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt()
    .setExpirationTime("1h") // exp - iat === 3600; the 24h ceiling is never approached
    .sign(key);
}
