/*jslint node:true, nomen:true */
var Errors = require('node-common-errors');
var sendmail, mailcomposer;

function sendCompiledMail(to, subject, html, callback) {

	if (to && subject && html) {
		return sendmail(to, subject, html, callback);
	}

	callback(new Errors.Common('Subject and/or html and/or to missing', 500));
}

/**
 * Creates mailer based on the options passed
 * @param  {Object} options   - complete configuration for nodemailer smtp pool
 * @param  {String} from      - to be used when sending email and using `from` field
 * @param  {String} templates - template directory
 * @return {Function}         - returns sendMail helper function
 */
module.exports = function (options, templates) {

	sendmail = options.transport || require('./sendmail')(options);
	mailcomposer = require('./mailcomposer');
	mailcomposer.init(templates, options);

	return function sendMail(type, lang, data, to, subject, callback) {

		mailcomposer.compile(type, lang, data, function (err, html) {
			if (err) {
				return callback(err);
			}

			// if module.exports.sendCompiledMail is redefined, it will use that,
			// sorry, no caching
			exports.sendCompiledMail(to, subject, html, callback);

		});
	};
};

// alias
exports = module.exports;


/**
 * Function to be used for sending compiled email
 * @type {Function}
 */
exports.sendCompiledMail = sendCompiledMail;
