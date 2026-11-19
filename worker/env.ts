export interface Env {
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  ASSETS: Fetcher;
  DB: D1Database;
  PHOTOS: R2Bucket;
}
