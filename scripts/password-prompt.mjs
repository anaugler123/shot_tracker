import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

async function hiddenQuestion(prompt) {
  const output = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: true,
    historySize: 0,
  });
  const controller = new AbortController();
  rl.once("SIGINT", () => controller.abort());
  process.stdout.write(prompt);
  try {
    return await rl.question("", { signal: controller.signal });
  } finally {
    rl.close();
    process.stdout.write("\n");
  }
}

export async function promptForPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      "Open an interactive Railway SSH terminal to set your password. Passwords are entered at hidden prompts, not in command arguments.",
    );
  const password = await hiddenQuestion(
    "New password (12–256 characters; input hidden): ",
  );
  if (password.length < 12 || password.length > 256)
    throw new Error(
      "Use a password of 12–256 characters. No password was changed.",
    );
  const confirmation = await hiddenQuestion(
    "Confirm new password (input hidden): ",
  );
  if (password !== confirmation)
    throw new Error("Passwords do not match. No password was changed.");
  return password;
}
