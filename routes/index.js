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
var got=require('got');

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

router.get('/temp', function (req, res, next) {

  fs.readdir(__dirname, function (err, items) {


    const response = [];
    for (let file of items) {
      const extension = path.extname(file);
      const fileSizeInBytes = fs.statSync(file).size;
      response.push({ name: file, extension, fileSizeInBytes });
    }

    res.end('Error: ' + JSON.stringify(err) + ', Items: ' + JSON.stringify(response));
    //res.end('Error: ' + JSON.stringify(err) + ', Items: ' + JSON.stringify(items));
    // for (var i=0; i<items.length; i++) {
    //   console.log(items[i]);
    // }
  });

})

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
    var photoCreateBody = '<?xml version="1.0" encoding="UTF-8"?><entry xmlns="http://www.w3.org/2005/Atom" xmlns:gphoto="http://schemas.google.com/photos/2007"><category scheme="http://schemas.google.com/g/2005#kind" term="http://schemas.google.com/photos/2007#photo"/><title>' + 'GP_'+ response.name + '</title><gphoto:timestamp>1475517389000</gphoto:timestamp></entry>';

    var photoCreateResponse = await axios.post(pathToAlbum, photoCreateBody, {
      headers: {
        'Authorization': 'Bearer ' + oauth2Client.credentials.access_token,
        'Content-Type': 'application/atom+xml; charset=utf-8',
        'X-Upload-Content-Length': response.size,
        'X-Upload-Content-Type': response.mimeType,
        'Slug': 'GP_'+response.name,
        'X-Forwarded-By': 'me',
        'data-binary': '@-',
        'GData-Version': '3'
      }
    });

    var bytes = 0;var readbytes=0;
    var tmpfilename = path.join(__dirname, uuid.v4() + '.tmp');
    
    var writestream=fs.createWriteStream(tmpfilename)
    .on('finish',function(){
      console.log('finished writing...');
      setTimeout(() => {
        //uploadfromfs();   
      }, 1000);
    })
    .on('pipe',function(){
      console.log('someone writing...');
    })
    .on('unpipe',function(){
      console.log('someone stopped writing...');
      clearInterval();
    });

/*
https://www.googleapis.com/drive/v3/files/0B9jNhSvVjoIVM3dKcGRKRmVIOVU?alt=media
Authorization: Bearer <ACCESS_TOKEN>
*/

    got.stream('https://www.googleapis.com/drive/v3/files/'+ fileId +'?alt=media' , {
      headers: {
        'Authorization': 'Bearer ' +  oauth2Client.credentials.access_token
      }
    }).on('request',function(args0,args1){

      args0.on('error',function(){
var error=arguments[0];
      });
      var reo11=args0;
      //.pipe(writestream);

    })
    .on('response',function(gotresponseinner){
      gotresponseinner.on('data',function(chunk){
        try {
          bytes += chunk.length;
        } catch (error) {
          console.log('error occurred on data. got response');
        }
      });
    })
    .on('error',function(){
var erse="err";
    })
    .pipe(writestream);


    // var googleFileRequest = service.files.get({
    //   auth: oauth2Client,
    //   fileId: fileId,
    //   alt: 'media'
    // })
    //   .on('end', function () {
    //     try {
         
    //     //clearInterval(interval);
    //     console.log('Download Done, now uploading...');
        
        
    //     } catch (error) {
    //       console.log('error occurred at end.googleFileRequest ');
    //     }
    //   })
    //   .on('data', function (chunk) {
    //     try {
    //       bytes += chunk.length;
    //     } catch (error) {
    //       console.log('error occurred on data. googleFileRequest');
    //     }
    //   })
    //   .on('error', function (err) {
    //     clearInterval(interval);
    //     console.log('Error during download', err);
    //   })
    //   .pipe(writestream);

    function uploadfromfs() {
      
      // var putrequest = request.put(photoCreateResponse.headers.location, {
      //   headers: {
      //     'Content-Length': response.size,
      //     'Content-Range': 'bytes 0-' + (parseInt(response.size) - 1) + '/' + response.size,
      //     'Expect': ''
      //   }
      // });

      fs.createReadStream(tmpfilename)
        .on('end', function () {
          try {
          console.log('File read end reached... Ending the request...');
          clearInterval(interval);
          //putrequest.end(); 
          } catch (error) {
            console.log('error occurred on end. fscreatereadstream');
          }
        })
        .pipe(got.stream.put(photoCreateResponse.headers.location, {
          headers: {
            'Content-Length': response.size,
            'Content-Range': 'bytes 0-' + (parseInt(response.size) - 1) + '/' + response.size,
            'Expect': ''
          }
        }));
    }

   var interval= setInterval(function () {
      console.log('Download Progress' + (bytes) + '/' + response.size + ', Upload Progress: ' + readbytes);
    }, 500);

    //putrequest.body=googleFileRequest;
    //putrequest.end();

    // putrequest.on('end', function () {
    //   clearInterval(interval);
    //   //console.log('Write  progress'+ (putrequest.req.connection.bytesWritten) + '/'+response.size);
    // });
    // putrequest.on('error', function () {
    //   clearInterval(interval);
    //   //console.log('Write  progress'+ (putrequest.req.connection.bytesWritten) + '/'+response.size);
    // });

    // putrequest.on('drain', function () {
    //   //console.log('Write  progress'+ (putrequest.req.connection.bytesWritten) + '/'+response.size);
    // });

    // var interval = setInterval(function () {
    //   try {
    //     console.log('Write: ' + putrequest.req.connection.bytesWritten + '/' + response.size);
    //   } catch (error) {
    //     //do nothing..
    //   }
    // }, 500);


    res.end("Queued..." + tmpfilename);
  });
});

module.exports = router;
