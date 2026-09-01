import { RequestHandler } from "express";
import { HttpError } from "./http-error";

/**
 * Authentication for routes that need a valid token but no specific permission.
 *
 * Verifies a token and attaches the claims. It has no opinion about what a
 * token contains or how it is verified.
 *
 * ── Why the verifier is injected ─────────────────────────────────────────────
 *
 * Because a shared handler must not PICK one — it must be GIVEN one.
 *
 * That rule was learned the hard way. A generic CRUD handler in one of the
 * consuming apps imported that app's verifier directly. It looked clean by
 * every static measure: it named no app concept and imported no app model. But
 * the app's test harness MOCKED that verifier module, so reaching around the
 * mock made the handler really verify a fake token, and four authorization
 * tests failed the moment the import moved.
 *
 * The lesson generalizes past that one file: a clean import graph is not proof
 * of portability. Coupling can live in what a module DOES at runtime. So every
 * seam in Gambit that needs to know who the caller is takes that knowledge as
 * config, which also keeps the host app's mocks effective.
 */

export interface AuthenticateConfig<TClaims> {
  /** Verify the raw Authorization header and resolve the claims. Throws to reject. */
  verifyToken: (authorization: string) => Promise<TClaims>;
  /**
   * Where to put the verified claims. Defaults to `req.user`, which is what
   * every app in this family already reads.
   *
   * Override it if your app keeps them elsewhere; the point is that this
   * package never has to know.
   */
  attachTo?: string;
}

/**
 * The host app declares what `req.user` IS — one app's `types/express.d.ts`
 * types it as its own decoded token, another types it as something else
 * entirely. This package must therefore write the property WITHOUT declaring
 * it.
 *
 * Shipping a `declare global { namespace Express { interface Request { user } } }`
 * from here would be worse than the cast below: two packages augmenting the
 * same property with different types collide in the consuming app, and the app
 * loses the ability to type its own claims. So the augmentation stays where it
 * belongs — in the app — and this package treats the request as a bag it is
 * allowed to set one key on.
 */
type ClaimsCarrier = Record<string, unknown>;

export function createAuthenticate<TClaims>(
  config: AuthenticateConfig<TClaims>,
): RequestHandler {
  const { verifyToken, attachTo = "user" } = config;

  return async (req, _res, next) => {
    const { authorization } = req.headers;

    if (!authorization) {
      return next(new HttpError("Not authorized", 401));
    }

    try {
      (req as unknown as ClaimsCarrier)[attachTo] = await verifyToken(authorization);
      next();
    } catch {
      next(new HttpError("Unauthorized", 401));
    }
  };
}
