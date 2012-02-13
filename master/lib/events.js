/*
 * Copyright 2011 Joyent, Inc.  All rights reserved.
 *
 * Amon Master controller for '/events' endpoints.
 */

var assert = require('assert');
var ufdsmodel = require('./ufdsmodel');
var restify = require('restify');
var RestCodes = restify.RestCodes;
var Monitor = require('./monitors').Monitor;


//---- globals

var log = restify.log;



//---- internal support routines

/**
 * Run async `fn` on each entry in `list`. Call `cb(error)` when all done.
 * `fn` is expected to have `fn(item, callback) -> callback(error)` signature.
 *
 * From Isaac's rimraf.js.
 */
function asyncForEach(list, fn, cb) {
  if (!list.length) cb()
  var c = list.length
    , errState = null
  list.forEach(function (item, i, list) {
   fn(item, function (er) {
      if (errState) return
      if (er) return cb(errState = er)
      if (-- c === 0) return cb()
    })
  })
}



//---- controllers

/**
 * Process the given events. This accepts either a single event (an object)
 * or an array of events. Each event is treated independently such that
 * one event may have validation errors, but other events in the array will
 * still get processed.
 *
 * TODO: Improve the error story here. Everything is a 500, even for invalid
 *    event fields. That is lame.
 */
function addEvents(req, res, next) {
  var events;
  if (Array.isArray(req.params)) {
    events = req.params;
  } else {
    events = [req.params];
  }
  log.info("addEvents: events=%o", events);

  // Collect errors so first failure doesn't abort the others.
  var errs = [];
  function validateAndProcess(event, cb) {
    //XXX event validation would go here

    req._app.processEvent(event, function (err) {
      if (err) errs.push(err);
      cb();
    });
  }

  asyncForEach(events, validateAndProcess, function (err) {
    if (errs.length > 0) {
      res.sendError(restify.newError({
        httpCode: 500,
        restCode: RestCodes.InternalError,
        message: errs.join(", ")
      }));
    } else {
      res.send(202 /* Accepted */);
    }
    next();
  });
}


module.exports = {
  addEvents: addEvents
};
