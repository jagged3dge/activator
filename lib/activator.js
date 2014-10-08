/*jslint node:true, nomen:true */
/*global escape */

// with defaults
var async = require('async');
var smtp = require('./mailer');
var _ = require('lodash-node');
var uuid = require('node-uuid');

var DEFAULTS = {
  model: {
    find: function (id, cb) {
      cb(new Error("uninitialized"));
    },
    save: function (id, data, cb) {
      cb(new Error("uninitialized"));
    }
  },
  url: null,
  templates: __dirname + '/templates',
  resetExpire: 60,
  proto: "https://",
  emailProperty: "email",
  idProperty: 'id'
};

var model = DEFAULTS.model;
var mailer, url, templates, emailProperty, idProperty, resetExpire, proto;

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
    return done(500, "uninitialized");
  }

  async.waterfall([

		function retrieveUser(callback) {
      model.find(id, callback);
    },

		function processUser(user, callback) {
      if (!user) {
        return callback(404);
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
      }, email, cb);
    }

  ], function createActivationPipeComplete(err) {
		var code;
    if (err) {
      if (err === 404) {
        code = 404;
      } else if (err === "uninitialized") {
        code = 500;
      }
      return done(code || 400, err);
    }

		done(201, req.activator ? req.activator.body : undefined);
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
        return callback(404);
      }

			if (user.activation_code !== code) {
        return callback(403);
      }

			id = user[idProperty];
      model.save(id, { activation_code: "X" }, callback);
    }

	], function activationCompleted(err) {
		var code;
    if (err) {
      if (err === 404) {
        code = 404;
      } else if (err === "uninitialized") {
        code = 500;
      }
      return done(code || 400, err);
    }

		done(200);
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
        return callback(404);
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
        callback = res;
      }

			mailer("passwordreset", "en_US", {
        code: reset_code,
        email: email,
        id: id,
        request: req
      }, email, callback);
    }

  ], function createPasswordResetProcessed(err) {
			var code;
      if (err) {
        if (typeof (err) === 'number') {
            code = err;
        } else if (err === "uninitialized" || err === "baddb") {
            code = 500;
        }
        return done(code || 400, err);
      }

			return done(201);
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
		return done(400, 'missingpassword');
	}

	async.waterfall([

		function retrieveUser(callback) {
      model.find(id, callback);
    },

		function processUser(user, callback) {
			if (!user) {
				return callback(404);
			}

			if (user.password_reset_code !== reset_code) {
				return callback("invalidresetcode");
			}

			if (user.password_reset_time < now) {
				return callback("expiredresetcode");
			}

      model.save(user[idProperty], {
        password_reset_code: "X",
        password_reset_time: 0,
        password: password
      }, cb);

  ], function passwordResetCompleted(err) {
      var code;

			if (err) {
        if (err === 404) {
          code = 404;
        } else if (err === "uninitialized") {
          code = 500;
        }
        return done(code || 400, err);
      }

			return done(200);
  });
};

var createNextHandler = function (req, next) {
	return function (code, message) {
		req.activator = req.activator || {};
		_.extend(req.activator, { code: code, message: message });
		setImmediate(next);
	};
};

var createResponse = function (res) {
	return function (code, message) {
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
	 * 	 * `url` {String} - smtp authentication URL, obligatory when `smtp` is set to null
	 * 	 * `templates` {String} - directory for templates used by `smtp`
	 * 	 * `resetExpire` {Number} - duration of expiration link validity, default: 60
	 * 	 * `protocol` {String} - protocol, defaults to `https://`
	 * 	 * `smtp`: {Function} - function which accepts `type`,`lang`,`data`,`to`
	 * 	 		and `callback` params and sends emails based on them, defaults: built-in mail composer
	 * 	 * `emailProperty`: {String} - defaults to `email`
	 * 	 * `idProperty`: {String} - defaults to `id`
	 * 	 * `createNextHandler`: {Function}
	 * 	 * `createResponse`: {Function}
	 */
	init: function(config) {
    model = config.user || DEFAULTS.model;
    url = config.url || DEFAULTS.url;
    templates = config.templates || DEFAULTS.templates;
    resetExpire = config.resetExpire || DEFAULTS.resetExpire;
    proto = config.protocol || DEFAULTS.proto;
    mailer = config.smtp || smtp(url, templates);
    emailProperty = config.emailProperty || DEFAULTS.emailProperty;
    idProperty = config.id || DEFAULTS.idProperty;
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
    createActivate(req, createResponse);
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
    completeActivate(req, createResponse);
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
