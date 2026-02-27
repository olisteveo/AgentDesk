/**
 * Stripe API — checkout session and customer portal.
 */

import { apiRequest } from './client';

export interface CheckoutSessionResponse {
  checkoutUrl: string;
}

export interface PortalSessionResponse {
  portalUrl: string;
}

export function createCheckoutSession(
  plan: 'pro',
  source: 'onboarding' | 'upgrade'
): Promise<CheckoutSessionResponse> {
  return apiRequest<CheckoutSessionResponse>('/api/stripe/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ plan, source }),
  });
}

export function createPortalSession(): Promise<PortalSessionResponse> {
  return apiRequest<PortalSessionResponse>('/api/stripe/create-portal-session', {
    method: 'POST',
  });
}
