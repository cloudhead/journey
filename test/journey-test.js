var sys = require('sys'),
   http = require('http'),
 assert = require('assert'),
   path = require('path'),
    url = require('url');

require.paths.unshift(__dirname, path.join(__dirname, '..'));

var journey = require('lib/journey'),
       vows = require('../../vows/lib/vows');

var resources = {
    "home": {
        index: function (res) {
            res.send("honey I'm home!");
        },
        room: function (res, params) {
            assert.equal(params.candles, "lit");
            assert.equal(params.slippers, "on");
            res.send({ body: params });
        }
    },
    "picnic": {
        fail: function () {
            throw "fail!";
        }
    },
    "kitchen": {},
    "recipies": {}
};

//
// Initialize the router
//
var router = new(journey.Router)(function (map) {
    this.route('GET', 'picnic/fail').bind(resources.picnic.fail);

    map.get('/home/room').bind(resources.home.room);
    map.get('/undefined').bind();

    map.route('GET', /^(\w+)$/).
        bind(function (res, r) { return resources[r].index(res) });
    map.route('GET', /^(\w+)\/([0-9]+)$/).
        bind(function (res, r, k) { return resources[r].get(res, k) });
    map.route('PUT', /^(\w+)\/([0-9]+)$/, { payload: true }).
        bind(function (res, r, k) { return resources[r].update(res, k) });
    map.route('POST', /^(\w+)$/, { payload: true }).
        bind(function (res, r, doc) { return resources[r].create(res, doc) });
    map.route('DELETE', /^(\w+)\/([0-9]+)$/).
        bind(function (res, r, k) { return resources[r].destroy(res, k) });
    map.route('GET', '/').bind(function (res) { return resources.home.index(res) });

    map.put('home/assert', { assert: function (res, body) { return body.length === 9; } }).
        bind(function (res) { res.send(200, {"Content-Type":"text/html"}, "OK"); });
});

var mock = require('mock-request').mock(router);

var get = mock.get,
    del = mock.del,
   post = mock.post,
    put = mock.put;

journey.env = 'test';

vows.tell('Journey', {
    //
    // SUCCESSFUL (2xx)
    //
    "A valid HTTP request": {
        topic: function () { return get('/', { accept: "application/json" }) },

        "returns a 200": function (res) {
            assert.equal(res.status, 200);
        },
        "returns a body": function (res) {
            assert.equal(res.body.journey, "honey I'm home!");
        }
    },

    "A request with uri parameters": {
        topic: function () {
            // URI parameters get parsed into a javascript object, and are passed to the
            // function handler like so:
            return get('/home/room?slippers=on&candles=lit');
        },

        "returns a 200": function (res) {
            assert.equal(res.status, 200);
        },
        "gets parsed into an object": function (res) {
            assert.equal(res.body.slippers, 'on');
            assert.equal(res.body.candles, 'lit');
        }
    },

    // Here, we're sending a POST request; the input is parsed into an object, and passed
    // to the function handler as a parameter.
    // We expect Journey to respond with a 201 'Created', if the request was successful.
    "A POST request": {
        "with a JSON body": {
            topic: function () {
                resources["kitchen"].create = function (res, input) {
                    res.send("cooking-time: " + (input['chicken'].length + input['fries'].length) + 'min');
                };
                return post('/kitchen', null, JSON.stringify(
                    {"chicken":"roasted", "fries":"golden"}
                ));
            },
            "returns a 201": function (res) {
                assert.equal(res.status, 201);
            },
            "gets parsed into an object": function (res) {
                assert.equal(res.body.journey, 'cooking-time: 13min');
            }
        },
        "with a query-string body": {
            topic: function () {
                resources["kitchen"].create = function (res, input) {
                    res.send("cooking-time: "         +
                            (input['chicken'].length  +
                             input['fries'].length)   + 'min');
                };
                return post('/kitchen', {accept: 'application/json'},
                                        "chicken=roasted&fries=golden");
            },
            "returns a 201": function (res) {
                assert.equal(res.status, 201);
            },
            "gets parsed into an object": function (res) {
                assert.equal(res.body.journey, 'cooking-time: 13min');
            }
        }
    },

    //
    // CLIENT ERRORS (4xx)
    //

    // Journey being a JSON only server, asking for text/html returns 'Not Acceptable'
    "A request for text/html": {
        topic: function () {
            return get('/', { accept: "text/html" });
        },
        "returns a 406": function (res) { assert.equal(res.status, 406) }
    },
    // This request doesn't have a matching route, it'll therefore return a 404.
    "A request which doesn't match anything": {
        topic: function () {
            return del('/hello/world');
        },
        "returns a 404": function (res) {
            assert.equal(res.status, 404);
        }
    },
    // This request contains malformed JSON data, the server replies
    // with a 400 'Bad Request'
    "An invalid request": {
        topic: function () {
            return post('/malformed', null, "{bad: json}");
        },
        "returns a 400": function (res) {
            assert.equal(res.status, 400);
        }
    },
    // Trying to access an undefined function will result in a 500,
    // as long as the uri format is valid
    "A route binded to an undefined function": {
        topic: function () {
            return get('/undefined');
        },
        "returns a 500": function (res) {
            assert.equal(res.status, 500);
        }
    },
    // Here, we're trying to use the DELETE method on /
    // Of course, we haven't allowed this, so Journey responds with a
    // 405 'Method not Allowed', and returns the allowed methods
    "A request with an unsupported method": {
        topic: function () {
            return del('/');
        },
        "returns a 405": function (res) {
            assert.equal(res.status, 405);
        },
        "sets the 'allowed' header correctly": function (res) {
            assert.equal(res.headers.allow, 'GET');
        }
    },

    //
    // SERVER ERRORS (5xx)
    //

    // The code in `picnic.fail` throws an exception, so we return a
    // 500 'Internal Server Error'
    "A request to a controller with an error in it": {
        topic: function () {
            return get('/picnic/fail');
        },
        "returns a 500": function (res) {
            assert.equal(res.status, 500);
        }
    },
});


