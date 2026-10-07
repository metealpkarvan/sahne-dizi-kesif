import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import { pool } from './db.js';
import { avatarSchema } from './validation.js';

const baseURL = process.env.BETTER_AUTH_URL;
export const trustedOrigins = [...new Set([baseURL, ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS || '').split(',')]
  .filter(Boolean).map(value => new URL(value.trim()).origin))];

export const auth = betterAuth({
  appName: 'Sahne',
  baseURL,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins,
  emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128 },
  plugins: [username({
    minUsernameLength: 3,
    maxUsernameLength: 30,
    immutableUsername: true,
    usernameValidator: value => /^[a-zA-Z0-9_.]+$/.test(value) && !['admin', 'sahne', 'support', 'api'].includes(value.toLowerCase()),
  })],
  databaseHooks: {
    user: {
      create: {before: async user => {
        if (!user.username || typeof user.name !== 'string' || !user.name.trim() || user.name.length > 100) return false;
        if (user.image && !avatarSchema.safeParse(user.image).success) return false;
        return {data:{...user,name:user.name.trim()}};
      }},
      update: {before: async user => {
        if (user.name !== undefined && (typeof user.name !== 'string' || !user.name.trim() || user.name.length > 100)) return false;
        if (user.image !== undefined && !avatarSchema.safeParse(user.image).success) return false;
        return {data:user};
      }},
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-up/email': { window: 60, max: 10 },
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-in/username': { window: 60, max: 10 },
      '/get-session': false,
    },
  },
});

export const authHandler = request => auth.handler(request);
