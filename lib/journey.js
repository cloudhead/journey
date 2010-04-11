var path = require('path');

require.paths.unshift(path.join(__dirname, 'vendor'),
                      path.join(__dirname, 'journey'));

var sys = require("sys"),
   http = require("http"),
 events = require('events'),
     fs = require("fs"),
    url = require('url');

var querystring = require('querystring');
var proto = require('proto');

var journey = exports;

var BadRequest = function (msg) {
    this.name = "BadRequest";
    this.code = 400;
    this.message = msg;
};
var NotFound = function (msg) {
    this.name = "NotFound";
    this.code = 404;
    this.message = msg;
};
var MethodNotAllowed = function (allowed) {
    this.code = 405;
    this.headers = { allow: allowed };
    this.message = "Method not allowed.";
};

journey.env = 'development';

//
// Logging & Debugging functions
//

journey.logger = {
    info: function (s) {
        if (journey.env === 'development') sys.puts(s);
    },

    err: function (s) {
        if (journey.env === 'development') sys.puts(s.stylize('red'));
    }
};
journey.log = journey.logger.info;
journey.debug = function (s) {
    sys.puts((s || 'false').toString().stylize('magenta'));
};

//
// The Router
//

journey.router = {
    routes: [],

    draw: function (map) {
        this.map.resources = journey.resources;

        // Call map() in the context of `this.map`, so `this`
        // can be used instead of the passed argument.
        return map.call(this.map, this.map);
    },

    methods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],

    map: {
        get:  function (pattern, opts) { return this.route('GET',    pattern, opts) },
        put:  function (pattern, opts) { return this.route('PUT',    pattern, opts) },
        post: function (pattern, opts) { return this.route('POST',   pattern, opts) },
        del:  function (pattern, opts) { return this.route('DELETE', pattern, opts) },

        route: function (/* variable arguments */) {
            var args = Array.prototype.slice.call(arguments).compact(),
                // Defaults
                pattern     = /.*/, 
                method      = journey.router.methods,
                constraints = {};

            args.forEach(function (arg) {
                if (typeof(arg) === "object") {
                    constraints = arg;
                } else if (journey.router.methods.indexOf(arg) !== -1) {
                    method = arg;
                } else if (typeof(arg) === "string" || arg.exec) {
                    pattern = arg;
                } else {
                    throw new(Error)("cannot understand route.");
                }
            });

            return {
                to: function (handler, success) {
                    return journey.router.routes.push({
                        patterns: Array.isArray(pattern) ? pattern : [pattern], 
                        method:   method,  handler: handler, 
                        success:  success, constraints: constraints
                    });
                },

                toResource: function (handler, success) {
                    var to;

                    if (typeof(handler) === "function") {
                        to = handler();
                    } else {
                        
                    }

                    return journey.router.routes.push({
                        pattern: pattern, method: method,
                        handler: handler, constraints: constraints, 
                        success: success
                    })
                }
            };
        },
        trail: function (from, to) {
            // Logging
        },
        resource: function (name) {
            var res;

            if (res = this.resources[name]) {
                return res;
            } else {
                throw new(NotFound)(name + " was not found");
            }
        },
        resources: journey.resources
    },

    constraints: {
        // 
        // Check if the request has a non-empty body
        // 
        payload: function (payload, request, body) {
            return Boolean(body) === payload;
        },

        //
        // Run a function, and check return value
        //
        assert: function (assert, request, body) {
            return Boolean(assert(request, body));
        }
    },

    resolve: function (request, body) {
        var that = this, allowedMethods = [];
        //
        // Return the first matching route
        //
        var found = this.routes.find(function (route) {
            // Match the pattern with the url
            var match = route.patterns.find(function (pattern) {
                var path = request.url.pathname;

                if (! path) { throw new(BadRequest) }
                if (typeof(pattern) === "string") { pattern = new(RegExp)('^' + pattern + '$') }
                return (path.length > 1 ? path.slice(1) : path).match(pattern);
            });

            //
            // Run through the specified constraints, 
            // making sure everything passes.
            //
            var constraints = Object.keys(route.constraints).length === 0 ? true :
                Object.keys(route.constraints).every(function (key) {
                // Check if the constraint has been defined, then run it.
                if (that.constraints.hasOwnProperty(key)) {
                    return that.constraints[key](route.constraints[key], request, body);
                } else {
                    throw new(Error)("constraint '" + key + "' not found.");
                }
            });

            if (match && constraints) {
                if ((Array.isArray(route.method) && route.method.hasOwnProperty(request.method)) ||
                    (route.method === request.method)) {
                    return function (res, params) {
                        return route.handler.apply(this, [res].concat(match.slice(1), params));
                    }; 
                } else {
                    allowedMethods.push(route.method);
                    return false;
                }
            }
            return false;
        });

        if (found) {
            return found;
        } else if (allowedMethods.length) {
            throw new(MethodNotAllowed)(allowedMethods.join(','));
        } else {
            return false;
        }
    },

    // This function glues together the request resolver, with the responder.
    // It creates a new `route` context, in which the response will be generated.
    dispatch: function (request, response, body, respond) {
        var resolved, route, parser, params = request.url.query || {};

        try {
            resolved = this.resolve(request, body);
        } catch (e) {
            if (e.code) return respond({ headers: e.headers || {}, code: e.code, body: e.message });
            else throw e;
        }

        route = this.route(request, response, respond);

        this.map.resources = journey.resources;

        if (resolved) {
            if (body) {
                if (request.headers["Content-Type"] === "application/json") { parser = JSON.parse }
                else { parser = querystring.parse }
                process.mixin(params, parser(body));
            }
            return route.go(resolved, params);
        } else { return respond({ code: 400, body: "request not found" }) }
    },

    // A constructor of sorts, which returns a 'Routing context', in which the response
    // code is evaluated.
    route: function (req, res, respond) {
        return {
            request:   req,
            response:  res,
            resources: journey.resources,
            respond:   respond,
            baseResponse: {
                code: 200,
                body: "",
                headers: {"Content-Type" : "application/json"}
            },

            // A wrapper around `respond()`, it allows us to respond in a variety of
            // ways, such as: `201`, `"Hello World"`, `[201, "Hello", {'Content-Type':'text/html'}]`, etc.
            // All parameters are optional.
            responder: function (response) {
                // If more than one argument was received, treat it as if it was an array.
                if (arguments.length > 1) { response = Array.prototype.slice.apply(arguments) }

                this.respond((function (baseResponse) {
                    switch (Object.typeOf(response)) {
                        case "object": 
                            return Object.mixin({}, baseResponse, response);
                        case "string":
                            return Object.mixin({}, baseResponse, { body: response });
                        case "number":
                            return Object.mixin({}, baseResponse, { code: response });
                        case "array":
                            switch (response.length) {
                                case 3: return {
                                    code:    response[0],
                                    headers: response[1],
                                    body:    response[2]
                                };
                                case 2: return process.mixin({}, baseResponse, {
                                    code: response[0],
                                    body: response[1]
                                });
                                default: throw new(Error)("expected 2 or 3 elements in response");
                            }
                        case "undefined": return baseResponse;
                        default: throw "wrong response type";
                    }
                })(this.baseResponse));
            },

            go: function (destination, params) {
                this.send = this.responder;

                try {
                    destination.call(this, this, params) || {};
                } catch (err) {
                    journey.logger.err(err.stack || err.toString() + "\n");
                    this.responder({ body: err.message || err, code: err.code || 500 });
                }
            }
        }
    }
};

journey.begin = function (resources, port) {
    if (resources && (typeof(resources) === "object")) {
        this.resources = resources;
        return this.server.listen(port || 8080);
    } else {
        throw "couldn't read `resources`";
    }
};

journey.end = function (code, msg) {
    if (msg) { process.stdio.write(msg) }
    this.server.close();
    return process.exit(code || 0);
};

journey.server = {
    instance: null, // The http.createServer instance

    listen: function (port) {
        var that = this;

        this.instance = http.createServer(function (request, response) {
            var body = "";
            request.addListener('body',     function (chunk) { body += chunk });
            request.addListener('complete', that.handler(request, response, body));
        }).listen(port);

        sys.puts("Journey running on 127.0.0.1:" + port);
        return this.instance;
    },

    close: function () { return this.instance ? this.instance.close() : false },

    // Called when the HTTP request is 'complete'
    // and ready to be processed.
    handler: function (request, response, body) {
        var promise = new(events.EventEmitter);
        request.url = url.parse(request.url);

        // Call the router asynchronously, so we can return a promise
        process.nextTick(function () { 
            // Dispatch the HTTP request:
            // As the last argument, we send the function to be called when the response is ready
            // to be sent back to the client -- this allows us to keep our entry and exit point
            // in the same spot. `outcome` is an object with a `code`, a `body` and `headers`
            journey.router.dispatch(request, response, body || "", function (outcome) {
                // Journey being a JSON-only server, we expect the 'Accept' header to be set accordingly
                var code = (request.headers.accept === "application/json") ? outcome.code : 400;

                response.sendHeader(code, outcome.headers || {"Content-Type" : "text/html"});

                if (outcome.code >= 400) {
                    if (journey.env === 'development') {
                        response.sendBody(outcome.body);
                    }
                } else {
                    response.sendBody(outcome.body);
                }

                response.finish();

                journey.log((new(Date)).toGMTString() + " -- " + request.method + " " + request.url.href + " - HTTP " + code);
                return promise.emit("success", response);
            });
        });
        return promise;
    }
};


