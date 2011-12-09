var util = require('util');

var journey = require('../lib/journey');

//
// Create a Router object with an associated routing table
//
var router = new(journey.Router);

router.map(function () {
    this.root.bind(function (req, res) { // GET '/'
        res.send(200, {}, "Welcome");
    });
    this.get('/version').bind(function (req, res) {
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
        router.handle(request, body, function (result) {
            response.writeHead(result.status, result.headers);
            response.end(result.body);
        });
    });
}).listen(8080);

util.puts('journey listening at http://127.0.0.1:8080');
