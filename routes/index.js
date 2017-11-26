var express = require('express');
var router = express.Router();
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var oauth=require('../oauth');
var service = google.drive('v3');

/* GET home page. */
router.get('/', function(req, res, next) {
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(oauth.clientID, oauth.clientSecret, oauth.callbackURL);
  oauth2Client.credentials=req.user.token;

  service.files.list({
    auth: oauth2Client,
    pageSize: 10,
    fields: "nextPageToken, files(id, name)"
  }, function(err, response) {
    if (err) {
      // res.send(JSON.stringify(req.user));
      res.send('The API returned an error: ' + err);
    }
    var files = response.files;
    if (files.length == 0) {
      res.send('No files found.');
    } else {
      res.write('Files:');
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        res.write('%s (%s)', file.name, file.id);
      }
      res.end();
    }
  });

  
  //res.render('index', { title: 'Express' });
});

module.exports = router;
