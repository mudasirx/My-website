import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getRunner } from "./python/manager";
import { randomUUID } from "crypto";

const runner = getRunner();

export const otpRouter = createRouter({
  status: publicQuery.query(async () => {
    const result = await runner.sendCommand(
      { command: "status", args: {}, id: randomUUID() },
      10000
    );
    return result;
  }),

  sendSingle: publicQuery
    .input(z.object({
      phone: z.string().min(1),
      proxy: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await runner.sendCommand(
        { command: "send_single", args: { phone: input.phone, proxy: input.proxy || null }, id: randomUUID() },
        30000
      );
      return result;
    }),

  startBulk: publicQuery
    .input(z.object({
      phones: z.array(z.string()).min(1),
      proxies: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await runner.sendCommand(
        { command: "start_bulk", args: { phones: input.phones, proxies: input.proxies || [] }, id: randomUUID() },
        30000
      );
      return result;
    }),

  taskStatus: publicQuery
    .input(z.object({
      taskId: z.string(),
    }))
    .query(async ({ input }) => {
      const result = await runner.sendCommand(
        { command: "task_status", args: { task_id: input.taskId }, id: randomUUID() },
        10000
      );
      return result;
    }),

  cancelTask: publicQuery
    .input(z.object({
      taskId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const result = await runner.sendCommand(
        { command: "cancel_task", args: { task_id: input.taskId }, id: randomUUID() },
        10000
      );
      return result;
    }),

  allTasks: publicQuery.query(async () => {
    const result = await runner.sendCommand(
      { command: "all_tasks", args: {}, id: randomUUID() },
      10000
    );
    return result;
  }),

  parseNumbers: publicQuery
    .input(z.object({
      text: z.string(),
    }))
    .mutation(async ({ input }) => {
      const result = await runner.sendCommand(
        { command: "parse_numbers", args: { text: input.text }, id: randomUUID() },
        10000
      );
      return result;
    }),

  parseProxies: publicQuery
    .input(z.object({
      text: z.string(),
    }))
    .mutation(async ({ input }) => {
      const result = await runner.sendCommand(
        { command: "parse_proxies", args: { text: input.text }, id: randomUUID() },
        10000
      );
      return result;
    }),
});
