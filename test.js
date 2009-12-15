
var sys = require('sys');
var http = require('http');
var assert = require('assert');
var journey = require('./journey');

var mock = {
    mockRequest: function (method, path, headers) {
        var uri = http.parseUri(path || '/');
        return {
            listeners: [],
            method: method,
            headers: headers || { accept: "application/json" },
            uri: {
                full: uri.source,
                path: uri.path,
                params: uri.params,
                queryString: uri.query,
                fragment: ""
            },
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
            sendBody: function (body) { this.body = body },
            finish: function () { this.finished = true }
        };
    },

    request: function (method, path, headers, body) {
        return journey.server.handler(this.mockRequest(method, path, headers),
                                      this.mockResponse(), body);
    }
}

var get  = function (p, h)    { return mock.request('GET',    p, h) }
var del  = function (p, h)    { return mock.request('DELETE', p, h) }
var post = function (p, h, b) { return mock.request('POST',   p, h, b) }
var put  = function (p, h, b) { return mock.request('PUT',    p, h, b) }

journey.router.draw(function (map) {
    map.route({ method: 'GET', pattern: /^\w+$/ }).
        to({ resource: 0, query: 'index', success: 200 });
    map.route({ method: 'GET', pattern: /^(\w+)\/([a-z0-9]+)$/ }).
        to({ resource: 1, key: 2, query: 'get', success: 200 });
    map.route({ method: 'PUT', pattern: /^(\w+)\/([a-z0-9]+)$/, payload: true }).
        to({ resource: 1, key: 2, query: 'index', success: 200 });
    map.route({ method: 'POST', pattern: /^\w+$/, payload: true }).
        to({ resource: 1, query: 'index', success: 200 });
    map.route({ method: 'DELETE', pattern: /^(\w+)\/([a-z0-9]+)$/ }).
        to({ resource: 1, key: 2, query: 'index', success: 200 });
    map.route({ pattern: /.*/ }).
        to({ resource: 'home', query: 'index' });
    //map.lost({resource: 'home', query: 'index'});
});

journey.resources = {
    "home": {
        index: function () {
            return [200, {"Content-Type":"text/html"}, "hello world"];
        }
    }
};

// A valid HTTP request
assert.ok( get('/').status == 200 );
assert.ok( get('/', { accept: "text/html" }).status == 400 );
assert.equal(404, get('/unknown').status);

// A standard / request
_ = get('/'); 

// Should have a status of 200
assert.equal(_.status, 200)

// A request with the wrong "Accept" header set
get('/', { accept: "text/html" }).status == 402;

// A request to an unknown resource
get('/unknown').status == 404;

journey.end(0, "The End");



