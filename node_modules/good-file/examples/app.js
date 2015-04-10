var Http = require('http');
var Os = require('os');

var Hapi = require('hapi');
var Hoek = require('hoek');
var GoodFile = require('../');

var server = new Hapi.Server('127.0.0.1', 0);

var reporter = new GoodFile(Hoek.uniqueFilename(Os.tmpDir()), { request: '*' });

server.start(function() {

    reporter.start(server, function(err) {

        if (err) {
            console.error(err);
            process.exit(1);
        }

        console.info('Server started at ' + server.info.uri);
        console.info('*** Starting triage ***');

        for (var i = 0; i <= 100; ++i) {
            Http.get(server.info.uri);
        }
        console.info('Done');
        console.info('Check %s for file results', reporter._writeStream.path);
    });
});

server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {

        server.emit('report', 'request', {
            event: 'request',
            timestamp: Date.now(),
            path: request.path,
            id: request.id
        });

        reply().code(200);
    }
});
