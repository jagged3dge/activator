
/**
 * Default configuration
 * @type {Object}
 */
module.exports = {
  // this is used to retrieve and update user
  user: {

    // should return user resource
    find: function (id, callback) {
      callback(new Errors.Uninitialized());
    },

    // should be able to save updates, they ***must*** be available
    // when using `find`
    save: function (id, data, callback) {
      callback(new Errors.Uninitialized());
    }

  },

  // templates directory
  // must conform to
  // <language>/
  //            -- activate.jade
  //            -- passwordreset.jade
  //
  // `default` language must always be present
  //
  templates: __dirname + '/templates',

  // activation link is active for 60 minutes
  resetExpire: 60,

  // email is available via `user[emailProperty]`
  emailProperty: "email",

  // user's id is available via `user[idProperty]`
  idProperty: '_id',

  // your web app is accessible via `protocol`
  protocol: 'http://',

  // your domain
  domain: 'localhost',

  // where activation links should point to
  pathActivate: '/api/1/users/activate',

  // where password reset links should point to
  pathResetPassword: '/api/1/users/forgot',

  // subject on password reset emails
  password_reset_subject: 'Reset Password',

  // subject on account activation emails
  activation_subject: 'Activate Your Account'

};
