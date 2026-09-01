/**
 * @guisao-llc/gambit-auth
 *
 * The foundation package: an HTTP error type, JWT signing and verification, and
 * request authentication. Every other Gambit package depends on this one, and
 * this one depends on nothing in Gambit.
 *
 * Nothing here knows what the host application is. What a token CONTAINS and
 * how it is VERIFIED are both supplied by the app — see `createAuthenticate`
 * for why that is a rule rather than a preference.
 */

export { HttpError } from "./http-error";
export { default as HttpErrorDefault } from "./http-error";

export type { BaseTokenClaims } from "./jwt";
export { signToken, verifyToken } from "./jwt";

export type { AuthenticateConfig } from "./authenticate";
export { createAuthenticate } from "./authenticate";

export { errorHandler, notFound } from "./error-handler";
