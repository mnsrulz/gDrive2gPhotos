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
var format = require('format-duration');
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
    //console.log('Calling getAccessTokenAsync:' + JSON.stringify(oauth2Client));
    oauth2Client.getAccessToken((err, accessToken) => {
      if (err) {
        console.log('getAccessTokenAsync: An error occurred while retrieiving the token. ' + JSON.stringify(err));
        reject(err);
      }
      else resolve(accessToken);
    });
  });
}

function filterAndSort(files) {
  return files.filter(x => x.mimeType == 'application/x-matroska' || x.mimeType.startsWith("video") || x.videoMediaMetadata || x.hasThumbnail).map(x => {
    return {
      id: x.id,
      name: x.name,
      thumbnailLink: (x.hasThumbnail == false || x.thumbnailLink.lastIndexOf('s220') === -1) ? x.thumbnailLink : x.thumbnailLink.substr(0, x.thumbnailLink.lastIndexOf("s220")) + "s320",
      runTime: x.videoMediaMetadata && format(parseInt(x.videoMediaMetadata.durationMillis)),
      parentId: (x.parents && x.parents[0]) || '',
      mimeType: x.mimeType
    };
  }).sort((f1, f2) => {
    return f1["parentId"].localeCompare(f2["parentId"]) || f1["name"].localeCompare(f2["name"]);
  });
}

function t(oauth2Client, nextPageToken) {
  return new Promise((resolve, reject) => {
    service.files.list({
      auth: oauth2Client,
      pageSize: 100,
      fields: "nextPageToken, files",
      pageToken: nextPageToken
    }, function (err, response) {
      if (err) {
        console.log('An error occurred while listing the google drive files. ' + JSON.stringify(err));
        reject(err);
      }
      // else if (response.nextPageToken) {
      //   console.log('found next page token, '+response.nextPageToken +'... garbbing it');
      //   lstResponse = lstResponse.concat(response.files);
      //   t(response.nextPageToken);
      // }
      else {
        resolve({
          data: filterAndSort(response.files),
          nextPageToken: response.nextPageToken
        });
      }
    });
  });
}

router.get('/ajaxnext/:nextPageToken', async function (req, res, next) {
  var oauth2Client = getAuth(req);
  var nextPageToken = req.params.nextPageToken;
  var result = await t(oauth2Client, nextPageToken).catch(() => {
    return null;
  });

  if (result) {
    res.render('index_partial', {
      files: result.data,
      nextPageToken: result.nextPageToken,
    });
  }
  else {
    res.send({ error: 'Unable to fetch page...' });
  }
})

/* GET home page. */
router.get('/', async function (req, res, next) {
  var oauth2Client = getAuth(req);
  var promiseListFiles = t(oauth2Client);

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
    console.log('found files and listing pic albums.. jade now..');
    res.render("index", {
      title: 'Home',
      files: result[0].data,
      nextPageToken: result[0].nextPageToken,
      albums: result[1]
    });
  }).catch(() => {
    res.render('error', {
      title: 'Error',
      message: 'An unknown error occurred... Please retry to reload this page, if problem persist, then logout and login again.'
    });
    console.log('Error occurred while retrieving files or albums');
  });

});

router.get('/player/:docid', async function (req, res, next) {
  var docId = req.params.docid;

  var apiResponse = await got.get('https://apighost.herokuapp.com/api/gddirect/' + docId);
  var mediaSource = [];
  // mediaSource.push({
  //   src: 'https://doc-0g-3s-docs.googleusercontent.com/docs/securesc/ha0ro937gcuc7l7deffksulhg5h7mbp1/6dh7gcekpgmh7lurpph2ts4e1vido36m/1517148000000/02681062456505266221/*/0BxBkUUKG5UuZVUdWYU45TTZXOG8?e=download',
  //   type: 'video/mp4'
  // });

  mediaSource.push({
    src: JSON.parse(apiResponse.body).src,
    type: 'video/mp4'
  });
  res.render("player", {
    mediaSources: mediaSource,
    poster: JSON.parse(apiResponse.body).thumbnail,
    title: "Media Player (Plyr.io)"
  });
})

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

async function getGoogleDriveMediaInfo(fileId, oauth2Client) {
  return new Promise((resolve, reject) => {
    service.files.get({
      auth: oauth2Client,
      'fileId': fileId,
      "fields": "*"
    }, function (err, response) {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}

async function createVideo(photoRequest, accessToken) {
  // photoRequest.albumId;
  // photoRequest.size;
  // photoRequest.mimeType;
  // photoRequest.name;
  // photoRequest.gdocId;

  var pathToAlbum = 'https://photos.googleapis.com/data/upload/resumable/media/create-session/feed/api/user/default/albumid/' + photoRequest.albumId;
  var photoCreateBody = `<?xml version="1.0" encoding="UTF-8"?>
                      <entry xmlns="http://www.w3.org/2005/Atom" xmlns:gphoto="http://schemas.google.com/photos/2007">
                        <category scheme="http://schemas.google.com/g/2005#kind" term="http://schemas.google.com/photos/2007#photo"/>
                        <title>${photoRequest.name}</title>
                        <summary>GP_${photoRequest.gdocId}</summary>
                        <gphoto:timestamp>1475517389000</gphoto:timestamp>
                      </entry>`;

  var photoCreateResponse = await axios.post(pathToAlbum, photoCreateBody, {
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'X-Upload-Content-Length': photoRequest.size,
      'X-Upload-Content-Type': photoRequest.mimeType,
      'Slug': 'GP_' + photoRequest.gdocId,
      'X-Forwarded-By': 'me',
      'data-binary': '@-',
      'GData-Version': '3'
    }
  });
  return {
    photoLocation: photoCreateResponse.headers.location
  };
}

async function uploadToGooglePhoto(fileId, photoLocation, accessToken, rangeStart, fileSizeToUpload, totalSize) {
  console.log(`uploadToGooglePhoto input : ${JSON.stringify(arguments)}`);
  return new Promise((resolve, reject) => {
    got.stream(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      encoding: null,
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Range': `bytes = ${rangeStart}-${rangeStart + fileSizeToUpload - 1}`
      }
    }).on('data', function (chunk) {
      //bytesReceived += chunk.length;
    }).on('response', function (gotresponseinner) {
      console.log('gotresponseinner.headers: '+ JSON.stringify(gotresponseinner.headers) )
      //var interval;
      gotresponseinner.pipe(got.stream(photoLocation, {
        method: "PUT",
        headers: {
          'Content-Length': fileSizeToUpload,
          'Content-Range': `bytes ${rangeStart}-${rangeStart + fileSizeToUpload - 1}/${totalSize}`,
          //'Content-Range': 'bytes 0-' + (parseInt(response.size) - 1) + '/' + gdriveInfo.size,
          'Expect': ''
        }
      }).on('request', function (uploadRequest) {
        console.log('Upload request initiated...');
        // var initRequestBytesWritten = uploadRequest.connection.bytesWritten;
        // interval = setInterval(function () {
        //   var actualDataBytesWritten = (uploadRequest.connection.bytesWritten - initRequestBytesWritten);
        //   //let's not concentrate on the data to sent, send whichever we got now...
        //   downloadUploadProgress[requestId] = {
        //     requestId: requestId,
        //     requestTime: requestRecvdTime,
        //     size: response.size,
        //     recvd: bytesReceived,
        //     sent: actualDataBytesWritten,
        //     lastUpdate: new Date(), status: "In Progress"
        //   };
        //   req.io.in(requestId).emit('progress', downloadUploadProgress[requestId]);
        //   console.log('Download Progress' + (bytesReceived) + '/' + response.size + ', Upload Progress: ' + actualDataBytesWritten);
        // }, 500);
      }).on('response', function (whateverresponse) {
        // clearInterval(interval);
        // downloadUploadProgress[requestId].requestId = requestId;
        // downloadUploadProgress[requestId].requestTime = requestRecvdTime;
        // downloadUploadProgress[requestId].status = "Completed";
        // downloadUploadProgress[requestId].lastUpdate = new Date();
        // downloadUploadProgress[requestId].statusCode = whateverresponse.statusCode;

        // req.io.in(requestId).emit('progress', downloadUploadProgress[requestId]);
        console.log('Upload request response recvd.');
        console.log('Status Code: ' + whateverresponse.statusCode);
        resolve({ status: 'OK' });
      }).on('error', function (requestUploadErr) {
        console.log('error occurred while uploading file.. ' + JSON.stringify(requestUploadErr));
        if(requestUploadErr.statusCode===308) {
          console.log('continuing as code is 308');
          resolve({ status: 'OK' });
        }
        else{
          reject({ error: 'An error occurred: ', errorObject: requestUploadErr });
        }
        // downloadUploadProgress[requestId].requestId = requestId;
        // downloadUploadProgress[requestId].requestTime = requestRecvdTime;
        // downloadUploadProgress[requestId].status = "Error";
        // downloadUploadProgress[requestId].lastUpdate = new Date();
        // downloadUploadProgress[requestId].statusCode = whateverresponse.statusCode;
        // downloadUploadProgress[requestId].errorMessage = requestUploadErr;

        // req.io.in(requestId).emit('progress', downloadUploadProgress[requestId]);

        // clearInterval(interval);
        //downloadUploadProgress[requestId].status = "Error occurred: " + requestUploadErr;
      }));
    });
  });

}

router.get('/transfer/:fileid/:albumid', async function (req, res, next) {
  var oauth2Client = getAuth(req);
  var fileId = req.params.fileid;
  var albumId = req.params.albumid;

  var gdriveInfo = await getGoogleDriveMediaInfo(fileId, oauth2Client);
  var accessToken = await getAccessTokenAsync(req);

  var photoCreateRes = await createVideo({
    albumId: albumId,
    size: gdriveInfo.size,
    mimeType: gdriveInfo.mimeType,
    name: gdriveInfo.name,
    gdocId: fileId
  }, accessToken);


  //gets the gdrive file size to upload. If less then 900MB then we do it in a single go.
  //If size greater than 900MB then we will upload it in a 500MB chunks.

  var requestId = uuid.v4();
  // var requestRecvdTime = new Date();
  // downloadUploadProgress[requestId] = {};
  // var bytesReceived = 0; var readbytes = 0;

  res.send({ requestId: requestId });

  var bytesRemaining = gdriveInfo.size;
  var rangeStart = 0;
  const maxFileToUpload = 500 * 1024 * 1024;  //900MB
  const maxChunkToUpload = 200 * 1024 * 1024; //500MB
  while (bytesRemaining > 0) {
    var fileSizeToUpload = bytesRemaining > maxFileToUpload ? maxChunkToUpload : bytesRemaining;
    await uploadToGooglePhoto(fileId, photoCreateRes.photoLocation, accessToken, rangeStart, fileSizeToUpload, gdriveInfo.size);
    rangeStart = rangeStart + fileSizeToUpload;
    bytesRemaining = bytesRemaining - fileSizeToUpload;
  }
});

module.exports = router;
