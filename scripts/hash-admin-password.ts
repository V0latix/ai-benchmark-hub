import { randomBytes, scrypt as scryptCallback } from "node:crypto";
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
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  on(event: "error", listener: () => void): unknown;
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

  stderr.write("Admin password: ");
  const wasRaw = Boolean(input.isRaw);
  if (!wasRaw) input.setRawMode(true);
  input.resume();

  return new Promise<string>((resolve, reject) => {
    let password = "";

    const cleanup = () => {
      input.off("data", onData);
      input.off("error", onError);
      input.pause();
      if (!wasRaw) input.setRawMode(false);
      stderr.write("\n");
    };
    const finish = () => {
      cleanup();
      if (!password) {
        reject(new Error("Admin password must not be empty"));
        return;
      }
      resolve(password);
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to read hidden password"));
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of Array.from(chunk.toString())) {
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Password entry canceled"));
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          password = Array.from(password).slice(0, -1).join("");
          continue;
        }
        if (character >= " " && character !== "\u007f") password += character;
      }
    };

    input.on("data", onData);
    input.on("error", onError);
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
