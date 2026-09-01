/**
 * Validation for an uploaded profile picture. PURE — takes the decoded upload,
 * returns a verdict.
 *
 * Storage shape is `{ base64, mime }` on the owning document, following the
 * school-logo precedent (quick 260612-g8o) rather than a filesystem path: this
 * deploys to a single Render service whose disk is EPHEMERAL, so a file written
 * on upload disappears on the next deploy while the database row still points
 * at it.
 *
 * That choice is what makes the size cap load-bearing rather than cosmetic —
 * the image travels in every document read — so the cap is small and enforced
 * here rather than trusted to the client.
 *
 * Quick 260831-b7q — written for extraction; nothing app-specific.
 */

/**
 * Max decoded bytes. 512 KB is generous for an avatar rendered at 36px and
 * still small enough to sit in a document without bloating ordinary reads.
 */
export const MAX_AVATAR_BYTES = 512 * 1024;

/**
 * Raster formats only. SVG is EXCLUDED deliberately: it is a document format
 * that can carry <script>, and these images are rendered back into pages —
 * an avatar is exactly the kind of attacker-supplied content that must not be
 * able to execute.
 */
export const ALLOWED_AVATAR_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AvatarMime = (typeof ALLOWED_AVATAR_MIMES)[number];

export interface AvatarCheck {
  ok: boolean;
  reason?: string;
  /** Decoded size, present when the payload parsed — useful for error copy. */
  bytes?: number;
}

/** Strips a `data:` prefix if present, so callers may pass either a bare
 *  base64 payload or a full data URL. */
export function stripDataUrlPrefix(base64: string): string {
  const comma = base64.indexOf(",");
  return base64.startsWith("data:") && comma !== -1
    ? base64.slice(comma + 1)
    : base64;
}

/**
 * Decoded byte length of a base64 payload, computed from its LENGTH rather than
 * by decoding it — the point of the cap is to avoid materialising a huge buffer
 * in order to discover it was huge.
 */
export function base64ByteLength(base64: string): number {
  const body = stripDataUrlPrefix(base64).replace(/\s/g, "");
  if (body.length === 0) return 0;
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}

export function isAllowedAvatarMime(mime: string): mime is AvatarMime {
  return (ALLOWED_AVATAR_MIMES as readonly string[]).includes(mime);
}

/**
 * Is this upload storable as an avatar?
 *
 * Checks the declared MIME against the allow-list and the decoded size against
 * the cap. It does NOT verify that the bytes really are the image they claim to
 * be — that needs a decoder, and the allow-list plus rendering the value only
 * as an <img src> is what contains the risk.
 */
export function checkAvatarUpload(input: {
  mime: string;
  base64: string;
}): AvatarCheck {
  const { mime, base64 } = input;

  if (!mime || !isAllowedAvatarMime(mime)) {
    return {
      ok: false,
      reason: `Use a PNG, JPEG, WebP or GIF image.`,
    };
  }

  const body = stripDataUrlPrefix(base64 ?? "").replace(/\s/g, "");
  if (body.length === 0) {
    return { ok: false, reason: "The image is empty." };
  }
  // Reject anything that isn't base64 before measuring it: a malformed payload
  // would otherwise be stored and fail later, in an <img> tag, as a broken
  // picture with no explanation.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    return { ok: false, reason: "The image couldn't be read." };
  }

  const bytes = base64ByteLength(body);
  if (bytes > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      bytes,
      reason: `Images must be under ${Math.round(MAX_AVATAR_BYTES / 1024)} KB. Yours is ${Math.round(bytes / 1024)} KB.`,
    };
  }

  return { ok: true, bytes };
}
