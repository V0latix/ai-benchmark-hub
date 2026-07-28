import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_KEY_BYTES = 64;

type Output = {
  write(value: string): unknown;
};

type InteractiveInput = {
  isRaw?: boolean;
  isTTY?: boolean;
  off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  off(event: "error", listener: () => void): unknown;
  off(event: "end" | "close", listener: () => void): unknown;
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  on(event: "error", listener: () => void): unknown;
  on(event: "end" | "close", listener: () => void): unknown;
  pause(): unknown;
  resume(): unknown;
  setRawMode(mode: boolean): unknown;
};

type HasherDependencies = {
  input: InteractiveInput;
  stdout: Output;
  stderr: Output;
};

async function encodeAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEY_BYTES) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function readHiddenPassword(input: InteractiveInput, stderr: Output): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Password input requires an interactive TTY");
  }

  const wasRaw = Boolean(input.isRaw);
  const decoder = new StringDecoder("utf8");

  return new Promise<string>((resolve, reject) => {
    let password = "";
    let cleaned = false;
    let promptStarted = false;
    let rawRestoreNeeded = false;
    let resumeAttempted = false;
    let settled = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      for (const remove of [
        () => input.off("data", onData),
        () => input.off("error", onError),
        () => input.off("end", onEnd),
        () => input.off("close", onClose)
      ]) {
        try {
          remove();
        } catch {
          // Continue restoring the terminal even if a custom stream rejects removal.
        }
      }
      if (resumeAttempted) {
        try {
          input.pause();
        } catch {
          // Raw-mode restoration below is more important than pausing a failed stream.
        }
      }
      if (rawRestoreNeeded) {
        try {
          input.setRawMode(false);
        } catch {
          // The caller still receives a generic failure and the process can terminate.
        }
      }
      if (promptStarted) {
        try {
          stderr.write("\n");
        } catch {
          // Never replace the original result with an output-stream exception.
        }
      }
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const finish = () => {
      if (settled) return;
      if (!password) {
        fail("Admin password must not be empty");
        return;
      }
      settled = true;
      const submittedPassword = password;
      password = "";
      cleanup();
      resolve(submittedPassword);
    };
    const onError = () => fail("Unable to read hidden password");
    const onEnd = () => fail("Password input ended before submission");
    const onClose = () => fail("Password input closed before submission");
    const onData = (chunk: Buffer | string) => {
      try {
        const text = decoder.write(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        for (const character of Array.from(text)) {
          if (character === "\r" || character === "\n") {
            finish();
            return;
          }
          if (character === "\u0003" || character === "\u0004") {
            fail("Password entry canceled");
            return;
          }
          if (character === "\u0008" || character === "\u007f") {
            password = Array.from(password).slice(0, -1).join("");
            continue;
          }
          if ((character.codePointAt(0) ?? 0) >= 0x20) password += character;
        }
      } catch {
        fail("Unable to read hidden password");
      }
    };

    try {
      promptStarted = true;
      stderr.write("Admin password: ");
      input.on("data", onData);
      input.on("error", onError);
      input.on("end", onEnd);
      input.on("close", onClose);
      if (settled) return;

      if (!wasRaw) {
        rawRestoreNeeded = true;
        input.setRawMode(true);
      }
      if (settled) return;

      resumeAttempted = true;
      input.resume();
    } catch {
      fail("Unable to initialize hidden password input");
    }
  });
}

export async function runAdminPasswordHasher(
  dependencies: HasherDependencies = {
    input: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr
  }
): Promise<void> {
  const password = await readHiddenPassword(dependencies.input, dependencies.stderr);
  const encoded = await encodeAdminPassword(password);
  dependencies.stdout.write(`${encoded}\n`);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  runAdminPasswordHasher().catch(() => {
    process.stderr.write("Unable to generate the administrator password hash.\n");
    process.exitCode = 1;
  });
}
