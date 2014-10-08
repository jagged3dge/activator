'use strict';

var util = require('util');

/**
 * Common error with message and custom code
 * @param {String} message - error message
 * @param {Number} code    - response status code, defaults to 400
 */
function CommonError(message, code) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);

  this.name = this.constructor.name;
  this.message = message;
  this.code = code || 400;

  return this;
}
util.inherits(CommonError, Error);


/**
 * Authentication Error
 * @param {String} message - defaults to 'Not authorized'
 */
function AuthError(message) {
  CommonError.call(this, message || 'Not authorized', 401);
  return this;
}
util.inherits(AuthError, CommonError);


/**
 * Access Forbidden Error
 * @param {String} message - defaults to `Forbidden`
 */
function ForbiddenError(message) {
  CommonError.call(this, message || 'Forbidden', 403);
  return this;
}
util.inherits(ForbiddenError, CommonError);


/**
 * Resource Not Found Error
 * @param {String} message - defaults to `Not Found`
 */
function NotFoundError(message) {
  CommonError.call(this, message || 'Not Found', 404);
  return this;
}
util.inherits(NotFoundError, CommonError);


/**
 * Bad Request Error
 * @param {String|Object} payload - details of the error
 */
function BadRequestError(payload) {
  CommonError.call(this, 'Bad Request', 400);
  this.data = payload;
  return this;
}
util.inherits(BadRequestError, CommonError);


/**
 * Internal Error - Activator Uninitialized
 */
function UninitializedError() {
  CommonError.call(this, 'Activator Uninitialized', 500);
  return this;
}
util.inherits(UninitializedError, CommonError);


/**
 * Public API
 * @type {Object}
 */
module.exports = {
  Common: CommonError,
  Auth: AuthError,
  Forbidden: ForbiddenError,
  NotFound: NotFoundError,
  BadRequest: BadRequestError,
  Uninitialized: UninitializedError
};
