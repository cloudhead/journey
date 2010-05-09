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
    this.status = 400;
    this.headers = {};
    this.body = { error: msg };
};
var NotFound = function (msg) {
    this.status = 404;
    this.headers = {};
    this.body = { error: msg };
};
var MethodNotAllowed = function (allowed) {
    this.status = 405;
    this.headers = { allow: allowed };
    this.body = { error: "method not allowed." };
};
var NotAcceptable = function (msg) {
    this.status = 406;
    this.headers = {};
    this.body = { error: msg, only: "application/json" };
};

journey.env = 'development';
journey.version = [0, 1, 0];

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

journey.Router = function Router(routes) {
    var map = journey.map(this);
    this.routes = [];

    // Call map() in the context of `this.map`, so `this`
    // can be used instead of the passed argument.
    routes.call(map, map);
};

journey.map = function (context) {
    return {
        get:  function (pattern, opts) { return this.route('GET',    pattern, opts) },
        put:  function (pattern, opts) { return this.route('PUT',    pattern, opts) },
        post: function (pattern, opts) { return this.route('POST',   pattern, opts) },
        del:  function (pattern, opts) { return this.route('DELETE', pattern, opts) },

        route: function (/* variable arguments */) {
            var args = Array.prototype.slice.call(arguments).compact(),
                // Defaults
                pattern     = /.*/,
                method      = journey.Router.prototype.methods,
                constraints = {};

            args.forEach(function (arg) {
                if (typeof(arg) === "object") {
                    constraints = arg;
                } else if (journey.Router.prototype.methods.indexOf(arg) !== -1) {
                    method = arg;
                } else if (typeof(arg) === "string" || arg.exec) {
                    pattern = arg;
                } else {
                    throw new(Error)("cannot understand route.");
                }
            });

            return {
                bind: function (handler, success) {
                    return context.routes.push({
                        patterns: Array.isArray(pattern) ? pattern : [pattern],
                        method:   method,  handler: handler,
                        success:  success, constraints: constraints
                    });
                }
            };
        },
        trail: function (from, to) {
            // Logging
        }
    };
};

journey.Router.prototype = {
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],

    // Called when the HTTP request is 'complete'
    // and ready to be processed.
    route: function (request, body, callback) {
        var promise = new(events.EventEmitter);
        var that = this;

        request.url = url.parse(request.url);

        // Call the router asynchronously, so we can return a promise
        process.nextTick(function () {
            // Dispatch the HTTP request:
            // As the last argument, we send the function to be called when the response is ready
            // to be sent back to the client -- this allows us to keep our entry and exit point
            // in the same spot. `outcome` is an object with a `status`, a `body` and `headers`
            that.dispatch(request, body || "", function (outcome) {
                outcome.headers["Content-Type"] = "application/json";
                outcome.headers["Date"] = new(Date)().toUTCString();
                outcome.headers["Server"] = "journey/" + journey.version.join('.');

                if (typeof(outcome.body) !== 'string') {
                    outcome.body = JSON.stringify(outcome.body);
                }

                outcome.body += '\n';

                if (outcome.status >= 300) {
                    outcome.headers['Content-Length'] = outcome.body.length.toString();
                }

                if (callback) { callback(outcome) }
                else          { promise.emit("success", outcome) }

                promise.emit("log", new(Date)().toUTCString() +
                             " -- " + request.method +  " "   +
                             request.url.href + " - HTTP " + outcome.status);
            });
        });
        return promise;
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
                var path = request.url.pathname, ignoreCase;

                if (! path) { throw new(BadRequest) }

                // Trim trailing slashes and add ^$ markers to strings
                if (typeof(pattern) === "string") {
                    pattern = '^' + pattern.match(/^(\/)$|^\/?(.*?)\/?$/)
                                           .slice(1).join('') + '$';
                } else {
                    ignoreCase = pattern.ignoreCase;
                    pattern = pattern.source.match(/^(\^)?\/?(.*?)\/?(\$)?$/)
                                            .slice(1).join('');
                }

                pattern = new(RegExp)(pattern, ignoreCase ? 'i' : '');

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
    dispatch: function (request, body, respond) {
        var resolved, route, parser, params = request.url.query || {};

        // Journey being a JSON-only server, we expect the 'Accept' header to be set accordingly
        if (["application/json", "*/*"].indexOf(request.headers.accept) === -1) {
            return respond(new(NotAcceptable)(
                "cannot generate " + request.headers.accept + " response")
            );
        }

        try {
            resolved = this.resolve(request, body);
        } catch (e) {
            if (e.status) { // If it's an HTTP Error
                return respond({
                    headers: e.headers || {},
                    status: e.status,
                    body: JSON.stringify(e.body)
                });
            } else {
                throw e;
            }
        }

        route = this.draw(request, respond);

        if (resolved) {
            if (body) {
                parser = request.headers["Content-Type"] === "application/json" ? JSON.parse
                                                                                : querystring.parse;
                try {
                    Object.mixin(params, parser(body));
                } catch (e) {
                    return respond(new(BadRequest)("malformed data"));
                }
            }
            return route.go(resolved, params);
        } else {
            return respond(new(NotFound)("request not found"));
        }
    },

    // A constructor of sorts, which returns a 'Routing context', in which the response
    // status is evaluated.
    draw: function (req, respond) {
        return {
            request: req,
            respond: respond,
            baseResponse: {
                status: 200,
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
                            return Object.mixin({}, baseResponse, { status: response });
                        case "array":
                            switch (response.length) {
                                case 3: return {
                                    status:  response[0],
                                    headers: response[1],
                                    body:    response[2]
                                };
                                case 2: return Object.mixin({}, baseResponse, {
                                    status: response[0],
                                    body:   response[1]
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
                    this.responder({
                        body: JSON.stringify({ error: err.message || err }),
                        status: err.status || 500
                    });
                }
            }
        }
    }
};

