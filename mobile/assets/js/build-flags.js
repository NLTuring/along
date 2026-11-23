// Enabled only in an explicitly staged local-experience test APK.
// Production/web builds must keep this false; never read this flag from storage or URL.
export const LOCAL_EXPERIENCE_ENABLED = false;
// Trusted backend origin is injected only into a staged Android build.
export const API_BASE_URL = '';
