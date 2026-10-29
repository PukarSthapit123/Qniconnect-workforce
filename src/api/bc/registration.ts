/* Registration's submit (REG.R16 to R28): one POST, signed out. Success is
   any OK answer; a refusal or a failure becomes the one message the page
   shows, worked out as QniConnect worked it out (src/domain/registration.ts). */
import { portalRegistrationSubmit } from '@/contract/bc/registration';
import { messageOfThrown, registrationErrorMessage, registrationPayload, type RegistrationForm } from '@/domain/registration';
import { logger } from '@/lib/logger';
import { bcApi, BcError } from './client';

export type RegistrationResult = { ok: true } | { ok: false; message: string };

export async function submitRegistration(form: RegistrationForm): Promise<RegistrationResult> {
  try {
    const result = await bcApi(portalRegistrationSubmit, { body: registrationPayload(form) });
    logger.log('Registration successful:', result);
    return { ok: true };
  } catch (e) {
    logger.error('Registration error:', e);
    return { ok: false, message: e instanceof BcError ? registrationErrorMessage(e.status, e.text) : messageOfThrown(e) };
  }
}
