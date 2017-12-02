function transfer(fileid){

    var albumId=document.getElementById('ddl_'+fileid).value;

    window.location.href='/index/transfer/' + fileid + '/' + albumId;
}

function viewPhotos(fileid){
    
        var albumId=document.getElementById('ddl_'+fileid).value;
    
        window.location.href='/index/album/' + albumId;
    }