var path = require('path');

require.paths.unshift(path.join(__dirname, '..', 'lib'));

var Router = require('journey').Router;

var router = new(Router)(function (map) {
    map.get('/').bind(function (res) { res.send("Welcome") });
});

var sys = require('sys');

require('http').createServer(function (request, response) {
    var body = "";

    request.addListener('data', function (chunk) { body += chunk });

    request.addListener('end', function () {
        router.route(request, body, function (result) {
            response.writeHead(result.status, result.headers);
            response.end(result.body);
        });
    });
}).listen(8080);
