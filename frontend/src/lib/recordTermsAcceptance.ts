import { api } from './api'
import { versionFor, type TermsKind } from './terms'

/**
 * Records a terms acceptance in the audit log. Non-blocking — a failed audit POST must
 * never lose the user's primary action, so errors are logged and swallowed.
 */
export function recordTermsAcceptance(opts: {
  kind: TermsKind
  signature: string
  email: string
  documentLabel?: string
}): void {
  void api
    .post('terms-acceptance', {
      user_name: opts.signature,
      signature_name: opts.signature,
      email: opts.email,
      terms_version: versionFor(opts.kind),
      document_label: opts.documentLabel || 'Terms of Use & Privacy Notice',
    })
    .catch((err) => console.error('[terms] acceptance record failed', err))
}
