/** Only the SDK bridge handles the sensitive response; the application never boots in this window. */
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge'

void broadcastResponseToMainFrame().catch(() => {
  // The SDK clears malformed response material. Keep the static recovery text;
  // provider details, codes and state must never be printed or echoed into HTML.
  document.documentElement.dataset['microsoftBridge'] = 'failed'
})
