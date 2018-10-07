var express = require('express');
var router = express.Router();

var path = require('path')
var childProcess = require('child_process')
var phantomjs = require('phantomjs-prebuilt')
var binPath = phantomjs.path


router.get('/process', async function (req, res, next) {
    var childArgs = [
        '--ssl-protocol=any',
        path.join(__dirname, 'openload.js'),
        'https://openload.co/f/QuuTD1Oc0EA'
    ]

    console.log('calling execFile');

    childProcess.execFile(binPath, childArgs, function (err, stdout, stderr) {
        // handle results
        console.log('Exec file completed...' + JSON.stringify({err:err, output: stdout, stderr: stderr}));
        var c = err;
    })

    res.send('Completed...');

});



module.exports = router;
