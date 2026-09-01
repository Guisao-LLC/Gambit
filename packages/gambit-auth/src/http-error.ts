/**
 * An Error that carries an HTTP status.
 *
 * Everything in Gambit that can reject throws one of these, and the host app's
 * error handler turns it into a response. Nothing here knows what the app is.
 *
 * `code` and `statusCode` hold the same value. That duplication is deliberate
 * and load-bearing: express error handlers in the wild read one or the other,
 * and the apps consuming this already have handlers written against both. Drop
 * either field and some handler somewhere silently falls back to 500.
 */
export class HttpError extends Error {
  readonly code: number;
  readonly statusCode: number;

  constructor(message: string, errorCode: number) {
    super(message);
    this.name = "HttpError";
    this.code = errorCode;
    this.statusCode = errorCode;

    // Restore the prototype chain — without this, `instanceof HttpError` is
    // false for anything built by a downlevel-compiled subclass.
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

/**
 * Also the default export, because the apps adopting this import it that way in
 * well over a hundred places. Keeping both means a consuming app can re-export
 * this module from its old path and change nothing else.
 */
export default HttpError;
