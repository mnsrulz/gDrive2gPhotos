var express = require('express');
var router = express.Router();
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth2').Strategy;
var oauthConfig = require('../oauthConfig');

var gauthconfig = oauthConfig.google;

passport.use(new GoogleStrategy({
  clientID: gauthconfig.clientID,
  clientSecret: gauthconfig.clientSecret,
  callbackURL: gauthconfig.callbackURL
},
  function (request, accessToken, refreshToken, profile, done) {
    process.nextTick(function () {
      var userProfile = {
        token: refreshToken,
        profile: profile
      };
      return done(null, userProfile);
    });
  }
));

router.get('/google',
  passport.authenticate('google', { successRedirect: '/', scope: ['email', 'https://www.googleapis.com/auth/drive', 'https://picasaweb.google.com/data/', 'https://photos.googleapis.com/data/'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  function (req, res) {
    res.redirect('/index');
  });

module.exports = router;
