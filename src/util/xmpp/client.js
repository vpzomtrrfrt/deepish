// Mostly copied from @xmpp/client

import createOnAuthenticate from "@xmpp/client/lib/createOnAuthenticate.js";
import getDomain from "@xmpp/client/lib/getDomain.js";
import { Client, jid, xml } from "@xmpp/client-core";
import _bind2 from "@xmpp/client-core/src/bind2/bind2.js";
import _fast from "@xmpp/client-core/src/fast/fast.js";
import _iqCallee from "@xmpp/iq/callee.js";
import _iqCaller from "@xmpp/iq/caller.js";
import _middleware from "@xmpp/middleware";
import _reconnect from "@xmpp/reconnect";
import _resolve from "@xmpp/resolve";
import _resourceBinding from "@xmpp/resource-binding";
import _sasl from "@xmpp/sasl";
import htsha256none from "@xmpp/sasl-ht-sha-256-none";
import _sasl2 from "@xmpp/sasl2";
import _streamFeatures from "@xmpp/stream-features";
import _streamManagement from "@xmpp/stream-management";
import _websocket from "@xmpp/websocket";
import SASLFactory from "saslmechanisms";

function client(options = {}) {
  let { resource, credentials, username, password, userAgent, mechanisms: _mechanisms, ...params } =
    options;

  const { domain, service } = params;
  if (!domain && service) {
    params.domain = getDomain(service);
  }

  const entity = new Client(params);
  if (username && params.domain) {
    entity.jid = jid(username, params.domain);
  }

  const reconnect = _reconnect({ entity });
  const websocket = _websocket({ entity });

  const middleware = _middleware({ entity });
  const streamFeatures = _streamFeatures({ middleware });
  const iqCaller = _iqCaller({ middleware, entity });
  const iqCallee = _iqCallee({ middleware, entity });
  const resolve = _resolve({ entity });

  // SASL mechanisms - order matters and define priority
  const saslFactory = new SASLFactory();
  _mechanisms.forEach((v) => v(saslFactory));

  userAgent ??= xml("user-agent", { id: globalThis.crypto.randomUUID() });

  // Stream features - order matters and define priority
  const sasl2 = _sasl2(
    { streamFeatures, saslFactory },
    createOnAuthenticate(credentials ?? { username, password }, userAgent),
  );

  const fast = _fast({
    sasl2,
    entity,
  });
  sasl2.setup({ fast });

  // SASL2 inline features
  const bind2 = _bind2({ sasl2, entity }, resource);

  // FAST mechanisms - order matters and define priority
  htsha256none(fast.saslFactory);

  // Stream features - order matters and define priority
  const sasl = _sasl(
    { streamFeatures, saslFactory },
    createOnAuthenticate(credentials ?? { username, password }, userAgent),
  );
  const streamManagement = _streamManagement({
    streamFeatures,
    entity,
    middleware,
    bind2,
    sasl2,
  });
  const resourceBinding = _resourceBinding(
    { iqCaller, streamFeatures },
    resource,
  );

  iqCallee?.get("urn:xmpp:ping", "ping", () => {
    return {};
  });

  return Object.assign(entity, {
    entity,
    reconnect,
    websocket,
    middleware,
    streamFeatures,
    iqCaller,
    iqCallee,
    resolve,
    saslFactory,
    sasl2,
    sasl,
    resourceBinding,
    streamManagement,
    bind2,
    fast,
  });
}

export { client, jid, xml };
