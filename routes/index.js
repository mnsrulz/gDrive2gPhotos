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
var Picasa = require('../picasa');

var picasa = new Picasa();

var gauthconfig = oauthConfig.google;

var downloadUploadProgress = [];

function getAuth(req) {
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(gauthconfig.clientID, gauthconfig.clientSecret, gauthconfig.callbackURL);
  oauth2Client.credentials = req.user.token;
  return oauth2Client;
}

function getAccessTokenAsync(req) {
  return new Promise((resolve, reject) => {
    var oauth2Client = getAuth(req);
    oauth2Client.getAccessToken((err, accessToken) => {
      if (err) {
        reject('getAccessTokenAsync: An error occurred while retrieiving the token');
      }
      else resolve(accessToken);
    });
  });
}


/* GET home page. */
router.get('/', async function (req, res, next) {
  var oauth2Client = getAuth(req);
  var promiseListFiles = new Promise((resolve, reject) => {
    service.files.list({
      auth: oauth2Client,
      pageSize: 100,
      fields: "nextPageToken, files"
    }, function (err, response) {
      if (err) {
        console.log(JSON.stringify(oauth2Client));
        reject(err);
      }
      else {
        resolve(response.files);
      }
    });
  });

  var promiseListAlbums = new Promise(async (resolve, reject) => {
    var accessToken = await getAccessTokenAsync(req);
    picasa.getAlbums(accessToken, {}, (error, albums) => {
      if (error) {
        reject(error);
      }
      else {
        resolve(albums);
      }
    });
  });

  Promise.all([promiseListFiles, promiseListAlbums]).then((result) => {
    res.render("index", { files: result[0], albums: result[1] });
  }).catch(() => {
    res.end('An unknown error occurred');
    console.log('Error occurred while retrieving files or albums');
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

router.get('/album', function (req, res, next) {
  var oauth2Client = getAuth(req);
  oauth2Client.getAccessToken((err, accessToken) => {
    if (err) {
      res.send('ListToken: An error occurred while retrieiving the photos');
    } else {
      picasa.getAlbums(accessToken, {}, (error, albums) => {
        if (error) {
          res.send(error);
        }
        else {
          res.send(JSON.stringify(albums));
        }
      });
    }
  })
});

router.get('/proxyplay/:gdriveFileId/:gphotourl', function (req, res, next) {
  var gdriveurltohit = encodeURIComponent('https://drive.google.com/open?id=' + req.params.gdriveFileId);
  request.post({
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    url: 'http://demo.filedeo.stream/drive/',
    body: 'url=' + gdriveurltohit + '&submit=GET'
  }, function (err1, res1, body) {
    if (err1) {
      console.log('error occurred while generating the gdrive direct link:' + err1);
      res.redirect(req.params.gphotourl);
    } else {
      var drivedirecturl = body.match(/https.*?download/)[0];
      console.log('found gdrive url as: ' + drivedirecturl);
      res.redirect(drivedirecturl);
    }
  });
});

router.get('/album/:albumid', function (req, res, next) {
  var albumId = req.params.albumid;
  var oauth2Client = getAuth(req);
  oauth2Client.getAccessToken((err, accessToken) => {
    if (err) {
      reject('ListToken: An error occurred while retrieiving the photos');
    }
    var options = {
      maxResults: 100, // by default get all
      albumId: albumId // by default all photos are selected
    };

    picasa.getVideos(accessToken, options, (error, albums) => {
      if (error) {
        res.send(error);
      }
      else {
        res.send(JSON.stringify(albums, null, 4));
      }
    });
  });

})

router.get('/transfer/:fileid/:albumid', function (req, res, next) {
  var oauth2Client = getAuth(req);
  var fileId = req.params.fileid;
  var albumId = req.params.albumid;
  service.files.get({
    auth: oauth2Client,
    'fileId': fileId,
    "fields": "*"
  }, async function (err, response) {
    var pathToAlbum = 'https://photos.googleapis.com/data/upload/resumable/media/create-session/feed/api/user/default/albumid/' + albumId;
    var accessToken = await getAccessTokenAsync(req);
    var photoCreateBody = '<?xml version="1.0" encoding="UTF-8"?><entry xmlns="http://www.w3.org/2005/Atom" xmlns:gphoto="http://schemas.google.com/photos/2007"><category scheme="http://schemas.google.com/g/2005#kind" term="http://schemas.google.com/photos/2007#photo"/><title>' + 'GP_' + fileId + '</title><summary>' + response.name + '</summary><gphoto:timestamp>1475517389000</gphoto:timestamp></entry>';

    var photoCreateResponse = await axios.post(pathToAlbum, photoCreateBody, {
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/atom+xml; charset=utf-8',
        'X-Upload-Content-Length': response.size,
        'X-Upload-Content-Type': response.mimeType,
        'Slug': 'GP_' + fileId,
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
            //let's not concentrate on the data to sent, send whichever we got now...
            downloadUploadProgress[requestId] = {
              requestId: requestId,
              requestTime: requestRecvdTime,
              size: response.size,
              recvd: bytesReceived,
              sent: actualDataBytesWritten,
              lastUpdate: new Date(), status: "In Progress"
            };
            req.io.in(requestId).emit('progress', downloadUploadProgress[requestId]);
            console.log('Download Progress' + (bytesReceived) + '/' + response.size + ', Upload Progress: ' + actualDataBytesWritten);
          }, 500);
        }).on('response', function (whateverresponse) {
          clearInterval(interval);
          downloadUploadProgress[requestId].requestId = requestId;
          downloadUploadProgress[requestId].requestTime = requestRecvdTime;
          downloadUploadProgress[requestId].status = "Completed";
          downloadUploadProgress[requestId].lastUpdate = new Date();
          downloadUploadProgress[requestId].statusCode = whateverresponse.statusCode;

          req.io.in(requestId).emit('progress', downloadUploadProgress[requestId]);
          console.log('Upload request response recvd.');
          console.log('Status Code: ' + whateverresponse.statusCode);
        }).on('error', function (requestUploadErr) {
          console.log('error occurred while uploading file.. ' + requestUploadErr);

          downloadUploadProgress[requestId].requestId = requestId;
          downloadUploadProgress[requestId].requestTime = requestRecvdTime;
          downloadUploadProgress[requestId].status = "Error";
          downloadUploadProgress[requestId].lastUpdate = new Date();
          downloadUploadProgress[requestId].statusCode = whateverresponse.statusCode;
          downloadUploadProgress[requestId].errorMessage = requestUploadErr;

          req.io.in(requestId).emit('progress', downloadUploadProgress[requestId]);

          clearInterval(interval);
          //downloadUploadProgress[requestId].status = "Error occurred: " + requestUploadErr;
        }));
      });

    res.send({ requestId: requestId });
  });
});

module.exports = router;
