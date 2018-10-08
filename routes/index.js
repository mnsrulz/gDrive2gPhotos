var express = require('express');
var router = express.Router();
var google = require('googleapis');
// var googleAuth = require('google-auth-library');
// var oauthConfig = require('../oauthConfig');
var service = google.drive('v3');
var axios = require('axios');
var request = require('request');
var fs = require('fs');
var path = require('path');
var got = require('got');
var Picasa = require('picasa-extended');
var format = require('format-duration');
var picasa = new Picasa();
var url = require('url');

//var gauthconfig = oauthConfig.google;

var downloadUploadProgress = [];

var googleAuthWrapper = require('../routes/googleauthwrapper');

function getAuth(req) {
  return googleAuthWrapper.getAuth(req);
}

function getAccessTokenAsync(req) {
  return googleAuthWrapper.getAccessTokenAsync(req);
}

function filterAndSort(files) {
  return files.filter(x => x.mimeType == 'application/x-matroska' || x.mimeType.startsWith("video") || x.videoMediaMetadata || x.hasThumbnail).map(x => {
    return {
      id: x.id,
      name: x.name,
      thumbnailLink: (x.hasThumbnail == false || x.thumbnailLink.lastIndexOf('s220') === -1) ? x.thumbnailLink : x.thumbnailLink.substr(0, x.thumbnailLink.lastIndexOf("s220")) + "s320",
      runTime: x.videoMediaMetadata && format(parseInt(x.videoMediaMetadata.durationMillis)),
      parentId: (x.parents && x.parents[0]) || '',
      mimeType: x.mimeType,
      iconLink: x.iconLink
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
      pageToken: nextPageToken,
      q: "mimeType!='application/vnd.google-apps.folder' and mimeType!='image/jpeg' and not '1UsclHjn0sZUEp0X3mq5fpEn3ppgkdl3q' in parents"
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

  // var promiseListAlbums = new Promise(async (resolve, reject) => {
  //   var accessToken = await getAccessTokenAsync(req);
  //   picasa.getAlbums(accessToken, {}, (error, albums) => {
  //     if (error) {
  //       reject(error);
  //     }
  //     else {
  //       resolve(albums);
  //     }
  //   });
  // });

  Promise.all([promiseListFiles]).then((result) => {
    console.log('found files and listing pic albums.. jade now..');
    res.render("index", {
      title: 'Home',
      files: result[0].data,
      nextPageToken: result[0].nextPageToken,
      //albums: result[1]
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

router.get('/addlink', async function (req, res, next) {
  res.render("addlink", {

  });
})


router.post('/addToIgnoreList', async function (req, res, next) {
  var oauth2Client = getAuth(req);
  var fileId = req.body.fileId;
  try {
    var ignoreFolderId = await getIgnoreFolderId(oauth2Client);
    await addFileToMyDrive(fileId, ignoreFolderId, oauth2Client);
    res.send('Added to ignored list.');
  } catch (error) {
    console.log(JSON.stringify(error));
    res.send('An error occurred... ' + JSON.stringify(error));
  } 
})


// router.get('/getinfo', async function (req, res, next) {
//   res.render("getinfo", {

//   });
// })

router.get('/getinfo', async function (req, res, next) {
  var fileId = req.query.fileid;
  fileId = extractFileId(fileId);
  if (fileId) {
    var oauth2Client = getAuth(req);
    var gdriveInfo;
    try {
      gdriveInfo = await getGoogleDriveMediaInfo(fileId, oauth2Client);
    } catch (error) {
      gdriveInfo = "Error!!!"
    }
    res.render("getinfo", {
      fileInfo: gdriveInfo
    });
  } else {
    res.render("getinfo", {
      error: "Invalid google drive link"
    });
  }
});

router.post('/addlink', async function (req, res, next) {
  var gdlink = req.body.gdlink;
  var fileId = extractFileId(gdlink);
  if (fileId) {
    var oauth2Client = getAuth(req);
    try {
      var rootFolder = await getGoogleDriveMediaInfo(folderId, oauth2Client);
      var fileAddResponse = await addFileToMyDrive(fileId, rootFolder.id, oauth2Client);
    }
    catch (error) {
      fileAddResponse = error;
    }
    res.render("addlink", {
      fileInfo: fileAddResponse
    });
  } else {
    res.render("addlink", {
      error: "Invalid google drive link"
    });
  }
})

function extractFileId(gdlink) {
  if (gdlink) {
    var fileId;
    var parsedUrl = url.parse(gdlink, true);
    var queryData = parsedUrl.query;
    if (queryData.id) {
      fileId = queryData.id;
    }
    else {
      var parts = gdlink.match(/\/d\/(.+)\//);
      if (parts && parts.length == 2) {
        fileId = parts[1];
      } else {
        fileId = gdlink;
      }
    }
    return fileId;
  } else {
    return null;
  }
}

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

async function getIgnoreFolderId(oauth2Client) {
  return new Promise((resolve, reject) => {
    service.files.list({
      auth: oauth2Client,
      q: "mimeType='application/vnd.google-apps.folder' and name = 'IGNORE_FOLDER' and 'root' in parents",
      fields: 'files(id, name)'
    }, function (err, res) {
      if (err) {
        reject(err);
      } else {
        if (res.files.length === 1) {
          var folderId = res.files[0].id;
          resolve(folderId);
        }
        else {
          reject('IGNORE_FOLDER Folder not found. You must create a folder with this name in your root folder.');
        }
      }
    });
  });
}

async function addFileToMyDrive(fileId, folderId, oauth2Client) {
  return new Promise((resolve, reject) => {
    service.files.get({
      auth: oauth2Client,
      fileId: fileId,
      fields: 'parents'
    }, function (err, file) {
      if (err) {
        reject(err);
      } else {
        if (file.parents && file.parents.indexOf(folderId) >= 0) {
          reject('File already exists in this folder...');
        }
        else {
          service.files.update({
            auth: oauth2Client,
            fileId: fileId,
            addParents: folderId,
            fields: 'id, parents'
          }, function (err, file) {
            if (err) {
              reject(err);
            } else {
              resolve(file);
            }
          });
        }
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
      console.log('gotresponseinner.headers: ' + JSON.stringify(gotresponseinner.headers))
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
        if (requestUploadErr.statusCode === 308) {
          console.log('continuing as code is 308');
          resolve({ status: 'OK' });
        }
        else {
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
  var bytesReceived = 0; var flag = false;
  var gotStream = got.stream(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    encoding: null,
    headers: {
      'Authorization': 'Bearer ' + accessToken
    }
  });

  gotStream.on('response', () => {
    var videoData = {
      body: gotStream,
      contentLength: gdriveInfo.size,
      mimeType: gdriveInfo.mimeType,
      title: gdriveInfo.name,
      summary: `GP_${fileId}`
    };

    picasa.postVideo(accessToken, albumId, videoData, (a, b, c, d, e) => {
      console.log(JSON.stringify(a));
    });
  });

  res.send('done!!!');

});

module.exports = router;
