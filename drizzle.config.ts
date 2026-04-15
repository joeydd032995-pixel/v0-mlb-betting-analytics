// drizzle.config.ts
import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load .env.local so Drizzle Kit can see POSTGRES_URL
config({ path: '.env.local' });

export default {
  schema: './lib/db/schema.ts',     // or wherever Claude put your schema
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
} satisfies Config;
