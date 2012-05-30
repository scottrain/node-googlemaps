var qs = require('querystring'),
    request = require('request'),
    crypto = require('crypto'),
    url = require('url'),
    waitress = require('waitress'),
    util = require('util'),
    config;

// this is deprecated
exports.setProxy = function(uri) {
  config('proxy', uri);
};

var _config = {
  'google-client-id': null,
  'stagger-time': 200,
  'encode-polylines': true,
  'proxy': null,
  set 'google-private-key'(privateKey) {
    if (privateKey){
      // Google private keys are URL friendly base64, needs to be replaced with base64 valid characters
      this.googlePrivateKey = privateKey.replace(/-/g,'+').replace(/_/g,'/');
      this.googlePrivateKey = new Buffer(this.googlePrivateKey, 'base64');
    } else {
      this.googlePrivateKey = null;
    }
  },
  get 'google-private-key'() {
    return this.googlePrivateKey || null;
  }
};

exports.config = config = function(key, value) {
  if (arguments.length === 1) {
    if (typeof key === 'object' && key !== null) {
      var settings = key;
      for (var key in settings) {
        config(key, settings[key]);
      }
    } else {
      return _config[key];
    }
  } else {
    _config[key] = value;
  }
};

// http://code.google.com/apis/maps/documentation/places/
exports.places = function(request, cb) {
  var args = {
    location: request.latlng,
    radius: request.radius,
    key: request.key
  };
  if (request.types) args.types = request.types;
  if (request.lang) args.lang = request.lang;
  if (request.name) args.name = request.name;
  args.sensor = request.sensor || 'false';

  var path = '/maps/api/place/search/json';

  if (request.urlOnly) {
    return buildUrl(path, args);
  }
  else {
    return makeRequest(path, args, true, returnObjectFromJSON(cb));
  }
};

exports.placeDetails = function(request, cb) {
  var args = {
    reference: request.referenceId,
    key: request.key
  };
  if (request.lang) args.lang = request.lang;
  args.sensor = request.sensor || 'false';

  var path = '/maps/api/place/details/json';

  if (request.urlOnly) {
    return buildUrl(path, args);
  }
  else {
    return makeRequest(path, args, true, returnObjectFromJSON(cb));
  }
};

// http://code.google.com/apis/maps/documentation/geocoding/
exports.geocode = function(request, cb) {
  var args = {
    'address': request.address
  };
  if (request.bounds) args.bounds = request.bounds;
  if (request.region) args.region = request.region;
  if (request.language) args.language = request.language;
  args.sensor = request.sensor || 'false';

  var path = '/maps/api/geocode/json';

  if (request.urlOnly) {
    return buildUrl(path, args);
  }
  else {
    return makeRequest(path, args, false, returnObjectFromJSON(cb));
  }
};

// http://code.google.com/apis/maps/documentation/geocoding/#ReverseGeocoding
exports.reverseGeocode = function(request, cb) {
  var args = {
    'latlng': request.latlng
  };
  if (request.language) args.language = request.language;
  args.sensor = request.sensor || 'false';

  var path = '/maps/api/geocode/json';

  if (request.urlOnly) {
    return buildUrl(path, args);
  }
  else {
    return makeRequest(path, args, false, returnObjectFromJSON(cb));
  }
};

// http://code.google.com/apis/maps/documentation/distancematrix/
exports.distance = function(request, cb) {
  var args = {
    'origins': request.origins,
    'destinations': request.destinations
  };
  if (request.mode) args.mode = request.mode;
  if (request.avoid) args.avoid = request.avoid;
  if (request.units) args.units = request.units;
  if (request.language) args.language = request.language;
  args.sensor = request.sensor || 'false';

  var path = '/maps/api/distancematrix/json';

  if (request.urlOnly) {
    return buildUrl(path, args);
  }
  else {
    return makeRequest(path, args, false, returnObjectFromJSON(cb));
  }
};

// http://code.google.com/apis/maps/documentation/directions/
exports.directions = function(request, cb) {
  var args = {
    'origin': request.origin,
    'destination': request.destination
  };
  if (request.mode) args.mode = request.mode;
  if (request.waypoints) args.waypoints = request.waypoints;
  if (request.alternatives) args.alternatives = request.alternatives;
  if (request.avoid) args.avoid = request.avoid;
  if (request.units) args.units = request.units;
  if (request.language) args.language = request.language;
  args.sensor = request.sensor || 'false';

  var path = '/maps/api/directions/json';

  if (request.urlOnly) {
    return buildUrl(path, args);
  }
  else {
    return makeRequest(path, args, false, returnObjectFromJSON(cb));
  }
};

// http://code.google.com/apis/maps/documentation/elevation/
// http://code.google.com/apis/maps/documentation/elevation/#Locations
exports.elevationFromLocations = function(request, cb) {
  if (config('encode-polylines')){
    locations = 'enc:' + createEncodedPolyline(request.locations);
  }
  var args = {
    'locations': request.locations
  };
  args.sensor = request.sensor || 'false';

  var path = '/maps/api/elevation/json';

  if (request.urlOnly) {
    return buildUrl(path, args);
  }
  else {
    return makeRequest(path, args, false, returnObjectFromJSON(cb));
  }
};

// http://code.google.com/apis/maps/documentation/elevation/#Paths
exports.elevationFromPath = function(request, cb) {
  if (config('encode-polylines')){
    request.path = 'enc:' + createEncodedPolyline(request.path);
  }
  var args = {
    'path': request.path,
    'samples': request.samples
  };
  args.sensor = request.sensor || 'false';
  var reqPath = '/maps/api/elevation/json';

  var maxlen = 1500;
  var count = (request.path.length < maxlen ? 1 : Math.ceil(request.path.length/maxlen));

  if (count === 1) {
    if (request.urlOnly) {
      return buildUrl(path, args);
    }
    else {
      makeRequest(reqPath, args, false, returnObjectFromJSON(cb));
    }
  } else {
    var done = waitress(count, function(err, results) {
      results = results.sort(function(a, b) {
        return a.n - b.n;
      }).map(function(v) {
        return v.results;
      });
      var status = "OK";
      var aggregated = [];
      results.forEach(function(result) {
        aggregated = aggregated.concat(result.results);
        if (result.status !== "OK") {
          status = result.status;
        }
      });
      results = {
        results: aggregated,
        status: status
      };
      cb(null, results);
    });

    request.path = request.path.split("|");
    var pieceSize = Math.ceil(request.path.length / count);
    var n = 0;
    while (request.path.length) {
      var smallerPath = request.path.splice(0, pieceSize);
      // google will throttle us if we launch all the
      // requests together, so we have to stagger them.
      (function(n, path, samples) {
        path = path.join("|");
        var cb = function(err, results) {
          if (err) return done(err);
          done(null, { n: n, results: results });
        };
        setTimeout(function() {
          exports.elevationFromPath(path, samples, cb, sensor);
        }, Math.floor(Math.random() * config('stagger-time')));
      })(++n, smallerPath, smallerPath.length);
    }
  }
};

// http://code.google.com/apis/maps/documentation/staticmaps
exports.staticMap = function(request, cb) {
  var args = {
    'center': request.center,
    'zoom': request.zoom,
    'size': request.size
  };
  var i, k;

  if (request.maptype) args.maptype = request.maptype;
  if (request.markers) {
    var markers = request.markers;
    args.markers = [];
    for (i = 0; i < markers.length; i++) {
      var marker = '';
      if (markers[i].size)     marker += '|size:'   + markers[i].size;
      if (markers[i].color)    marker += '|color:'  + markers[i].color;
      if (markers[i].label)    marker += '|label:'  + markers[i].label;
      if (markers[i].icon)     marker += '|icon:'   + markers[i].icon;
      if (markers[i].shadow)   marker += '|shadow:' + markers[i].shadow;
      if (markers[i].location) marker += '|'      + markers[i].location;
      args.markers[i] = marker;
    }
  }
  if (request.styles) {
    var styles = request.styles;
    args.style = [];
    for (i = 0; i < styles.length; i++) {
      var new_style = '';
      if (styles[i].feature) new_style += '|feature:' + styles[i].feature;
      if (styles[i].element) new_style += '|element:' + styles[i].element;

      var rules = styles[i].rules;

      if (rules) {
        for (k in rules) {
          var rule = rules[k];
          new_style += '|' + k + ':' + rule;
        }
      }
      args.style[i] = new_style;
    }
  }
  if (request.paths) {
    var paths = request.paths;
    args.path = [];
    for (i = 0; i < paths.length; i++) {
      var new_path = '';
      if (paths[i].weight)    new_path += '|weight:' + paths[i].weight;
      if (paths[i].color)     new_path += '|color:' + paths[i].color;
      if (paths[i].fillcolor) new_path += '|fillcolor:' + paths[i].fillcolor;

      var points = paths[i].points;

      if (points) {
        if (config('encode-polylines')){
          new_path += '|enc:' + createEncodedPolyline(points);
        } else {
          for (k = 0; k < points.length; k++) {
            new_path += '|' + points[k];
          }
        }
      }
      args.path[i] = new_path.replace(/^\|/, '');
    }
  }
  args.sensor = request.sensor || 'false';

  var path = '/maps/api/staticmap';

  if (request.urlOnly) {
    return buildUrl(path, args);
  }
  else {
    return makeRequest(path, args, false, cb, 'binary');
  }
};

// http://code.google.com/apis/maps/documentation/streetview
exports.streetView = function(request, cb) {
  var args = {
    'size': request.size,
    'location': request.location
  };
  if (request.heading) {
    request.heading = parseInt(request.heading);
    if (request.heading >= 0 && request.heading <= 360) {
      args.heading = request.heading;
    }
  }
  if (request.fov) {
    request.fov = parseInt(request.fov);
    if (request.fov >= 0 && request.fov <= 120) {
      args.fov = request.fov;
    }
  }
  if (request.pitch) {
    request.pitch = parseInt(request.pitch);
    if (request.pitch >= -90 && request.pitch <= 90) {
      args.pitch = request.pitch;
    }
  }

  args.sensor = request.sensor || 'false';
  var path = '/maps/api/streetview';

  if (request.urlOnly) {
    return buildUrl(path, args);
  }
  else {
    return makeRequest(path, args, false, cb, 'binary');
  }
};

//  Helper function to check and convert an array of points, be it strings/numbers/etc
//    into the format used by Google Maps for representing lists of latitude/longitude pairs
exports.checkAndConvertArrayOfPoints = function(input) {
  switch (typeof input) {
    case 'object':
      if (input instanceof Array) {
        var output = [];
        for (var i = 0; i < input.length; i++) {
          output.push(exports.checkAndConvertPoint(input[i]));
        }
        return output.join('|');
      }
      break;
    case 'string':
      return input;
  }
  throw(new Error("Unrecognized input: checkAndConvertArrayOfPoints accepts Arrays and Strings"));
};

//  Helper function to check and convert an points, be it strings/arrays of numbers/etc
//    into the format used by Google Maps for representing latitude/longitude pairs
exports.checkAndConvertPoint = function(input) {
  switch (typeof input) {
    case 'object':
      if (input instanceof Array) {
        return input[0].toString() + ',' + input[1].toString();
      }
      break;
    case 'string':
      return input;
  }
  throw(new Error("Unrecognized input: checkAndConvertPoint accepts Arrays of Numbers and Strings"));
};

//  Wraps the callback function to convert the output to a javascript object
var returnObjectFromJSON = function(cb) {
  if (typeof cb === 'function') {
    return function(err, jsonString) {
      try {
        cb(err, JSON.parse(jsonString));
      } catch (e) {
        cb(e);
      }
    };
  }
  return false;
};

// Algorithm pull from Google's definition of an encoded polyline
//
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm

function createEncodedPolyline(points) {
  // Dear maintainer:
  //
  // Once you are done trying to 'optimize' this routine,
  // and have realized what a terrible mistake that was,
  // please increment the following counter as a warning
  // to the next guy:
  //
  // total_hours_wasted_here = 11
  //
  var i, dlat, dlng;
  var plat = 0;
  var plng = 0;
  var encoded_points = "";
  if(typeof points === 'string') {
    points = points.split('|');
  }

  for(i = 0; i < points.length; i++) {

    var point = points[i];
    var lat, lng;
    if (typeof point === 'string') {
      point = point.split(',');
      lat = point[0];
      lng = point[1];
    }
    else {
      lat = point.lat;
      lng = point.lng;
    }
    var late5 = Math.round(lat * 1e5);
    var lnge5 = Math.round(lng * 1e5);
    dlat = late5 - plat;
    dlng = lnge5 - plng;
    plat = late5;
    plng = lnge5;
    encoded_points += encodeSignedNumber(dlat) + encodeSignedNumber(dlng);
  }
  return encoded_points;
}

exports.createEncodedPolyline = createEncodedPolyline;


function encodeNumber(num) {
  var encodeString = "";
  var nextValue, finalValue;
  while (num >= 0x20) {
    nextValue = (0x20 | (num & 0x1f)) + 63;
    encodeString += (String.fromCharCode(nextValue));
    num >>= 5;
  }
  finalValue = num + 63;
  encodeString += (String.fromCharCode(finalValue));
  return encodeString;
}

function encodeSignedNumber(num) {
  var sgn_num = num << 1;
  if (num < 0) {
    sgn_num = ~(sgn_num);
  }
  return(encodeNumber(sgn_num));
}

function buildUrl(path, args) {
  if (config('google-client-id') && config('google-private-key')) {
    args.client = config('google-client-id');
    path = path + "?" + qs.stringify(args);

    // Create signer object passing in the key, telling it the key is in base64 format
    var signer = crypto.createHmac('sha1', config('google-private-key'));

    // Get the signature, telling it to return the sig in base64 format
    var signature = signer.update(path).digest('base64');
    signature = signature.replace(/\+/g,'-').replace(/\//g,'_');
    path += "&signature=" + signature;
    return path;
  } else {
    return path + "?" + qs.stringify(args);
  }
}

// Makes the request to Google Maps API.
// If secure is true, uses https. Otherwise http is used.
var makeRequest = function(path, args, secure, cb, encoding) {
  var maxlen = 2048;

  var path = buildUrl(path, args);
  if (path.length > maxlen) {
    throw new Error("Request too long for google to handle (2048 characters).");
  }

  var options = {
    uri: (secure ? 'https' : 'http') + '://maps.googleapis.com' + path
  };

  if (encoding) options.encoding = encoding;
  if (config('proxy')) options.proxy = config('proxy');

  if (typeof cb === 'function') {
    request(options, function (error, res, data) {
      if (error) {
        return cb(error);
      }
      if (res.statusCode === 200) {
        return cb(null, data);
      }
      return cb(new Error("Response status code: " + res.statusCode), data);
    });
  }

  return options.uri;
};

// vim: set expandtab sw=2:
