/*jslint node:true, nomen:true */
/*global escape */

// with defaults
var async = require('async');
var smtp = require('./mailer');
var _ = require('lodash-node');
var uuid = require('node-uuid');
var Errors = require('./errors');

var DEFAULTS = {
  model: {
    find: function (id, callback) {
      callback(new Errors.Uninitialized());
    },
    save: function (id, data, callback) {
      callback(new Errors.Uninitialized());
    }
  },
  templates: __dirname + '/templates',
  resetExpire: 60,
  emailProperty: "email",
  idProperty: 'id'
};

var DEFAULT_RESPONSE = { ok: true };
var model = DEFAULTS.model;
var mailer, templates, emailProperty, idProperty, resetExpire;

/**
 * CreateActivate:
 * 	- creates activation link for a user and sends an email
 * @param {Object}   req  - express.js request option
 * @param {Function} done - callback <statusCode, responseBody>
 */
function createActivate(req, done) {
  // add the activation code, just a randomization of this very moment, plus the email, hashed together
  var email, code,
			id = (req.activator ? req.activator.id : null) || (req.user ? req.user.id : null);

	if (!id) {
    return done(new Errors.Uninitialized());
  }

  async.waterfall([

		function retrieveUser(callback) {
      model.find(id, callback);
    },

		function processUser(user, callback) {
      if (!user) {
        return callback(new Errors.NotFound());
      }

      email = user[emailProperty];
      code = uuid.v4();
			id = user[idProperty];

      model.save(id, { activation_code: code }, callback);
    },

		function sendEmail(user, callback) {
      if (!callback && typeof (user) === "function") {
        callback = user;
      }

      mailer("activate", "en_US", {
        code: code,
        email: email,
        id: id,
        request: req
      }, email, callback);
    }

  ], function createActivationPipeComplete(err) {
    if (err) {
      return done(err);
    }

		var message = req.activator && req.activator.body ? req.activator.body : DEFAULT_RESPONSE;
		done(null, 201, message);
  });
}

/**
 * Completes user's account activation
 * @param {Object}   req  - expressjs request object
 * @param {Function} done - <statusCode, responseBody>
 */
function completeActivate(req, done) {
  var code = req.params.code,
      id = req.params.user;

  async.waterfall([

		function retrieveUser(callback) {
      model.find(id, callback);
    },

		function processUser(user, callback) {
      if (!user) {
        return callback(new Errors.NotFound());
      }

			if (user.activation_code !== code) {
        return callback(new Errors.Forbidden());
      }

			id = user[idProperty];
      model.save(id, { activation_code: "X" }, callback);
    }

	], function activationCompleted(err) {
    if (err) {
      return done(err);
    }

		done(null, 200, DEFAULT_RESPONSE);
  });
}

/**
 * Processes password reset request
 * @param {Object}   req  - expressjs object
 * @param {Function} done - <statusCode, responseBody>
 */
function createPasswordReset(req, done) {
  var reset_code, reset_time, email, id;
  var userId = req.params.user;
	/*
   * process:
   * 1) get the user by email
   * 2) create a random reset code
   * 3) save it
   * 4) send an email
   */
  async.waterfall([

		function retrieveUser(callback) {
      model.find(userId, callback);
    },

    function processUser(user, callback) {
      if (!user) {
        return callback(new Errors.NotFound());
      }

      email = user[emailProperty];
      id = user[idProperty];
      reset_time = Date.now() + resetExpire * 60 * 1000;
			reset_code = uuid.v4();

      // expires in 60 minutes
      // save the update
      model.save(id, { password_reset_code: reset_code, password_reset_time: reset_time }, callback);
    },

    function sendResetCodeToTheUser(user, callback) {
      if (!callback && typeof (user) === "function") {
        callback = user;
      }

			mailer("passwordreset", "en_US", {
        code: reset_code,
        email: email,
        id: id,
        request: req
      }, email, callback);
    }

  ], function createPasswordResetProcessed(err) {
      if (err) {
        return done(err);
      }

			return done(null, 201, DEFAULT_RESPONSE);
  });
}

/**
 * Confirms password reset and sets new password
 * @param {Object}   req  - expressjs object
 * @param {Function} done - <statusCode, responseBody>
 */
function completePasswordReset(req, done) {
  var reset_code = req.params.code,
      password = req.params.password,
      id = req.params.user,
      now = Date.now();

	if (!password) {
		return done(new Errors.BadRequest('Missing Password'));
	}

	async.waterfall([

		function retrieveUser(callback) {
      model.find(id, callback);
    },

		function processUser(user, callback) {
			if (!user) {
				return callback(new Errors.NotFound());
			}

			if (user.password_reset_code !== reset_code) {
				return callback(new Errors.BadRequest('Invalid Reset Code'));
			}

			if (user.password_reset_time < now) {
				return callback(new Errors.BadRequest('Expired Reset Code'));
			}

      model.save(user[idProperty], {
        password_reset_code: "X",
        password_reset_time: 0,
        password: password
      }, callback);
		}

  ], function passwordResetCompleted(err) {
			if (err) {
        return done(err);
      }

			return done(null, 200, DEFAULT_RESPONSE);
  });
};


var createNextHandler = function (req, next) {
	return function (err, code, message) {
		if (err) {
			return next(err);
		}

		req.activator = req.activator || {};
		_.extend(req.activator, { code: code, message: message });
		setImmediate(next);
	};
};

var createResponse = function (res) {
	return function (err, code, message) {
		if (err) {
			return res.status(err.code || 500).send(err.message || 'Internal Server Error');
		}

		res.status(code).send(message);
	}
};

/**
 * Public API
 * @type {Object}
 */
module.exports = {

	/**
	 * Initializes activator module
	 * @param  {Object} config
	 * - contains following properties:
	 * 	 * `user` {Object}:
	 * 	   1. `find` {Function}  <userId, callback>
	 * 	   2. `save` {Function}  <userId, dataToSave, callback>
	 * 	 * `templates` {String} - directory for templates used by `smtp`
	 * 	 * `resetExpire` {Number} - duration of expiration link validity, default: 60
	 * 	 * `smtp`: {Function|Object} - function which accepts `type`,`lang`,`data`,`to`
	 * 	 		and `callback` params and sends emails based on them, defaults: built-in mail composer
	 * 	 * `from`: {String|Object|Null} - to be used in `nodemailer`'s `from` field
	 * 	 * `emailProperty`: {String} - defaults to `email`
	 * 	 * `idProperty`: {String} - defaults to `id`
	 * 	 * `createNextHandler`: {Function}
	 * 	 * `createResponse`: {Function}
	 */
	init: function(config) {
    // user model
		model = config.user || DEFAULTS.model;

    // templates dir
		templates = config.templates || DEFAULTS.templates;

		// expiration time
    resetExpire = config.resetExpire || DEFAULTS.resetExpire;

		// setup mailer
    if (typeof config.smtp === 'function') {
			mailer = config.smtp;
		} else {
			mailer = smtp(config.smtp, config.from, templates);
		}

		// user properties
		emailProperty = config.emailProperty || DEFAULTS.emailProperty;
    idProperty = config.id || DEFAULTS.idProperty;

		// response handler functions
		createNextHandler = config.createNextHandler || createNextHandler;
		createResponse = config.createResponse || createResponse;
  },

	/**
	 * Middleware for creating password reset emails
	 * @param {Object}   req  - express.js request
	 * @param {Object}   res  - express.js response
	 * @param {Function} next - <err>
	 */
  createPasswordReset: function (req, res, next) {
    createPasswordReset(req, createResponse(res));
  },

	/**
	 * Middleware for creating password reset function with passing control to
	 * `next` handler
	 *
	 * Sets or extends `req.activator` with `code` and `message`
	 *
	 * @param {Object}   req  - express.js request
	 * @param {Object}   res  - express.js response
	 * @param {Function} next - <err>
	 */
  createPasswordResetNext: function (req, res, next) {
    createPasswordReset(req, createNextHandler(req, next));
  },

	/**
	 * Middleware for completing password reset
	 * @param {Object}   req  - express.js request
	 * @param {Object}   res  - express.js response
	 * @param {Function} next - <err>
	 */
  completePasswordReset: function (req, res, next) {
    completePasswordReset(req, createResponse(res));
  },

	/**
	 * Middleware for completing password reset passing control to next handler
	 *
	 * Sets or extends `req.activator` with `code` and `message`
	 *
	 * @param {Object}   req  - express.js request
	 * @param {Object}   res  - express.js response
	 * @param {Function} next - <err>
	 */
  completePasswordResetNext: function (req, res, next) {
    completePasswordReset(req, createNextHandler(req, next));
  },

	/**
	 * Middleware for creating account activation request
	 * @param {Object}   req  - express.js request
	 * @param {Object}   res  - express.js response
	 * @param {Function} next - <err>
	 */
  createActivate: function (req, res, next) {
    createActivate(req, createResponse(res));
  },

	/**
	* Middleware for creating account activation request and passing control to
	* next handler
	*
	* Sets or extends `req.activator` with `code` and `message`
	*
	* @param {Object}   req  - express.js request
	* @param {Object}   res  - express.js response
	* @param {Function} next - <err>
	*/
  createActivateNext: function (req, res, next) {
    createActivate(req, createNextHandler(req, next));
  },

	/**
	 * Middleware for completing activation
   * @param {Object}   req  - express.js request
	 * @param {Object}   res  - express.js response
	 * @param {Function} next - <err>
	 */
  completeActivate: function (req, res, next) {
    completeActivate(req, createResponse(res));
  },

	/**
	* Middleware for completing activation, passing control to next handler
	*
	* Sets or extends `req.activator` with `code` and `message`
	*
	* @param {Object}   req  - express.js request
	* @param {Object}   res  - express.js response
	* @param {Function} next - <err>
	*/
  completeActivateNext: function (req, res, next) {
    completeActivate(req, createNextHandler(req, next));
  }

};
