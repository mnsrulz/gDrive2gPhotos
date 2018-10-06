var express = require('express');
var router = express.Router();

var google = require('googleapis');
// var googleAuth = require('google-auth-library');
// var oauthConfig = require('../oauthConfig');
var service = google.youtube('v3');

var googleAuthWrapper = require('../routes/googleauthwrapper');
var got = require('got');

var gddirect = require('gddirecturl');

function getAuth(req) {
  return googleAuthWrapper.getAuth(req);
}

function getAccessTokenAsync(req) {
  return googleAuthWrapper.getAccessTokenAsync(req);
}


/* GET users listing. */
router.get('/', function (req, res, next) {
  res.send('respond with a resource');
});

router.post('/upload', async function (req, res, next) {
  var result = await uploadVideo(req.body.fileid, getAuth(req));
  res.send('uploaded');
});


// authorize(JSON.parse(content), {
//   'params': { 'part': 'snippet,status' }, 'properties': {
//     'snippet.categoryId': '22',
//     'snippet.defaultLanguage': '',
//     'snippet.description': 'Description of uploaded video.',
//     'snippet.tags[]': '',
//     'snippet.title': 'Test video upload',
//     'status.embeddable': '',
//     'status.license': '',
//     'status.privacyStatus': 'private',
//     'status.publicStatsViewable': ''
//   }, 'mediaFilename': 'sample_video.mp4'
// }, videosInsert);

function removeEmptyParameters(params) {
  for (var p in params) {
    if (!params[p] || params[p] == 'undefined') {
      delete params[p];
    }
  }
  return params;
}

function createResource(properties) {
  var resource = {};
  var normalizedProps = properties;
  for (var p in properties) {
    var value = properties[p];
    if (p && p.substr(-2, 2) == '[]') {
      var adjustedName = p.replace('[]', '');
      if (value) {
        normalizedProps[adjustedName] = value.split(',');
      }
      delete normalizedProps[p];
    }
  }
  for (var p in normalizedProps) {
    // Leave properties that don't have values out of inserted resource.
    if (normalizedProps.hasOwnProperty(p) && normalizedProps[p]) {
      var propArray = p.split('.');
      var ref = resource;
      for (var pa = 0; pa < propArray.length; pa++) {
        var key = propArray[pa];
        if (pa == propArray.length - 1) {
          ref[key] = normalizedProps[p];
        } else {
          ref = ref[key] = ref[key] || {};
        }
      }
    };
  }
  return resource;
}

async function uploadVideo(fileId, auth) {

  var fileDirectLink = await gddirect.getMediaLink(fileId);
  var fileName = fileId;

  var requestData = {
    'params': { 'part': 'snippet,status' }, 'properties': {
      'snippet.categoryId': '22',
      'snippet.defaultLanguage': '',
      'snippet.description': 'Description of uploaded video.',
      'snippet.tags[]': '',
      'snippet.title': 'Test video upload' + fileId,
      'status.embeddable': '',
      'status.license': '',
      'status.privacyStatus': 'private',
      'status.publicStatsViewable': ''
    }, 'mediaFilename': 'sample_video' + fileId + '.mp4'
  };

  var parameters = removeEmptyParameters(requestData['params']);
  parameters['auth'] = auth;
  //parameters['media'] = { body: fs.createReadStream(requestData['mediaFilename']) };
var bytesReceived=0;
  return new Promise((resolve, reject) => {
    got.stream(fileDirectLink.src, {
      encoding: null
    }).on('data', function (chunk) {
      bytesReceived += chunk.length;
      console.log('FileId: ' + fileId + ', Progress: ' + bytesReceived);
    }).on('response', function (gotresponseinner) {
      parameters['media'] = { body: gotresponseinner };
      parameters['notifySubscribers'] = false;
      parameters['resource'] = createResource(requestData['properties']);

      var req = service.videos.insert(parameters, function (err, data) {
        if (err) {
          reject(err);
          console.log('The API returned an error: ' + err);
        }
        if (data) {
          console.log('The API successfully returned: ');
          console.log('Data returned: ' + data);
          resolve(data);
          // console.log(util.inspect(data, false, null));
        }
        // process.exit();
      });
    });
  });
  //Get Stream
  //Pipe to youtube upload
}




module.exports = router;
