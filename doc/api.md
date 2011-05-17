---
title: Amon API
brand: api.no.de
version: 1.0.0
---

# Amon API

Amon is a monitoring and alarming system for Smart DataCenter 6 (SDC6).
It has three components: a central master, a tree of relays and agents.
Monitors, checks and notifications are configured on the master. This
configuration is pulled to the agents via the relays. Agents run
configured checks and raise events (typically alarms) up to the master
(again via the relays), resulting in notifications to customers and
operators.

Mostly it is the Amon Master API that is relevant, but this document also
describes the (internal) Relay API and Agent API.

Below, "NYI" means not yet implemented.


# Master API: Alarms

An alarm is a occurence of a monitor having identified a problem situation.
These APIs provide info on recent alarms for this customer. Closed alarms are
only guaranteed to be persisted for a week. I.e. this is mainly about showing
open (i.e. unresolved) alarm situations.

    GET /:customer/alarms                           # NYI
    GET /:customer/alarms/:id                       # NYI
    PUT /:customer/alarms/:id -d closed=true        # NYI




# Master API: Monitors

A monitor is a list of checks to run (e.g. check for N occurrences of "ERROR"
in "/var/foo/bar.log" in a minute) and a list of contacts to notify when
any of the checks fail (i.e. an alarm).

    GET    /:customer/monitors                      # NYI
    POST   /:customer/monitors                      # NYI
    PUT    /:customer/monitors/:name                # NYI
    GET    /:customer/monitors/:name                # NYI
    DELETE /:customer/monitors/:name                # NYI


# Master API: Checks

A monitor has one or more checks. A "check" is a single thing to test
periodically.

    GET    /:customer/monitors/:name/checks         # NYI
    POST   /:customer/monitors/:name/checks         # NYI
    PUT    /:customer/monitors/:name/checks/:name   # NYI
    GET    /:customer/monitors/:name/checks/:name   # NYI
    DELETE /:customer/monitors/:name/checks/:name   # NYI

# Master API: Contacts

    GET    /:customer/contacts                      # NYI
    PUT    /:customer/contacts/:name                # NYI
    GET    /:customer/contacts/:name                # NYI
    DELETE /:customer/contacts/:name                # NYI

A "contact" contains the information required (who and what method) to send a
notification to some endpoint.

Note: "Contacts" isn't exactly right either. A single contact can have
multiple ways to be contacted. Eventually, with re-factored
user/group/contact handling in CAPI, we might want this API of sending to a
contact and have the contact itself decide the method (e.g. email or SMS).

TODO(trent): where did my "AlarmAction" go?


# Master API: Internal

    POST /events

Called by relays (ultimately from agents calling the equivalent event
API endpoint on their relay) on alarm events. Eventually other types of
events (e.g. a heartbeat, automatically closing an alarm) may be added.

    HEAD /config
    GET /config

Called by relays (ultimately from agents) to get all relevant checks to
run.

TODO(trent): Change to a name other than "config" (overloaded). "/checkball"?


# Master API: Admin

    GET /checks                                     # NYI
    
TODO(trent): Add whatever here is helpful for admin/dev.


# Relay API
 
TODO

# Agent API

TODO


# Tracing a Monitor

TODO

# Tracing an Alarm

TODO