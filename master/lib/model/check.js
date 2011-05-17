/*
 * Copyright 2011 Joyent, Inc.  All rights reserved.
 *
 * Amon Master "Check" model.
 */
var util = require('util');
var uuid = require('node-uuid');

var log = require('restify').log;

var Entity = require('./entity');



function Check(options) {
  if (!options || typeof(options) !== 'object')
    throw new TypeError('options must be an object');

  options._type = 'check';
  Entity.call(this, options);

  this.customer = options.customer;
  this.zone = options.zone;
  this.urn = options.urn;
  this.config = options.config;
}
util.inherits(Check, Entity);


Check.prototype._serialize = function() {
  var self = this;
  return {
    customer: self.customer,
    zone: self.zone,
    urn: self.urn,
    config: self.config
  };
};


Check.prototype._deserialize = function(object) {
  this.customer = object.customer;
  this.zone = object.zone;
  this.urn = object.urn;
  this.config = object.config;
};


Check.prototype._validate = function() {
  if (!this.customer) throw new TypeError('check.customer required');
  if (!this.zone) throw new TypeError('check.zone required');
  if (!this.urn) throw new TypeError('check.urn required');
  if (!this.config) throw new TypeError('check.config required');
};


module.exports = (function() { return Check; })();
