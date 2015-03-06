
var Hapi = require('hapi');
var Good = require('good');
var fs = require('fs');

//**** Server metrics pm2-> keymetrics
var pmx = require('pmx');
pmx.init();

var probe = pmx.probe();

var counter = probe.counter({
  name : 'starts'
});
var errors = probe.counter({
  name : 'errors'
});
//***** end metrics

var server = new Hapi.Server();
server.connection({ port: 80 });


// auto update of firmware and config files. the node is fetching the json file and compares if new versions exist. if so, it 
// downloads the files and resets the device
// TODO: ssl
server.route({
    method: 'GET',
    path: '/config',
    handler: function (request, reply) {
	var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
	reply (JSON.stringify(config));
    }
});

// node is sending this request to ask server if a vpn connection shall be opened between server and node. server replys ok if yes
//otherwise it replys "no" and node stays on its own. This is used for manual service request and remote access to the router
// TODO: this is a backdoor and must be ssl and authenticated too.
server.route({
    method: 'GET',
    path:'/vpnrequest', 
    handler: function (request, reply) {
	console.log(JSON.stringify(request.query));
       reply('ok='+JSON.stringify(request.query));
    }
});


// serve a read only repository for config files and firmware
// TODO: use ssl and authentication to prevent theft. The trick must be that if someone hacks client he cannot get access to it either.
// possible solution is, if the device is altered the server finds out and can bann the device, so the password is useless for that 
// hacked client.
server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
        directory: {
            path: '/home/data',
            listing: true
        }
    }
});

server.register({
    register: Good,
    options: {
        reporters: [{
            reporter: require('good-console'),
            args:[{ log: '*', response: '*' }]
        }]
    }
}, function (err) {
    if (err) {
		errors.inc();
        throw err; // something bad happened loading the plugin
    }

    server.start(function () {
		counter.inc();
        server.log('info', 'Server running at: ' + server.info.uri);
    });
});
