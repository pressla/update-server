//var Blipp = require('blipp');
var Hapi = require('hapi');
var Good = require('good');
var fs = require('fs');
var _ = require('lodash');

var activevpn = {
        mac:'',
        vpn:'down'
}
var port = 8080;
if (process.argv.length > 2) {
	port = process.argv[2];
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
server.connection({ port: port });


// auto update of firmware and config files. the node is fetching the json file and compares if new versions exist. if so, it 
// downloads the files and resets the device
// TODO: ssl
server.route({
    method: 'GET',
    path: '/bconfig',
    handler: function (request, reply) {
	var config = JSON.parse(fs.readFileSync('/home/update-server/config.json', 'utf8'));
	reply (JSON.stringify(config));
    }
});

server.route({
    method: 'GET',
    path: '/config',
    handler: function (request, reply) {
		var config = JSON.parse(fs.readFileSync('/home/update-server/config.json', 'utf8'));
		
		var res = {};
		try {res.mac 		= request.query.mac.toUpperCase();} catch(err) {res.mac = '00:00:00:00:00:00';}

		try {altconfig = JSON.parse(fs.readFileSync('/home/update-server/altconfig.json', 'utf8'));}catch(e){altconfig = []}
		var sid = res.mac;
		var pattern = {};
		pattern.sid = sid;
		var key = _.findKey(altconfig, pattern);
		if (key) {
			if (altconfig[key].path) 		config[1].path 	 		= altconfig[key].path;
			if (altconfig[key].pathdesc) 	config[1].pathdesc 	 	= altconfig[key].pathdesc;

			if (altconfig[key].config) 		config[1].config 	 	= altconfig[key].config;
			if (altconfig[key].configdesc) 	config[1].configdesc = altconfig[key].configdesc;
			config[1].sid = altconfig[key].sid;
		}


		reply (JSON.stringify(config));
    }
});

server.route({
    method: 'GET',
    path: '/setconfig',
    handler: function (request, reply) {
		var config
		try {config = JSON.parse(fs.readFileSync('/home/update-server/config.json', 'utf8'));}catch(e){config = []}
		
		var res = {};
		try {res.mac 		= request.query.mac.toUpperCase();} catch(err) {res.mac = '00:00:00:00:00:00';}
		
		if (request.query.config) 	res.config 		= request.query.config;
		if (request.query.path) 	res.path 		= request.query.path; 

		if (request.query.configdesc) res.configdesc	= request.query.configdesc;
		if (request.query.firmdesc) res.firmdesc 	= request.query.firmdesc; 
		if (request.query.name) 	res.name 		= request.query.name; 	
	
		//type = config (configfiles)
		//type = scripts (loader scripts)

		if (res.mac == '00:00:00:00:00:00') { // default config to be set

			if (res.path) config[1].path 			= 'image-carambola/'+res.path;
			if (res.config) config[1].config 		= 'config-carambola/'+res.config;
			if (res.configdesc) config[1].configdesc 	= res.configdesc;
			if (res.name) config[1].name 			= res.name;
			if (res.firmdesc) config[1].firmdesc 		= res.firmdesc;
			if (res.sid) config[1].sid 			= res.mac;
	
			console.log(JSON.stringify(res));
			fs.writeFileSync('/home/update-server/config.json',JSON.stringify(config,null,2));
			reply (JSON.stringify(config[1]));
			
		} else { // special default config to be set
			try {altconfig = JSON.parse(fs.readFileSync('/home/update-server/altconfig.json', 'utf8'));}catch(e){altconfig = []}
			var sid = res.mac;
			var pattern = {};
			pattern.sid = sid;
			var key = _.findKey(altconfig, pattern);
			if (key) {
				entry = altconfig[key];
			}else{
				entry = {};//_.clone(config[1],true);
				altconfig.push(entry);
			}
			entry.sid = sid;
			if (res.config) 		entry.config = 'config-carambola/'+res.config;
			if (res.path)			entry.path = 'image-carambola/'+res.path

			if (res.configdesc)		entry.configdesc = res.configdesc;
			if (res.firmdesc) 		entry.firmdesc = res.firmdesc
			if (res.name)			entry.name = res.name

			//config[1]=entry;
			fs.writeFileSync('/home/update-server/altconfig.json',JSON.stringify(altconfig,null,2));
			entry.result = 'accepted';	
			reply (JSON.stringify(entry));
			return;
		}


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


