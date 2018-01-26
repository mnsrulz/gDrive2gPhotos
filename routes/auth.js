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
  function (request, refreshToken, accessToken, profile, done) {
    process.nextTick(function () {
      if(refreshToken) accessToken.refresh_token=refreshToken;
      var userProfile = {
        token: accessToken, 
        profile: profile
      };
      return done(null, userProfile);
    });
  }
));

router.get('/google',
  passport.authenticate('google', {
      authType: 'rerequest', 
      successRedirect: '/', 
      scope: ['email', 
              'https://www.googleapis.com/auth/drive', 
              'https://picasaweb.google.com/data/', 
              'https://photos.googleapis.com/data/'], 
      accessType: 'offline', prompt: 'consent'}));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  function (req, res) {
    res.redirect('/index');
  });

module.exports = router;
