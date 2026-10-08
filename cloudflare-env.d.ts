declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SAS_URL?: string;
    SAS_APP_ID?: string;
    SAS_APP_KEY?: string;
    SAS_SITE_ACCESS_TOKEN?: string;
  }
}
