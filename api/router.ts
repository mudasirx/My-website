import { createRouter, publicQuery } from "./middleware";
import { otpRouter } from "./otp";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  otp: otpRouter,
});

export type AppRouter = typeof appRouter;
