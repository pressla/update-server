//var Blipp = require('blipp');
var Hapi = require('hapi');
var Good = require('good');
var fs = require('fs');

var activevpn = {
        mac:'',
        vpn:'down'
}


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
	var config = JSON.parse(fs.readFileSync('/home/update-server/config.json', 'utf8'));
	reply (JSON.stringify(config));
    }
});

server.route({
    method: 'GET',
    path: '/tconfig',
    handler: function (request, reply) {
		var config = JSON.parse(fs.readFileSync('/home/update-server/config.json', 'utf8'));
		
		var res = {};
		try {res.mac 		= request.query.mac.toUpperCase();} catch(err) {res.mac = '00:00:00:00:00:00';}

		if (res.mac != '00:00:00:00:00:00') { // default config to be set
	
		} else { 
			var sid = 'id_'+res.mac;
			config[1].config 	 = config[1].others[sid].config;
			config[1].configdesc = config[1].others[sid].configdesc;
		}

		reply (JSON.stringify(config));
    }
});

server.route({
    method: 'GET',
    path: '/setconfig',
    handler: function (request, reply) {
		var config = JSON.parse(fs.readFileSync('/home/update-server/config.json', 'utf8'));
		
		var res = {};
		try {res.mac 		= request.query.mac.toUpperCase();} catch(err) {res.mac = '00:00:00:00:00:00';}
		try {res.configdesc	= request.query.configdesc;} catch(err) {res.configdesc = 'generic update';}
		try {res.config 	= request.query.config;} 		catch(err) {res.config="config-carambola/config-9d0889530629335e52abac6cca0af49e-201504030633.tar.gz";}		
	
		if (res.mac == '00:00:00:00:00:00') { // default config to be set
			config[1].config 		= 'config-carambola/'+res.config;
			config[1].configdesc 	= res.configdesc;
			
		} else { // default config to be set
			var sid = 'id_'+res.mac;
			msid = {};
			msid.config 		= res.config;
			msid.configdesc 	= res.configdesc;
			config[1].others = {};
			config[1].others[sid] = msid;
		}

		res.result = 'accepted';	

		console.log(JSON.stringify(res));
		fs.writeFileSync('/home/update-server/config.json',JSON.stringify(config,null,2));
		reply ((config));
    }
});

// node is sending this request to ask server if a vpn connection shall be opened between server and node. server replys ok if yes
//otherwise it replys "no" and node stays on its own. This is used for manual service request and remote access to the router
// TODO: this is a backdoor and must be ssl and authenticated too.
server.route({
    method: 'GET',
    path:'/vpnrequest', 
    handler: function (request, reply) {
	var res = {mac:'2332323', vpn:'down'};
	res.mac = request.query.mac.toUpperCase();
	
	if (res.mac == activevpn.mac) {
		res.mac = activevpn.mac;
		res.vpn = activevpn.vpn;
	}

	console.log(JSON.stringify(res));
        reply(JSON.stringify(res));
    }
});

server.route({
    method: 'GET',
    path:'/vpnconfigure',
    handler: function (request, reply) {
	var res = {mac:'???', vpn:'down', res:'ok'};

	if (request.query.mac) {
		activevpn.mac = request.query.mac.toUpperCase();
		activevpn.vpn = request.query.vpn;
		res.mac = activevpn.mac;
		res.vpn = activevpn.vpn;
	} else {
		res.res = 'bad request';
	}

       console.log(JSON.stringify(res));
       reply(JSON.stringify(res));
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
	    opsInterval:60000,
            reporter: require('good-console'),
            args:[{ log: '*' , error:'*'}]
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


