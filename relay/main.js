/*
 * Copyright 2011 Joyent, Inc.  All rights reserved.
 *
 * Main entry-point for the Amon Relay. There is a tree of amon relay
 * go-betweens the central Amon Master and each Amon agent. Typically
 * there is one amon relay per SDC compute node. An amon relay supports
 * getting probe config data from the master to the appropriate agents
 * and relaying events from agents to the master for handling.
 */

var fs = require('fs');
var net = require('net');

var nopt = require('nopt');
var path = require('path');
var zutil = require('zutil');

var App = require('./lib/app');
var Constants = require('amon-common').Constants;

var restify = require('restify');
var log = restify.log;



//---- Globals and constants

// Config defaults.
var DEFAULT_POLL = 30;
var DEFAULT_DATA_DIR = '/var/run/smartdc/amon-relay';
var DEFAULT_MASTER_URL = 'http://localhost:8080'; // TODO default to COAL ip...
var DEFAULT_SOCKET = '/var/run/.smartdc-amon.sock';
var ZWATCH_SOCKET = '/var/run/.smartdc-amon-zwatch.sock';

var config; // set in `main()`
var appIndex = {};



//---- internal support functions

function listenInGlobalZoneSync() {
  owner = 'joyent'; //XXX can we use null here instead of "joyent", or the admin user?
  appIndex.global = new App({
    zone: 'global',
    socket: config.socket,
    owner: owner,
    dataDir: config.dataDir,
    localMode: true,  // use a local socket, not a zsock
    masterUrl: config.masterUrl,
    poll: config.poll
  });
  log.debug('Starting new amon-relay for %s zone at "%s" (owner=%s).',
    'global', config.socket, owner);
  appIndex.global.listen(function(err) {
    if (!err) {
      log.info('Amon-relay listening in global zone at %s.', config.socket);
    } else {
      log.error('Unable to start amon-relay in global zone: %o', err);
    }
  });
  return appIndex.global;
}


/**
 * Start a relay App listening in the given zone.
 *
 * Side-effect: the `appIndex[zone]` global is updated.
 * TODO: Refactor this. Currently a failure during listening will still add.
 *
 * @param config {Object} The amon-relay config.
 * @param zone {String} The name of the zone in which to listen.
 * @param callback {Function} Optional. If given, will be called without
 *    args when listening or when errored out. No arguments are given.
 */
function listenInZone(zone, callback) {
  zutil.getZoneAttribute(zone, 'owner-uuid', function(error, attr) {
    if (error || !attr) {
      log.warn('No "owner-uuid" attribute found on zone %s. Skipping.', zone);
      if (callback) return callback();
    }
    appIndex[zone] = new App({
      zone: zone,
      socket: config.socket,
      owner: attr.value,
      localMode: false,  // use a zsock, this isn't the current zone
      dataDir: config.dataDir,
      masterUrl: config.masterUrl,
      poll: config.poll
    });
    log.debug('Starting new amon-relay for %s zone at "%s" (owner=%s).',
      zone, config.socket, attr.value);
    appIndex[zone].listen(function(error) {
      if (!error) {
        log.info('amon-relay listening in zone %s at zsock: %s', zone,
          config.socket);
      }
      if (callback) callback();
    });
  });
}


/**
 * The handler for the server listening on the zwatch socket.
 *
 * The other end of this socket in the "amon-zwatch" service. It sends
 * "<zone>:<command>" commands for zones starting and stopping. We watch
 * those to start and stop amon-relays listening in those zones to
 * communicate with agents in those zones.
 */
function zwatchHandler(sock) {
  var msg = '';
  sock.setEncoding('utf8');
  sock.on('data', function(chunk) {
    msg += chunk;
  });
  sock.on('end', function() {
    log.debug('zwatch message received: ' + msg);
    // <zone>:<command>
    // command is one of:
    //  - start
    //  - stop
    var pieces = msg.split(':');
    if (!pieces || pieces.length !== 2) {
      log.error('Bad Message received on zwatch socket: %s', msg);
      return;
    }

    switch (pieces[1]) {
    case 'start':
      log.debug('Starting zone: %s', pieces[0]);
      listenInZone(config, pieces[0]);
      break;

    case 'stop':
      log.info('amon-relay shut down in zone %s', pieces[0]);
      appIndex[pieces[0]].close(function() {
        delete appIndex[pieces[0]];
      });
      break;

    default:
      log.error('Invalid command received on zwatch socket: %s', pieces[1]);
    }
  });
}


function usage(code, msg) {
  if (msg) {
    console.error('ERROR: ' + msg + '\n');
  }
  printHelp();
  process.exit(code);
}


function printHelp() {
  console.log("Usage: node main.js [OPTIONS]");
  console.log("");
  console.log("The Amon relay server.");
  console.log("");
  console.log("Options:");
  console.log("  -h, --help     Print this help info and exit.");
  console.log("  -v, --verbose  Once for DEBUG log output. Twice for TRACE.");
  console.log("");
  console.log("  -m MASTER-URL, --master-url MASTER-URL");
  console.log("       The Amon Master API base url.")
  console.log("  -D DIR, --data-dir DIR");
  console.log("       Path to a directory to use for working data storage.");
  console.log("       This is all cache data, i.e. can be restored. Typically ");
  console.log("       this is somewhere under '/var/run'.");
  console.log("       Default: " + DEFAULT_DATA_DIR);
  console.log("  -p SECONDS, --poll SECONDS");
  console.log("       The frequency to poll the master for agent probes update.");
  console.log("       Default is " + DEFAULT_POLL + " seconds.");
  console.log("  -s PATH, --socket PATH");
  console.log("       The socket path on which to listen. In normal operation this");
  console.log("       is the path inside the target zone at which the zone will");
  console.log("       listen on a 'zsock'. Default: " + DEFAULT_SOCKET);
  console.log("       For development this may be a port *number* to facilitate");
  console.log("       using curl and using off of SmartOS.")
  console.log("  -Z, --all-zones");
  console.log("       Setup socket in all zones. By default we only listen");
  console.log("       in the current zone (presumed to be the global).");
  console.log("       This is incompatible with a port number of '-s'.");
}



//---- mainline

function main() {
  // Parse argv.
  var longOpts = {
    'help': Boolean,
    'verbose': [Boolean, Array],
    'data-dir': String,
    'master-url': String,
    'poll': Number,
    'socket': [Number, String],
    'all-zones': Boolean
  };
  var shortOpts = {
    'h': ['--help'],
    'v': ['--verbose'],
    'D': ['--data-dir'],
    'm': ['--master-url'],
    'p': ['--poll'],
    's': ['--socket'],
    'Z': ['--all-zones']
  };
  var rawOpts = nopt(longOpts, shortOpts, process.argv, 2);
  if (rawOpts.help) {
    usage(0);
  }
  if (rawOpts.verbose) {
    log.level(rawOpts.verbose.length > 1 ? log.Level.Trace : log.Level.Debug);
  }
  
  // Build the config (intentionally global).
  config = {
    dataDir: rawOpts["data-dir"] || DEFAULT_AGENTS_PROBES_DIR,
    masterUrl: rawOpts["master-url"] || DEFAULT_MASTER_URL,
    poll: rawOpts.poll || DEFAULT_POLL,
    socket: rawOpts.socket || DEFAULT_SOCKET,
    allZones: rawOpts["all-zones"] || false
  };
  if (config.allZones && typeof(config.socket) === 'number') {
    usage(1, "cannot use '-Z' and a port number to '-s'");
  }
  log.debug("config: %o", config);

  // Create the ZWatch Daemon.
  if (config.allZones) {
    net.createServer(zwatchHandler).listen(ZWATCH_SOCKET, function() {
      log.info('amon-relay listening to zwatch on %s', ZWATCH_SOCKET);
    });
  }

  // Now create the app(s).
  if (!config.allZones) {
    // Presuming local is the global zone (as it is in current production
    // usage).
    listenInGlobalZoneSync();
  } else {
    zutil.listZones().forEach(function(z) {
      if (z.name === 'global') {
        listenInGlobalZoneSync();
      } else {
        listenInZone(z.name);
      }
    });
  }
}

main();
