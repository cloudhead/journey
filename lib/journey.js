var sys    = require("sys"),
    http   = require("http"),
    events = require('events'),
    posix  = require("posix"),
    url    = require('url');

require('../../proto');

var journey = exports;

var BadRequest = function (msg) {
    return {
        name: "BadRequest",
        code: 400,
        message: msg
    };
};

var MethodNotAllowed = function (allowed) {
    return {
        code: 405,            
        headers: { allow: allowed },
        message: "Method not allowed."
    };
};

journey.env = 'development';

//
// Logging & Debugging functions
//

journey.logger = {
    info: function (s) {
        if (journey.env === 'develpoment') sys.puts(s);
    },

    err: function (s) {
        if (journey.env === 'development') process.stdio.writeError(s.stylize('red'));
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
        return map(this.map);
    },

    methods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],

    map: {
        get:  function () { return this.route.apply('GET',    arguments) },
        put:  function () { return this.route.apply('PUT',    arguments) },
        post: function () { return this.route.apply('POST',   arguments) },
        del:  function () { return this.route.apply('DELETE', arguments) },

        route: function (/* variable arguments */) {
            var args = Array.prototype.slice.call(arguments),
                // Defaults
                pattern     = /.*/, 
                method      = journey.router.methods,
                constraints = {};

            args.each(function (arg) {
                if (Object.is(arg)) {
                    constraints = arg;
                } else if (journey.router.methods.includes(arg)) {
                    method = arg;
                } else if (String.is(arg) || RegExp.is(arg)) {
                    pattern = arg;
                } else {
                    throw new(Error)("cannot understand route.");
                }
            });

            return {
                to: function (handler, success) {
                    return journey.router.routes.push({
                        patterns: Array.is(pattern) ? pattern : [pattern], 
                        method:   method,  handler: handler, 
                        success:  success, constraints: constraints
                    });
                },

                toResource: function (handler, success) {
                    var to;

                    if (Function.is(handler)) {
                        to = handler()
                    
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
        resources: journey.resources
    },

    constraints: {
        // 
        // Check if the request has a non-empty body
        // 
        payload: function (payload, request) {
            return Boolean(request.body) === payload;
        }
    },

    resolve: function (request) {
        var that = this, allowedMethods = [];
        //
        // Return the first matching route
        //
        var found = this.routes.find(function (route) {
            // Match the pattern with the url
            var match = route.patterns.find(function (pattern) {
                var path = request.url.pathname;
                if (! path) throw new(BadRequest);
                if (String.is(pattern)) pattern = new(RegExp)('^' + pattern + '$');
                return (path.length > 1 ? path.slice(1) : path).match(pattern);
            });

            //
            // Run through the specified constraints, 
            // making sure everything passes.
            //
            var constraints = route.constraints.length > 0 ? route.constraints.all(function (name, value) {
                // Check if the constraint has been defined, then run it.
                if (that.constraints.includes(name)) {
                    return that.constraints[name](value, request);
                } else {
                    throw new(Error)("constraint '" + name + "' not found.");
                }
            }) : true;

            if (match && constraints) {
                if ((Array.is(route.method) && route.method.includes(request.method)) ||
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
    // It creates a new `Route` context, in which the response will be generated.
    dispatch: function (request, response, body, respond) {
        var resolved, route, params = request.url.query;

        try {
            resolved = this.resolve(request);
        } catch (e) {
            return respond({ headers: e.headers || {}, code: e.code, body: e.message });
        }

        route = new this.Route(request, response, respond);

        this.map.resources = journey.resources;

        if (resolved) {
            if (body) {
                if (request.headers["Content-Type"] === "application/json") {
                    process.mixin(params, JSON.parse(body));
                } else {
                    body.split('&').each(function (pair) {
                        pair = pair.split('=');
                        params[pair[0]] = params[pair[1]];
                    });
                }
            }
            return route.go(resolved, params);
        } else { return respond({ code: 400, body: "request not found" }) }
    },

    // A constructor of sorts, which returns a 'Routing context', in which the response
    // code is evaluated.
    Route: function (req, res, respond) {
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
                    switch (process.typeOf(response)) {
                        case "object": 
                            return process.mixin({}, baseResponse, response);
                        case "string":
                            return process.mixin({}, baseResponse, { body: response });
                        case "number":
                            return process.mixin({}, baseResponse, { code: response });
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
                                default: throw "expected 2 or 3 elements in response";
                            }
                        case "undefined": return baseResponse;
                        default: throw "wrong response type";
                    }
                })(this.baseResponse));
            },

            go: function (destination, params) {
                this.send = this.responder;

                //if (this.resources.includes(destination.resource)) {
                    try {
                        destination.call(this, this, params) || {};
                    } catch (err) {
                        journey.logger.err(err.stack + "\n");
                        this.responder({ body: err, code: 500 });
                    }
                //} else this.responder({ code: 404, body: "resource not found" });
            }
        }
    }
};

journey.begin = function (resources, port) {
    if (resources && Object.is(resources)) {
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
        var promise = new(events.Promise);
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
                return promise.emitSuccess(response);
            });
        });
        return promise;
    }
};


