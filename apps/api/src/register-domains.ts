/**
 * Domain Registration
 *
 * Imports and registers all domain plugins at application startup.
 * Add new domains here as they are developed.
 *
 * The browser handler uses getDomain() to look up plugins by name —
 * it has zero knowledge of which domains are registered.
 *
 * @module api/register-domains
 */

import { registerDomain } from '@interceptor/browser/handler/domain-loader';
import { plugin as investing } from '@interceptor/domain-investing';
import { plugin as minuteinbox } from '@interceptor/domain-minuteinbox';
import { plugin as robinhood } from '@interceptor/domain-robinhood';
import { plugin as stubhub } from '@interceptor/domain-stubhub';
import { plugin as ticketmaster } from '@interceptor/domain-ticketmaster';

registerDomain(robinhood);
registerDomain(investing);
registerDomain(minuteinbox);
registerDomain(ticketmaster);
registerDomain(stubhub);
