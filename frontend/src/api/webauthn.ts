// Browser side of the passkey ceremonies. The server speaks the go-webauthn
// JSON format (base64url strings); the browser API wants ArrayBuffers.

import { auth, account } from "./endpoints";

const base64url = {
  encode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  },
  decode(value: string): Uint8Array<ArrayBuffer> {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const out = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  },
};

export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials;
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isPasskeySupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

type ServerCredentialDescriptor = { id: string; type: string; transports?: string[] };

function toRequestOptions(pk: Record<string, unknown>): PublicKeyCredentialRequestOptions {
  const allow = (pk.allowCredentials as ServerCredentialDescriptor[] | undefined) ?? [];
  return {
    challenge: base64url.decode(pk.challenge as string),
    rpId: pk.rpId as string | undefined,
    timeout: pk.timeout as number | undefined,
    userVerification: pk.userVerification as UserVerificationRequirement | undefined,
    allowCredentials: allow.map((c) => ({
      id: base64url.decode(c.id),
      type: "public-key" as const,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };
}

function toCreationOptions(pk: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const user = pk.user as { id: string; name: string; displayName: string };
  const exclude = (pk.excludeCredentials as ServerCredentialDescriptor[] | undefined) ?? [];
  return {
    challenge: base64url.decode(pk.challenge as string),
    rp: pk.rp as PublicKeyCredentialRpEntity,
    user: { id: base64url.decode(user.id), name: user.name, displayName: user.displayName },
    pubKeyCredParams: pk.pubKeyCredParams as PublicKeyCredentialParameters[],
    timeout: pk.timeout as number | undefined,
    attestation: pk.attestation as AttestationConveyancePreference | undefined,
    authenticatorSelection: pk.authenticatorSelection as AuthenticatorSelectionCriteria | undefined,
    excludeCredentials: exclude.map((c) => ({
      id: base64url.decode(c.id),
      type: "public-key" as const,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };
}

function serializeCredential(cred: PublicKeyCredential) {
  const r = cred.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  const response: Record<string, string> = { clientDataJSON: base64url.encode(r.clientDataJSON) };
  if (r.attestationObject) response.attestationObject = base64url.encode(r.attestationObject);
  if (r.authenticatorData) response.authenticatorData = base64url.encode(r.authenticatorData);
  if (r.signature) response.signature = base64url.encode(r.signature);
  if (r.userHandle) response.userHandle = base64url.encode(r.userHandle);
  return { id: cred.id, rawId: base64url.encode(cred.rawId), type: cred.type, response };
}

export class PasskeyCancelledError extends Error {
  constructor() {
    super("Passkey prompt was cancelled");
    this.name = "PasskeyCancelledError";
  }
}

function isCancel(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError");
}

// loginWithPasskey runs the assertion ceremony. Without an email the server
// starts a discoverable flow and the browser shows every passkey it holds for
// this site. Resolves when the session cookie has been set.
export async function loginWithPasskey(email?: string): Promise<void> {
  const { options } = await auth.passkeyBeginLogin(email);
  let cred: Credential | null;
  try {
    cred = await navigator.credentials.get({ publicKey: toRequestOptions(options.publicKey) });
  } catch (err) {
    if (isCancel(err)) throw new PasskeyCancelledError();
    throw err;
  }
  if (!cred) throw new PasskeyCancelledError();
  await auth.passkeyFinishLogin(serializeCredential(cred as PublicKeyCredential));
}

// registerPasskey runs the attestation ceremony for the signed-in user.
export async function registerPasskey(name: string): Promise<void> {
  const { options } = await account.passkeyBeginRegister();
  let cred: Credential | null;
  try {
    cred = await navigator.credentials.create({ publicKey: toCreationOptions(options.publicKey) });
  } catch (err) {
    if (isCancel(err)) throw new PasskeyCancelledError();
    throw err;
  }
  if (!cred) throw new PasskeyCancelledError();
  await account.passkeyFinishRegister(serializeCredential(cred as PublicKeyCredential), name);
}

// suggestPasskeyName guesses a friendly device label like "MacBook Pro" or "iPhone".
export function suggestPasskeyName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";
  return "This device";
}
