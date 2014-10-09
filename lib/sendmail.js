/*jslint node:true */

var nodemailer = require('nodemailer');
var smtpPool = require('nodemailer-smtp-pool');
var _ = require('lodash-node');
var Errors = require('node-common-errors');


/**
 *
 * @param  {Object} options - https://github.com/andris9/nodemailer-smtp-pool
 * `options` defines connection data
 *   - options.port is the port to connect to (defaults to 25 or 465)
 *
 *   - options.host is the hostname or IP address to connect to
 *   	 	(defaults to 'localhost')
 *
 *   - options.secure defines if the connection should use SSL (if true) or not
 *   	 	(if false)
 *
 *   - options.auth defines authentication data:
 *       * auth.user is the username
 *       * auth.pass is the password for the user
 *       * auth.xoauth2 is the OAuth2 access token (preferred if both pass and
 *       		xoauth2 values are set) or an XOAuth2 token generator object.
 *
 *   - options.ignoreTLS turns off STARTTLS support if true
 *
 *   - options.name optional hostname of the client,
 *   	 	used for identifying to the server
 *
 *   - options.localAddress is the local interface to bind to for
 *   	 	network connections
 *
 *   - options.connectionTimeout how many milliseconds to wait for the
 *   	 	connection to establish
 *
 *   - options.greetingTimeout how many milliseconds to wait for the greeting
 *   	 	after connection is established
 *
 *   - options.socketTimeout how many milliseconds of inactivity to allow
 *
 *   - options.debug if true, the connection emits all traffic between
 *   		client and server as 'log' events
 *
 *   - options.authMethod defines preferred authentication method, eg. 'PLAIN'
 *
 *   - options.tls defines additional options to be passed to the socket constructor,
 *   		eg. {rejectUnauthorized: true}
 *
 *   - maxConnections (defaults to 5) is the count of maximum simultaneous
 *   		connections to make against the SMTP server
 *
 *   - maxMessages (defaults to 100) limits the message count to be sent using
 *   		a single connection. After maxMessages messages the connection is
 *   		dropped and a new one is created for the following messages
 *
 * @return {Function} - <to, subject, text, html, callback>
 */
module.exports = function (config) {

  var options = config.smtp;
  var from = config.from;

  // create reusable transport method (opens pool of SMTP connections)
  var transport = nodemailer.createTransport(smtpPool(options));
  if (options.debug) {
    transport.on('log', console.log.bind(console));
  }

  // make sure auth is defined
  var from = from || options.auth && options.auth.user;
  if (!from) {
    throw new Error('From must be defined');
  }

  var sendMail = function (to, subject, html, callback) {

    var opts = { from: from, to: to, subject: subject, html: html };

    transport.sendMail(opts, function (err, info) {
      if (err) {
        return callback(new Errors.CommonError('Couldn\'t send email', err.responseCode));
      }

      callback(null, info);
    });
  };

  // extend function with method to close transport
  // might be useful for someone
  sendMail.close = transport.close.bind(transport);
  return sendMail;

};
