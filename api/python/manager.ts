import { spawn, ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CommandRequest {
  command: string;
  args: Record<string, unknown>;
  id: string;
}

interface CommandResponse {
  success: boolean;
  [key: string]: unknown;
  _id?: string;
}

class PythonRunnerManager {
  private process: ChildProcess | null = null;
  private ready = false;
  private signerpy = false;
  private pending = new Map<string, { resolve: (val: CommandResponse) => void; reject: (err: Error) => void }>();
  private buffer = "";

  constructor() {
    this.start();
  }

  private start() {
    const scriptPath = path.join(__dirname, "runner.py");
    this.process = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as CommandResponse;
          if ("ready" in parsed) {
            this.ready = true;
            this.signerpy = (parsed as unknown as Record<string, boolean>).signerpy || false;
            console.log("Python runner ready, SignerPy:", this.signerpy);
            continue;
          }
          const id = parsed._id;
          if (id && this.pending.has(id)) {
            this.pending.get(id)!.resolve(parsed);
            this.pending.delete(id);
          }
        } catch (e) {
          console.error("Failed to parse Python output:", line);
        }
      }
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      console.error("Python stderr:", data.toString());
    });

    this.process.on("exit", (code) => {
      console.log("Python runner exited with code", code);
      this.ready = false;
      // Restart after delay
      setTimeout(() => this.start(), 2000);
    });
  }

  async sendCommand(cmd: CommandRequest, timeoutMs = 60000): Promise<CommandResponse> {
    if (!this.process?.stdin || !this.ready) {
      throw new Error("Python runner not ready");
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(cmd.id);
        reject(new Error("Command timeout"));
      }, timeoutMs);

      this.pending.set(cmd.id, {
        resolve: (val: CommandResponse) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.process!.stdin!.write(JSON.stringify(cmd) + "\n");
    });
  }

  isReady() {
    return this.ready;
  }

  isSignerPyAvailable() {
    return this.signerpy;
  }
}

// Singleton
let manager: PythonRunnerManager | null = null;

export function getRunner(): PythonRunnerManager {
  if (!manager) {
    manager = new PythonRunnerManager();
  }
  return manager;
}

export type { CommandResponse };
