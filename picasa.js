'use strict'
const querystring = require('querystring')

var Picasa = require('picasa');

Picasa.prototype.getVideos = getVideos;

const PICASA_SCOPE = 'https://picasaweb.google.com/data'
const PICASA_API_FEED_PATH = '/feed/api/user/default'

const FETCH_AS_JSON = 'json'

function parseEntry(entry, schema) {
    let photo = {}

    Object.keys(schema).forEach(schemaKey => {
        const key = schema[schemaKey]

        if (key) {
            const value = checkParam(entry[schemaKey]);

            photo[key] = value;
        }
    })

    return photo
}

function checkParam(param) {
    if (param === undefined) return ''
    else if (isValidType(param)) return param
    else if (isValidType(param['$t'])) return param['$t']
    else return param
}

function isValidType(value) {
    return typeof value === 'string' || typeof value === 'number'
}

function getVideos(accessToken, options, callback) {
    const accessTokenParams = {
        alt: FETCH_AS_JSON,
        kind: 'photo',
        access_token: accessToken
    }

    options = options || {}

    if (options.maxResults) accessTokenParams['max-results'] = options.maxResults

    const albumPart = options.albumId ? `/albumid/${options.albumId}` : ''

    const requestQuery = querystring.stringify(accessTokenParams)

    const requestOptions = {
        url: `${PICASA_SCOPE}${PICASA_API_FEED_PATH}${albumPart}?${requestQuery}`,
        headers: {
            'GData-Version': '2'
        }
    }

    this.executeRequest('get', requestOptions, (error, body) => {
        if (error) return callback(error)

        const photos = body.feed.entry.map(
            entry => {
                try {
                    var defaultEntry = parseEntry(entry, videoSchema);
                    defaultEntry["ts"] = new Date(parseInt(entry.gphoto$timestamp.$t));
                    defaultEntry["sources"] = entry.media$group.media$content.filter(f => f.medium === "video");
                    defaultEntry["thumbnail"] = entry.media$group.media$thumbnail;
                    defaultEntry["orgResolutionPresent"] = true;
                    var defaultSource = entry.media$group.media$content.find(f => f.medium === "video" && f.height.toString() === defaultEntry.height);
                    defaultEntry.content.thumb = defaultEntry.content.src;
                    if (defaultSource == null) {
                        defaultEntry["orgResolutionPresent"] = false;
                        defaultSource = entry.media$group.media$content.filter(f => f.medium === "video").sort(function (a, b) {
                            if (a.width < b.width)
                                return -1;
                            if (a.width > b.width)
                                return 1;
                            return 0;
                        }).pop();
                    }
                    defaultEntry.content.src = defaultSource.url;
                    defaultEntry.content.type = defaultSource.type;
                    return defaultEntry;
                } catch (error) {
                    console.log('An error occurred while parsing the video entry.' + error);
                }
            }
        ).filter(x => x);




        callback(null, photos)
    })
}

const videoSchema = {
    'gphoto$id': 'id',
    'gphoto$albumid': 'album_id',
    'gphoto$width': 'width',
    'gphoto$height': 'height',
    'gphoto$size': 'size',
    'content': 'content',
    'title': 'title',
    'summary': 'summary'
}


module.exports = Picasa;
