var journey = require('./journey');

journey.begin({});
journey.router.draw(function (map) {

  map.route('GET', '/').to(function (res) {res.json("hello world")});
})
