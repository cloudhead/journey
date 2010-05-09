var url = require('url'),
    events = require('events');

var journey = require('lib/journey');

var router = null;

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
    request: function (method, path, headers, body) {
        var promise = new(events.EventEmitter);
        var result = router.route(this.mockRequest(method, path, headers), body);

        result.addListener('success', function (res) {
            try {
                if (res.body) { res.body = JSON.parse(res.body) }
            } catch (e) {
                sys.puts(res.body)
                sys.puts(e);
            }
            promise.emit('success', res);
        });
        return promise;
    }
}

exports.mock = function (instance) {
    router = instance;
    return this;
};
exports.mockRequest = mock.mockRequest;

// Convenience functions to send mock requests
exports.get  = function (p, h)    { return mock.request('GET',    p, h) }
exports.del  = function (p, h)    { return mock.request('DELETE', p, h) }
exports.post = function (p, h, b) { return mock.request('POST',   p, h, b) }
exports.put  = function (p, h, b) { return mock.request('PUT',    p, h, b) }

