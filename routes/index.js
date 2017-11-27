var express = require('express');
var router = express.Router();
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var oauthConfig = require('../oauthConfig');
var service = google.drive('v3');

var gauthconfig = oauthConfig.google;

/* GET home page. */
router.get('/', function (req, res, next) {
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(gauthconfig.clientID, gauthconfig.clientSecret, gauthconfig.callbackURL);
  oauth2Client.credentials = req.user.token;

  service.files.list({
    auth: oauth2Client,
    pageSize: 100,
    fields: "nextPageToken, files"
  }, function (err, response) {
    if (err) {
      // res.send(JSON.stringify(req.user));
      res.send('The API returned an error: ' + err);
    }
    res.render("index",{files:response.files});

    // var files = response.files;
    // if (files.length == 0) {
    //   res.send('No files found.');
    // } else {
    //   res.write('Files:');
    //   for (var i = 0; i < files.length; i++) {
    //     var file = files[i];
    //     res.write('File Name: ' + file.name + ', FileId: ' + file.id + ', Size: ' + file.size + '\n');
    //   }
    //   res.end();
    // }
  });


  //res.render('index', { title: 'Express' });
});

module.exports = router;
