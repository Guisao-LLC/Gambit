import { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "./http-error";

/**
 * Terminal error handler. Mount LAST, after every route and every other
 * middleware — express only treats a four-argument handler as an error handler,
 * and only reaches it if it is registered after whatever threw.
 *
 * Reads `code`, then `statusCode`, then `status`, then falls back to 500. That
 * ladder exists because errors arrive here from three places: Gambit's own
 * `HttpError`, the host app's error types, and libraries that set only
 * `status`. Reading one field would silently turn somebody's 404 into a 500.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    // Express cannot send a second set of headers. Hand it back so express's
    // default handler can close the connection.
    next(error);
    return;
  }

  const status =
    typeof error?.code === "number"
      ? error.code
      : typeof error?.statusCode === "number"
        ? error.statusCode
        : typeof error?.status === "number"
          ? error.status
          : 500;

  res.status(status).json({
    message: error?.message || "An unknown error occurred.",
  });
};

/**
 * Mount after all routes and BEFORE `errorHandler`: anything that reaches here
 * matched no route, so it becomes a 404 the error handler can render.
 */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError("Could not find route.", 404));
};
