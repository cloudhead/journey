var journey = require('../lib/journey'),
       vows = require('../../vows/lib/vows');

var sys = require('sys'),
   http = require('http'),
 assert = require('assert'),
    url = require('url');

var mock = {
    mockRequest: function (method, path, headers) {
        var uri = url.parse(path || '/', true);

        return {
            listeners: [],
            method: method,
            headers: headers || { accept: "application/json", "Content-Type":'application/json' },
            url: uri,
            setBodyEncoding: function (e) { this.bodyEncoding = e },
            addListener: function (event, callback) {
                this.listeners.push({ event: event, callback: callback });
                if (event == 'body') {
                    var body = this.body;
                    this.body = '';
                    callback(body);
                } else { callback() }
            }
        };
    },
    mockResponse: function () {
        return {
            body: null,
            finished: false,
            status: 200,
            headers: [],
            sendHeader: function (status, headers) {
                this.status = status;
                this.headers = headers;
            },
            end: function (body) {
                this.body = body;
                this.finished = true;
            }
        };
    },

    request: function (method, path, headers, body) {
        return journey.route(this.mockRequest(method, path, headers), body);
    }
}

// Convenience functions to send mock requests
var get  = function (p, h)    { return mock.request('GET',    p, h) }
var del  = function (p, h)    { return mock.request('DELETE', p, h) }
var post = function (p, h, b) { return mock.request('POST',   p, h, b) }
var put  = function (p, h, b) { return mock.request('PUT',    p, h, b) }


var routes = function (map) {
    this.route('GET', 'picnic/fail').to(map.resources["picnic"].fail);
    map.get('home/room').to(map.resources["home"].room);

    map.route('GET', /^(\w+)$/).
        to(function (res, r) { return map.resource(r).index(res) });
    map.route('GET', /^(\w+)\/([0-9]+)$/).
        to(function (res, r, k) { return map.resources[r].get(res, k) });
    map.route('PUT', /^(\w+)\/([0-9]+)$/, { payload: true }).
        to(function (res, r, k) { return map.resources[r].update(res, k) });
    map.route('POST', /^(\w+)$/, { payload: true }).
        to(function (res, r, doc) { return map.resources[r].create(res, doc) });
    map.route('DELETE', /^(\w+)\/([0-9]+)$/).
        to(function (res, r, k) { return map.resources[r].destroy(res, k) });
    map.route('GET', '/').to(function (res) { return map.resources["home"].index(res) });

    map.put('home/assert', { assert: function (res, body) { return body.length === 9; } }).
        to(function (res) { res.send(200, {"Content-Type":"text/html"}, "OK"); });

    //map.resource('people', function (people) {
    //    people.index(function () {}) // people.index
    //    people.show(function () {}) // people.show
    //    people.create(function () {})
    //    people.update(function () {})
    //    people.destroy(function () {})

    //    people.resource('articles', function (articles) {
    //        articles.index(function () {}) // people.index
    //        articles.show(function () {}) // people.show
    //        articles.create(function () {})
    //        articles.update(function () {})
    //        articles.destroy(function () {})
    //    });

    //    people.resource('friends', {
    //        index: function () {}
    //    });
    //});
    //map.resources({
    //    people: {
    //        index:function () {}, // people.index
    //        show:function () {}, // people.show
    //        create:function () {},
    //        update:function () {},
    //        destroy:function () {},

    //        articles: {
    //            index:function () {}, // people.index
    //            show:function () {}, // people.show
    //            create:function () {},
    //            update:function () {},
    //            destroy:function () {}
    //        }
    //    }
    //});

};

journey.resources = {
    "home": {
        index: function (res) {
            res.send([200, {"Content-Type":"text/html"}, "honey I'm home!"]);
        },
        room: function (res, params) {
            assert.equal(params.candles, "lit");
            assert.equal(params.slippers, "on");
            res.send([200, {"Content-Type":"text/html"}, JSON.stringify(params)]);
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

journey.env = 'test';

vows.tell('Journey', {
    //
    // SUCCESSFUL (2xx)
    //
    "A valid HTTP request": {
        setup: function () { return get('/', { accept: "application/json" }) },

        "returns a 200": function (res) {
            assert.equal(res.status, 200);
        },
        "returns a body": function (res) {
            assert.equal(res.body, "honey I'm home!");
        }
    },

    "A request with uri parameters": {
        setup: function () {
            // URI parameters get parsed into a javascript object, and are passed to the
            // function handler like so:
            return get('/home/room?slippers=on&candles=lit');
        },

        "returns a 200": function (res) {
            assert.equal(res.status, 200);
        },
        "gets parsed into an object": function (res) {
            try { var home = JSON.parse(res.body) }
            catch (e) { var home = {} }
            assert.equal(home.slippers, 'on');
            assert.equal(home.candles, 'lit');
        }
    },

    // Here, we're sending a POST request; the input is parsed into an object, and passed
    // to the function handler as a parameter.
    // We expect Journey to respond with a 201 'Created', if the request was successful.
    "A POST request": {
        "with a JSON body": {
            setup: function () {
                journey.resources["kitchen"].create = function (res, input) {
                    res.send(201, "cooking-time: " + (input['chicken'].length + input['fries'].length) + 'min');
                };
                return post('/kitchen', null, JSON.stringify(
                    {"chicken":"roasted", "fries":"golden"}
                ));
            },
            "returns a 201": function (res) {
                assert.equal(res.status, 201);
            },
            "gets parsed into an object": function (res) {
                assert.equal(res.body, 'cooking-time: 13min');
            }
        },
        "with a query-string body": {
            setup: function () {
                journey.resources["kitchen"].create = function (res, input) {
                    res.send(201, "cooking-time: "         +
                                  (input['chicken'].length +
                                  input['fries'].length)   + 'min');
                };
                return post('/kitchen', {accept: 'application/json'},
                                        "chicken=roasted&fries=golden");
            },
            "returns a 201": function (res) {
                assert.equal(res.status, 201);
            },
            "gets parsed into an object": function (res) {
                assert.equal(res.body, 'cooking-time: 13min');
            }
        }
    },

    //
    // Representational State Transfer (REST)
    //
    //journey.resources["recipies"].index = function (params) {
    //    
    //};
    //get('/recipies').addCallback(function (res) {
    //    //var doc = JSON.parse(res.body);

    //    //assert.ok(doc.includes("recipies"));
    //    //assert.ok(doc.recipies.is(Array));
    //});

    //
    // CLIENT ERRORS (4xx)
    //

    // Journey being a JSON only server, asking for text/html returns 'Bad Request'
    "A request for text/html": {
        setup: function () {
            return get('/', { accept: "text/html" });
        },
        "returns a 400": function (res) { assert.equal(res.status, 400) }
    },
    // This request won't match any pattern, because of the '@', 
    // it's therefore considered invalid
    "An invalid request": {
        setup: function () {
            return get('/hello/@');
        },
        "returns a 400": function (res) {
            assert.equal(res.status, 400);
        }
    },
    // Trying to access an unknown resource will result in a 404 'Not Found',
    // as long as the uri format is valid
    "A request for an unknown resource": {
        setup: function () {
            return get('/unknown');    
        },
        "returns a 404": function (res) {
            assert.equal(res.status, 404);
        }
    },
    // Here, we're trying to use the DELETE method on /
    // Of course, we haven't allowed this, so Journey responds with a
    // 405 'Method not Allowed', and returns the allowed methods
    "A request with an unsupported method": {
        setup: function () {
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
        setup: function () {
            return get('/picnic/fail');    
        },
        "returns a 500": function (res) {
            assert.equal(res.status, 500);
        }
    },

    "resources": {
        setup: function () {
            return get('/people/42/articles/76');
        },

        "returns a 200": function (res) {
            assert.equal(res.status, 200);
        },
        "passes the article & person id": function (res) {
            var obj = JSON.parse(res.body);
            assert.equal(obj.person, 42);
            assert.equal(obj.article, 76);
        }

    }
});

journey.router.draw(routes);


