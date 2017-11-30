var express = require('express');
var router = express.Router();
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var oauthConfig = require('../oauthConfig');
var service = google.drive('v3');
var axios = require('axios');
var request = require('request');
var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var got = require('got');

var gauthconfig = oauthConfig.google;

var downloadUploadProgress = [];

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

router.get('/temp', function (req, res, next) {

  fs.readdir(__dirname, function (err, items) {


    const response = [];
    for (let file of items) {
      const extension = path.extname(file);
      const fileSizeInBytes = fs.statSync(path.join(__dirname, file)).size;
      response.push({ name: file, extension, fileSizeInBytes });
    }

    res.end('Error: ' + JSON.stringify(err) + ', Items: ' + JSON.stringify(response));
    //res.end('Error: ' + JSON.stringify(err) + ', Items: ' + JSON.stringify(items));
    // for (var i=0; i<items.length; i++) {
    //   console.log(items[i]);
    // }
  });

})

router.get('/progress/:requestid', function (req, res, next) {
  var requestId = req.params.requestid;
  res.end(JSON.stringify(downloadUploadProgress[requestId]));
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
    var photoCreateBody = '<?xml version="1.0" encoding="UTF-8"?><entry xmlns="http://www.w3.org/2005/Atom" xmlns:gphoto="http://schemas.google.com/photos/2007"><category scheme="http://schemas.google.com/g/2005#kind" term="http://schemas.google.com/photos/2007#photo"/><title>' + 'GP_' + response.name + '</title><gphoto:timestamp>1475517389000</gphoto:timestamp></entry>';

    var photoCreateResponse = await axios.post(pathToAlbum, photoCreateBody, {
      headers: {
        'Authorization': 'Bearer ' + oauth2Client.credentials.access_token,
        'Content-Type': 'application/atom+xml; charset=utf-8',
        'X-Upload-Content-Length': response.size,
        'X-Upload-Content-Type': response.mimeType,
        'Slug': 'GP_' + response.name,
        'X-Forwarded-By': 'me',
        'data-binary': '@-',
        'GData-Version': '3'
      }
    });
    var requestId = uuid.v4();
    var requestRecvdTime = new Date();
    downloadUploadProgress[requestId] = {};

    var bytesReceived = 0; var readbytes = 0;

    /*
    https://www.googleapis.com/drive/v3/files/FILEID?alt=media
    Authorization: Bearer <ACCESS_TOKEN>
    */

    var gotreadstream = got.stream('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
      encoding: null,
      headers: {
        'Authorization': 'Bearer ' + oauth2Client.credentials.access_token
      }
    })
      .on('data', function (chunk) {
        try {
          bytesReceived += chunk.length;
        } catch (error) {
          console.log('error occurred on data. got response');
        }
      })
      .on('end', function () {
        console.log('Download request completed');
      })
      .on('response', function (gotresponseinner) {
        var interval;
        gotresponseinner.pipe(got.stream(photoCreateResponse.headers.location, {
          method: "PUT",
          headers: {
            'Content-Length': response.size,
            'Content-Range': 'bytes 0-' + (parseInt(response.size) - 1) + '/' + response.size,
            'Expect': ''
          }
        }).on('request', function (uploadRequest) {
          console.log('Upload request initiated...');
          var initRequestBytesWritten = uploadRequest.connection.bytesWritten;
          interval = setInterval(function () {
            var actualDataBytesWritten = (uploadRequest.connection.bytesWritten - initRequestBytesWritten);
            downloadUploadProgress[requestId] = { requestTime: requestRecvdTime, recvd: bytesReceived, sent: actualDataBytesWritten, lastUpdate: new Date() };
            console.log('Download Progress' + (bytesReceived) + '/' + response.size + ', Upload Progress: ' + actualDataBytesWritten);
          }, 500);
        }).on('response', function (whateverresponse) {
          clearInterval(interval);
          downloadUploadProgress[requestId].requestTime = requestRecvdTime;
          downloadUploadProgress[requestId].status = "Completed";
          downloadUploadProgress[requestId].lastUpdate = new Date();
          console.log('Upload request response recvd.');
          console.log('Status Code: ' + whateverresponse.statusCode);
        }).on('error',function(requestUploadErr){
          console.log('error occurred while uploading file.. ' + requestUploadErr);
          clearInterval(interval);
          downloadUploadProgress[requestId].status="Error occurred: " + requestUploadErr;
        }));
      });

    res.redirect('../progress/'+ requestId);
  });
});

module.exports = router;
