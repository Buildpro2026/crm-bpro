import "server-only";

// Server-side configuration only. Nothing in this file may be imported by a
// client component. The service role key in particular must never reach the
// browser.

function read(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

export const env = {
  get supabaseUrl(): string {
    return read("SUPABASE_URL").replace(/\/$/, "");
  },
  get publishableKey(): string {
    return read("SUPABASE_PUBLISHABLE_KEY");
  },
  get serviceRoleKey(): string {
    return read("SUPABASE_SERVICE_ROLE_KEY");
  },
  get appBaseUrl(): string {
    return read("APP_BASE_URL").replace(/\/$/, "");
  },
};

// Client signing links last this many days unless Lee chooses otherwise.
export const SIGNING_LINK_DEFAULT_DAYS = 14;
