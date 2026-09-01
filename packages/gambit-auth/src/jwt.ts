import jwt, { JwtPayload } from "jsonwebtoken";
import { HttpError } from "./http-error";

/**
 * Generic JWT signing and verification.
 *
 * Carries the claims every app needs and none that only one app needs. An app
 * extends `BaseTokenClaims` with its own — a tenant id, an account kind — in
 * its own module, so app claims never reach this layer.
 *
 * Which claims get SIGNED is deliberately not decided here. An earlier version
 * enumerated one app's fields and dropped everything else; generalizing that to
 * "omit iat and exp" would have started forwarding claims that used to be
 * stripped. The caller passes the exact payload instead.
 */
export interface BaseTokenClaims extends JwtPayload {
  id: string;
  email: string;
  name?: string;
  roles: string | undefined;
  isVerified?: boolean;
}

/**
 * Read the signing secret.
 *
 * `process.env` is read HERE rather than taken as config, deliberately. A
 * secret passed in at construction is captured once at import time, so rotating
 * it means restarting the process anyway — and every app in this family already
 * supplies JWT_SECRET the same way. If that ever stops being true, this is the
 * one function to change.
 */
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new HttpError("JWT_SECRET is not configured", 500);
  }
  return secret;
};

/** Sign an already-normalized payload. Callers decide what goes in it. */
export const signToken = (
  payload: object,
  expiresIn: jwt.SignOptions["expiresIn"] = "1d",
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const secret = getJwtSecret();

      jwt.sign(payload, secret, { expiresIn }, (err, token) => {
        if (err || !token) {
          return reject(new HttpError("Error generating token", 500));
        }
        resolve(token);
      });
    } catch (error) {
      reject(error);
    }
  });
};

/** Verify a raw `Authorization` header and resolve the claims it carries. */
export const verifyToken = <T extends BaseTokenClaims>(
  authorization?: string,
): Promise<T> => {
  return new Promise((resolve, reject) => {
    try {
      if (!authorization) {
        return reject(
          new HttpError("Unable to verify token, authorization issue", 401),
        );
      }

      const token = authorization.split(" ")[1];
      const secret = getJwtSecret();

      jwt.verify(token, secret, (err, decoded) => {
        if (err || !decoded || typeof decoded !== "object") {
          return reject(new HttpError("Unable to verify token", 401));
        }
        resolve(decoded as T);
      });
    } catch (error) {
      reject(error);
    }
  });
};
