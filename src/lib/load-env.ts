// Scripts and tools outside the Next.js runtime (drizzle-kit, the worker, the
// CLI, the seed script, tests) don't get Next's automatic .env.local loading,
// so this loads both explicitly — .env first, then .env.local to override it,
// matching Next's own precedence.
import { config } from "dotenv";

config();
config({ path: ".env.local", override: true });
