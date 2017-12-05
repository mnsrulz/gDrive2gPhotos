console.log('notifications adding...');
var socket = io('/notifications');
var downloadsInProgress = [];

socket.on("progress", function (data) {

    var progressElementCountup = downloadsInProgress[data.requestId];

    if (progressElementCountup) {

        //check if it is  in  progress or downloaded.. todo: if download completed remove it...
        progressElementCountup.update(data.recvd / data.size * 100);   //do error handling...
        console.log("progress", JSON.stringify(data));
    }
    else {
        console.log('No progress counter found for this ' + JSON.stringify(data));
    }

});

function transfer(fileid) {
    var request = superagent;
    var albumId = document.getElementById('ddl_' + fileid).value;

    //window.location.href='/index/transfer/' + fileid + '/' + albumId;

    var options = {
        useEasing: false,
        useGrouping: true,
        separator: ',',
        decimal: '.',
    };
    var progressElementCountup = new CountUp('progress_' + fileid, 0, 0, 2, 0.5, options);
    if (!progressElementCountup.error) {
        progressElementCountup.start();
    } else {
        console.error(progressElementCountup.error);
    }


    request
        .get('/index/transfer/' + fileid + '/' + albumId)   //TODO: for now its a get, need to change to POST.
        // .send({ name: 'Manny', species: 'cat' })
        // .set('X-API-Key', 'foobar')
        .set('Accept', 'application/json')
        .end(function (err, res) {
            debugger;
            socket.emit("subscribe", { requestId: res.body.requestId });
            downloadsInProgress[requestId] = progressElementCountup;

        });


}

function viewPhotos(fileid) {

    var albumId = document.getElementById('ddl_' + fileid).value;

    window.location.href = '/index/album/' + albumId;
}

    // [].slice.call( document.querySelectorAll( 'button.progress-button' ) ).forEach( function( bttn ) {
    //     new ProgressButton( bttn, {
    //         callback : function( instance ) {
    //             var progress = 0,
    //                 interval = setInterval( function() {
    //                     progress = Math.min( progress + Math.random() * 0.1, 1 );
    //                     instance._setProgress( progress );
    //                     if( progress === 1 ) {
    //                         instance._stop(1);
    //                         clearInterval( interval );
    //                     }
    //                 }, 200 );
    //         }
    //     } );
    // } );