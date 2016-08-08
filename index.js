var http, director, cool, bot, router, server, port, login, attempt;

http = require('http');
director = require('director');
cool = require('cool-ascii-faces');
bot = require('./bot.js');
console.log("Test log1");
login = require("facebook-chat-api");
attempt = require("attempt");
//TODO make this file not have side affects??

router = new director.http.Router({
    '/': {
        //post: bot.respond,
        get: ping
    },
    '/group': {
        '/:name': {
            post: bot.receive,
            get: ping
        }
    }
});


server = http.createServer(function (req, res) {
    req.chunks = [];
    req.on('data', function (chunk) {
        req.chunks.push(chunk.toString());
    });

    router.dispatch(req, res, function (err) {
        res.writeHead(err.status, {"Content-Type": "text/plain"});
        res.end(err.message);
    });
});

attempt({
    retries: 4,
    interval: 5000,
    onError: function (err) {
        console.log(err);
    }},
    function(){
    login({email: process.env.FACEBOOK_EMAIL, password: process.env.FACEBOOK_PASSWORD}, this);
},
function callback(err, api) {
    if (err) return console.error(err);

    bot.setapi(api);
    bot.listen();
});


port = Number(process.env.PORT || 5000);
server.listen(port);

function ping(p1) {
    this.res.writeHead(200);
    if (p1){
        console.log("param "+p1+" received");
    }
    this.res.end("Hey, I'm Cool Guy.");
}