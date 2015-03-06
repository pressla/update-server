
var rpcClient = require('./lib/client');
var rpcClient2 = require('pm2-axon-rpc');
// Old AXON version (1.0.0)
var axon = require('axon');
var pm2Axon = require('pm2-axon');
var fs = require('fs');

var timeout;

/**
 * For dumping PM2 < 0.10 with old AXON version (1.0.x)
 */
function dump(constants, client, cb) {
  client.call('getMonitorData', {}, function(err, list) {
    clearTimeout(timeout);

    if (err) {
      console.error('Error retrieving process list: ' + err);
      return cb({msg:err});
    }
    var env_arr = [];

    function fin(err) {
      fs.writeFileSync(constants.DUMP_FILE_PATH, JSON.stringify(env_arr));
      return cb(null, {success:true, data : env_arr});
    }

    (function ex(apps) {
      if (!apps[0]) return fin(null);
      delete apps[0].pm2_env.instances;
      delete apps[0].pm2_env.pm_id;
      env_arr.push(apps[0].pm2_env);
      apps.shift();
      return ex(apps);
    })(list);
    return false;
  });
}

function connectViaNewAxon(cst, cb) {
  var req = pm2Axon.socket('req');

  var client = new rpcClient2.Client(req);

  function end(err, data) {
    req.close();
    return cb(err, data);
  }

  console.log('[PM2] Connecting with new Axon protocol');

  client.sock.once('connect', function() {
    console.log('[PM2] New axon protocol detected but without unix socket, dumping');
    dump(cst, client, function(err, data) {
      console.log('[PM2] Dumped');
      return end(err, data);
    });
  });

  client.sock.once('reconnect attempt', function() {
    console.log('[PM2] Current protocol OK');
    return end({
      online : true,
      version : '0.11',
      msg : 'PM2 not reachable (offline)'
    });
  });

  // Connect with socket
  req.connect(6666);
}

function connectViaOldAxon(constants, cb) {
  var req = axon.socket('req');
  var client = new rpcClient(req);

  function end(err, data) {
    req.close();
    return cb(err, data);
  }

  client.sock.once('connect', function() {
    timeout = setTimeout(function() {
      return end({
        online : true,
        version : '0.10',
        msg: 'Recent PM2 protocol (>0.10x) aborting dumping procedure'
      });
    }, 1500);

    dump(constants, client, function(err, data) {
      client.call('killMe', {}, function() {
        setTimeout(function() {
          return end({
            version : '0.9',
            online : false
          }, data);
        }, 100);
      });
      return false;
    });
  });

  client.sock.once('reconnect attempt', function() {
    console.log('[PM2] Not connectable via HTTP');
    return end({
      online : false,
      version : null,
      msg : 'PM2 not reachable (offline)'
    });
  });

  /**
   * Try to connect via Old protocol
   */

  req.connect(6666);
}
exports.fallback = function fallback(constants, cb) {

  console.log('[PM2] Looking for any upgrade procedures.');

  connectViaOldAxon(constants, function(msg) {

    if (msg.online == false && msg.version == '0.9') {
      console.log('[PM2] Old PM2 version < 0.9 has been dumped');
      // Old PM2 has been killed
      return cb(msg);
    }

    if (msg.online == true && msg.version == '0.10') {
      // New PM2, need to dump processes via HTTP port
      connectViaNewAxon(constants, function(err, msg2) {
        return cb(msg2);
      });
    }

    if (msg.version == null && msg.online == false) {
      console.log('[PM2] OK');
      return cb({
        online : true
      });
    }



    return false;
  });

  return false;
};
