#!/usr/bin/env node
const io = require("socket.io-client");
const readline = require("readline");

const SERVER_URL = process.env.SHELLGPT_SERVER || process.argv[2] || "http://localhost:3000";
const MODEL = process.env.SHELLGPT_MODEL || "llama3:8b";

const socket = io(SERVER_URL);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let waiting = false;

socket.on("connect", () => {
  console.log(`Connected to ShellGPT server at ${SERVER_URL}`);
  console.log(`Using model: ${MODEL}`);
  console.log('Type "exit" to quit.\n');
  ask();
});

socket.on("connect_error", (err) => {
  console.error(`Connection failed: ${err.message}`);
  process.exit(1);
});

socket.on("response", (data) => {
  process.stdout.write(data.text);
  if (data.done) {
    process.stdout.write("\n\n");
    waiting = false;
    ask();
  }
});

socket.on("error", (err) => {
  console.error("\nError:", err.message);
  waiting = false;
  ask();
});

const ask = () => {
  if (waiting) return;
  rl.question("ShellGPT> ", (prompt) => {
    if (!prompt.trim()) return ask();
    if (prompt.toLowerCase() === "exit") {
      socket.disconnect();
      rl.close();
      return;
    }

    waiting = true;
    socket.emit("chat", { prompt, model: MODEL });
  });
};

rl.on("close", () => {
  console.log("\nGoodbye!");
  process.exit(0);
});
