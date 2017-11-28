var express = require('express');
var router = express.Router();
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var oauthConfig = require('../oauthConfig');
var service = google.drive('v3');
var axios = require('axios');
var request = require('request');

var gauthconfig = oauthConfig.google;

function getAuth(req) {
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(gauthconfig.clientID, gauthconfig.clientSecret, gauthconfig.callbackURL);
  oauth2Client.credentials = req.user.token;
  return oauth2Client;
}

/* GET home page. */
router.get('/', function (req, res, next) {
  var oauth2Client = getAuth(req);
  service.files.list({
    auth: oauth2Client,
    pageSize: 100,
    fields: "nextPageToken, files"
  }, function (err, response) {
    if (err) {
      res.send('The API returned an error: ' + err);
      res.end();
    }
    else {
      res.render("index", { files: response.files });
    }
  });
});

router.get('/transfer/:fileid', function (req, res, next) {
  var oauth2Client = getAuth(req);
  var fileId = req.params.fileid;
  service.files.get({
    auth: oauth2Client,
    'fileId': fileId,
    "fields": "*"
  }, async function (err, response) {
    //for testing purpose  this is hard coded here...
    var pathToAlbum = 'https://photos.googleapis.com/data/upload/resumable/media/create-session/feed/api/user/default/albumid/6490558908293625281';

    //do we need to update teh filename in  this...
    var photoCreateBody = '<?xml version="1.0" encoding="UTF-8"?><entry xmlns="http://www.w3.org/2005/Atom" xmlns:gphoto="http://schemas.google.com/photos/2007"><category scheme="http://schemas.google.com/g/2005#kind" term="http://schemas.google.com/photos/2007#photo"/><title>' + response.name + '</title><gphoto:timestamp>1475517389000</gphoto:timestamp></entry>';

    var photoCreateResponse = await axios.post(pathToAlbum, photoCreateBody, {
      headers: {
        'Authorization': 'Bearer ' + oauth2Client.credentials.access_token,
        'Content-Type': 'application/atom+xml; charset=utf-8',
        'X-Upload-Content-Length': response.size,
        'X-Upload-Content-Type': response.mimeType,
        'Slug': response.name,
        'X-Forwarded-By': 'me',
        'data-binary': '@-',
        'GData-Version': '3'
      }
    });

    var putrequest = request.put(photoCreateResponse.headers.location, {
      headers: {
        'Content-Length': response.size,
        'Content-Range': 'bytes 0-' + (parseInt(response.size) - 1) + '/' + response.size,
        'Expect': ''
      }
    });

    putrequest.on('drain', function () {
      //console.log('Write  progress'+ (putrequest.req.connection.bytesWritten) + '/'+response.size);
    });

    var interval = setInterval(function () {
      console.log('Write: ' + putrequest.req.connection.bytesWritten + '/' + response.size);
    }, 500);

    var bytes = 0;
    service.files.get({
      auth: oauth2Client,
      fileId: fileId,
      alt: 'media'
    }).on('end', function () {
      clearInterval(interval);
      console.log('Done');
    }).on('data', function (chunk) {
      bytes += chunk.length;
      //console.log('Progress' + (bytes) + '/' + response.size);
    })
      .on('error', function (err) {
        clearInterval(interval);
        console.log('Error during download', err);
      })
      .pipe(putrequest);

    res.end("Queued...");
  });
});

module.exports = router;
