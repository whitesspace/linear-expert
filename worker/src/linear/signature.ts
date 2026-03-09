const encoder = new TextEncoder();

/**
 * 使用 Linear Webhook secret 计算 HMAC-SHA256。
 */
async function computeSignature(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return new Uint8Array(signature);
}

function fromHexString(source: string): Uint8Array {
  if (source.length % 2 !== 0) {
    throw new Error("invalid signature hex length");
  }
  const bytes = new Uint8Array(source.length / 2);
  for (let i = 0; i < source.length; i += 2) {
    bytes[i / 2] = parseInt(source.slice(i, i + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export async function verifyLinearSignature(options: {
  secret: string;
  payload: string;
  headerSignature: string | null;
}): Promise<boolean> {
  const { secret, payload, headerSignature } = options;
  if (!headerSignature) {
    return false;
  }
  try {
    const expected = await computeSignature(secret, payload);
    const provided = fromHexString(headerSignature.trim());
    return timingSafeEqual(expected, provided);
  } catch (error) {
    console.warn("linear signature verification error", error);
    return false;
  }
}
