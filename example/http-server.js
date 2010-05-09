var path = require('path');

require.paths.unshift(path.join(__dirname, '..', 'lib'));

var journey = require('journey');

//
// Create a Router object with an associated routing table
//
var router = new(journey.Router)(function (map) {
    map.root.bind(function (res) { res.send("Welcome") }); // GET '/'
    map.get('/version').bind(function (res) {
        res.send(200, {}, { version: journey.version.join('.') });
    });
});

require('http').createServer(function (request, response) {
    var body = "";

    request.addListener('data', function (chunk) { body += chunk });
    request.addListener('end', function () {
        //
        // Dispatch the request to the router
        //
        router.route(request, body, function (result) {
            response.writeHead(result.status, result.headers);
            response.end(result.body);
        });
    });
}).listen(8080);
