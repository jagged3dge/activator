/*jslint node:true, nomen:true */
var fs = require('fs');
var _ = require('lodash-node');
var async = require('async');
var Errors = require('node-common-errors');
var Handlebars = require('handlebars');
var InlineCSS = require('inline-css');
var path = require('path');

var PATH = './templates',
    filePath,
    mails;

var INIT_CALLED = false;
var isProd = process.env.NODE_ENV === 'production';
var activation_link, passwordreset_link;

/**
 * Initialize mail composer
 * @param  {String} templatePath - where should we pick-up email templates
 */
function initialize(templatePath, config) {
  PATH = path.resolve(templatePath || PATH);
  mails = {};

  var domain = config.domain,
      protocol = config.protocol,
      pathActivate = config.pathActivate,
      pathResetPassword = config.pathResetPassword;
      pathCafeAuth = config.pathCafeAuthCode

  var base = config.protocol + config.domain;

  activation_link = pathActivate;
  passwordreset_link = pathResetPassword;
  // cafeauth_link = pathCafeAuth;

  INIT_CALLED = true;
}


/**
 * Returns file contents with falling back to `default` language
 * @param {String}   path     - absolute file path
 * @param {Function} callback - <err, fileContent[String]>
 */
function readFilePathWithFallbackToDefaultLanguage(type, language, callback) {
  filePath = path.posix.join(PATH, language);

  var templatePath = path.posix.join(filePath, type + '.tpl.html');

  fs.readFile(templatePath, 'utf-8', function readEmailTemplate(err, file) {
    // file doesnt exist
    if (err) {
      // fallback
      if (language !== 'default') {
        return readFilePathWithFallbackToDefaultLanguage(type, 'default', callback);
      }

      return callback(err);
    }

    return callback(null, file);
  });
}


/**
 * Returns template
 * @param {String}   type     - template name
 * @param {String}   language - template language
 * @param {Function} callback - <err, template>
 */
function getTemplate(type, language, callback) {
  var templateFunction;
  var key = type + language;

  // cache compiled templates in prod
  if (isProd) {
    templateFunction = mails[key];
    if (templateFunction) {
      return callback(null, templateFunction);
    }
  }

  readFilePathWithFallbackToDefaultLanguage(type, language, function compileHandlebarsFile(err, file) {
    if (err) {
      return callback(err);
    }

    InlineCSS(file, { url: 'file://' + path.resolve(filePath) + '/' })
      .then(function (inlinedContent) {
        templateFunction = Handlebars.compile(inlinedContent);

        if (isProd) {
          mails[key] = templateFunction;
        }

        callback(null, templateFunction);
      })
  });

}

/**
 * Compile template with `type`, `language` and `config`
 * @param {String}   type     - type of template to use
 * @param {String}   lang     - language of the template
 * @param {Object}   config   - local variables used to create links for the templates
 * @param {Function} callback - <err, compiledTemplate|String>
 */
function compileTemplateWithData(type, lang, config, callback) {
  if (!INIT_CALLED) {
    return callback(new Errors.Uninitialized());
  }

  if (!config.code) {
    return callback(new Errors.Internal('`config.code` is not defined'));
  }

  // querystring only includes the code, by default
  var link_querystring =  '/' + encodeURIComponent(config.code)

  // PREPEND 'id' to querystring if config.id is present
  if (config.id) {
    link_querystring = '/' + encodeURIComponent(config.id) + link_querystring
  }

  // APPEND 'email' to querystring if config.email is present
  if (config.email) {
    link_querystring = link_querystring + '/' + encodeURIComponent((new Buffer(config.email).toString('base64')).slice(0, -1))
  }

  // use this reference for allowing people
  // to override templateGet function if they really
  // want to
  this.get(type, lang, function processCompiledTemplate(err, template) {
    if (err) {
        return callback(err);
    }

    if (!template) {
      return callback(new Errors.Internal('Template Not Found'));
    }

    var html = template({
      activation_link: activation_link,
      passwordreset_link: passwordreset_link,
      link_querystring: link_querystring,
      curYear: new Date().getFullYear()
    });

    callback(null, html);
  });

}

var publicApi = {
  init: initialize,
  get: getTemplate,
  compile: compileTemplateWithData.bind(publicApi),
};

/**
 * Public API
 * @type {Object}
 */
module.exports = publicApi;
