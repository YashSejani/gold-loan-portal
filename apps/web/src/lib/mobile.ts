import { maskMobile } from '@goldloan/shared';

const MASKED_MOBILE = /^\d{4}XXXX\d{2}$/;

/**
 * Every mobile number the web app shows from the API goes through here. The app never unmasks
 * (there is no unmask function anywhere); it only displays what the API returns. If the API ever
 * sent something that is not masked, mask it before display and report the bug (without the number).
 */
export function displayMobile(fromApi: string): string {
  if (MASKED_MOBILE.test(fromApi)) return fromApi;
  console.error('Received an unmasked mobile number from the API; masking it before display.');
  return maskMobile(fromApi);
}
