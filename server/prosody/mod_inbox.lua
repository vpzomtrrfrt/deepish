-- Derived from mod_map from prosody-modules
-- Implements an API similar but not identical to XEP-0430
-- Currently requires a patch to prosody to include keys in summary results

local xmlns_inbox = "http://deepish.vpzom.click/ns/inbox";

local st = require "util.stanza";
local jid_bare = require "util.jid".bare;
local rsm = require "util.rsm";
local dataform = require "util.dataforms".new;
local datetime = require "util.datetime".datetime;

local archive = module:open_store("archive", "archive");

local query_form = dataform {
	{ name = "with"; type = "jid-single"; };
	{ name = "start"; type = "text-single" };
	{ name = "end"; type = "text-single"; };
};

if not archive.summary then
	module:log("error", "The archive:summary() API is not supported by %s", archive._provided_by);
	return
end

module:hook("iq-get/self/http://deepish.vpzom.click/ns/inbox:inbox", function(event)
	local origin, stanza = event.origin, event.stanza;

	local query = stanza.tags[1];

	-- Search query parameters
	local qwith, qstart, qend;
	local form = query:get_child("x", "jabber:x:data");
	if form then
		local err;
		form, err = query_form:data(form);
		if err then
			origin.send(st.error_reply(stanza, "modify", "bad-request", select(2, next(err))));
			return true;
		end
		qwith, qstart, qend = form["with"], form["start"], form["end"];
		qwith = qwith and jid_bare(qwith); -- dataforms does jidprep
	end

	local qset = rsm.get(query);
	local qmax = qset and qset.max;
	local before, after = qset and qset.before, qset and qset.after;
	if type(before) ~= "string" then before = nil; end

	local summary = archive:summary(origin.username, {
		start = qstart; ["end"] = qend; -- Time range
		with = qwith;
		limit = qmax;
		before = before; after = after;
	});
	if not summary then
		module:send(st.error_reply(stanza, "wait", "internal-server-error"));
		return true;
	end

	for jid, count in pairs(summary.counts) do
		if summary.key and summary.key[jid] and summary.latest and summary.latest[jid] then
			local message = st.message()
				:tag("entry", { xmlns = xmlns_inbox, jid = jid, id = summary.key[jid], stamp = datetime(summary.latest[jid]) })
				:up()

			origin.send(message)
		end
	end

	local reply = st.reply(stanza)
		:tag("fin", { xmlns = xmlns_inbox, complete = "true" })

	module:send(reply);
	return true;
end);
