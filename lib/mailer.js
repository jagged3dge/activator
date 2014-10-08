/*jslint node:true, nomen:true */
var Errors = require('node-common-errors');

/**
 * Creates mailer based on the options passed
 * @param  {Object} options   - complete configuration for nodemailer smtp pool
 * @param  {String} from      - to be used when sending email and using `from` field
 * @param  {String} templates - template directory
 * @return {Function}         - returns sendMail helper function
 */
module.exports = function (options, from, templates) {
	var sendmail = require('./sendmail')(options, from);
	var mailcomposer = require('./mailcomposer');

	mailcomposer.init(templates);

	return function sendMail(type, lang, data, to, callback) {
		mailcomposer.compile(type, lang, data, function sendCompiledMail(subject, text, html) {

			if (subject && (text || html)) {
				return sendmail(to, subject, text, html, callback);
			}

			callback(new Errors.Common('Subject and/or text and html missing', 500));
		});
	};
};