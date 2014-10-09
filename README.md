# Express.JS User Activator

## Usage

```js
var _ = require('lodash-node');
var express = require('express'),
    bodyParser = require('body-parser'),
    app = express();

// lets assume that your model is here
// Make sure to specify following fields if you use mongoose:
//
// password_reset_code: String
// password_reset_time: Number
// activation_code: String
// password: String
//
// Obviously password hashing is not handled here, either pre-process it yourself,
// or use mongoose middleware
//
var User = require('./models/user');

var activator = require('express-user-activator');
var config = {
  user: {},
  protocol: 'http://',
  domain: 'localhost',
  // this will be used to craft email activation links
  pathActivate: '/api/1/users/activate',
  // this will be used to craft password reset confirmation links
  pathResetPassword: '/api/1/users/forgot'
};

// method to find user
config.user.find = function (searchQuery, callback) {
  // it should return user in the callback, signature is <err, user>
  User.findOne(searchQuery, callback);
};

// method to update user
// this is used to save data into user,
// it's your responsibility to setup protection here
config.user.save = function (id, data, callback) {
  // data contains $set and $del properties, we need to perform actions based
  // on these properties
  // Lets assume we use mongodb, then the example would be as simple as this:
  // You might want to take care of error handling though, since here we just
  // spit them out
  User.update({ _id: id }, data, callback);
};

// make sure to initialize it
activator.init(config);


// handling activation
var activateRoutes = express.router(config.pathActivate)
  .get(activator.createActivate)
  .post(activator.completeActivate);

// handling password reset
var passwordResetRoutes = express.router(config.pathResetPassword)
  .get(activator.createPasswordReset)
  .post(activator.completePasswordReset);


app.use(bodyParser);
app.use(activateRoutes);
app.use(passwordResetRoutes);

```

## Configuration

## Testing
To run the tests, from the root directory, run `npm test`.

## License
Released under the MIT License.

Originally developed by [Avi Deitcher](https://github.com/deitch)

Rewritten by [Vitaly Aminev](https://github.com/AVVS)
