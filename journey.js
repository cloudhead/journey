var sys = require("sys"),
    http = require("http"),
    posix = require("posix");

var proto = posix.cat('./proto.js').wait();
process.compile(proto, "proto");

var journey = exports;

journey.env = 'development';

journey.router = {
    routes: [],

    draw: function (map) {
        return map(this.map);
    },

    map: {
        route: function (from) {
            return {
                to: function (to) {
                    return journey.router.routes.push({ from: from, to: to })
                }
            };
        },
        trail: function (from, to) {

        }
    },

    find: function (request) {
        var matchers = {
            // 
            // Match Method
            // 
            method: function (method) {
                return method.is(Array) ? method.include(request.method)
                                        : method == request.method;
            },
            // 
            // Match Pattern
            // 
            pattern: function (pattern) {
                var pattern = pattern.is(Array) ? pattern : [pattern];
                for (var i = 0, match; i < pattern.length; i++) {
                    if (match = request.uri.path.substr(1).match(pattern[i])) { return match }       
                }
                return false;
            },
            // 
            // Match Payload
            // 
            payload: function (payload) {
                if (payload == undefined) return true;
                else                      return Boolean(request.body) === payload;
            }
        };

        return this.routes.find(function (route) {
            var from = route.from,
                  to = route.to, match;

            var match = matchers.all(function (name, fn) {
                if (from.include(name)) {
                    return fn(from[name]);
                } else {
                    return true;
                }
            });

            if (match) {
                var sub = function (obj) { return obj.is(String) ? obj : match[obj] };
                return {
                    request: request,
                    success: 200,
                }.merge({
                    resource: to.resource ? sub(to.resource) : null,
                    query:    to.query    ? sub(to.query)    : null,
                    key:      to.key      ? sub(to.key)      : null 
                }); 
            }
            return false;
        });
    },

    dispatch: function (request, doc, resources, callback) {
        var found = this.find(request);
        var route = Object.create(this.Route(found.request, found.response, resources));

        sys.puts(sys.inspect(route));

        if (found) return callback(route.go(found, doc));
        else       return callback({ code: 400, body: "request not found" });
    },

    Route: function (req, res, resources) {
        return {
            request:   req,
            response:  res,
            resources: resources,

            go: function (destination, doc) {
                if (resources.hasOwnProperty(destination.resource)) {
                    try {
                        var response = resources[destination.resource]
                                                [destination.query]
                                                (destination.key, doc) || {};
                        return { body: response.body || "", code: response.code || 200 };
                    } catch (err) {
                        process.stdio.writeError(err + "\n");
                        return { body: err, code: 500 };
                    }
                } else return { code: 404, body: "resource not found" };
            }
        }
    }
};

journey.begin = function (resources, port) {
    if (typeof resources === 'object') {
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
    instance: null,

    listen: function (port) {
        this.instance = http.createServer(function (request, response) {
            var body = "";
            request.addListener('body',     function (chunk) { body += chunk });
            request.addListener('complete', this.handler(request, response, body));
        }).listen(port);
        sys.puts("Journey running on 127.0.0.1:" + port);
        return this.instance;
    },

    close: function () { return this.instance ? this.instance.close() : false },

    handler: function (request, response, body) {
        return journey.router.dispatch(request, body, journey.resources, function (outcome) {
            sys.puts(sys.inspect(outcome));
            var code = (request.headers.accept == "application/json") ? outcome.code : 400;

            response.sendHeader(code, {"Content-Type" : "text/html"});

            if (outcome.code >= 400) {
                if (journey.ENV == 'development') {
                    response.sendBody(outcome.body);
                }
            } else {
                response.sendBody(outcome.body);
            }

            response.finish();

            sys.puts((new Date).toGMTString() + " -- " + request.method + " " + request.uri.full + " - HTTP " + code);
            return response;
        });
    }
};


