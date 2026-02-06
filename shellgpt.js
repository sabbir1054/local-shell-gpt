#!/usr/bin/env node
const io = require("socket.io-client");
const readline = require("readline");
const chalk = require("chalk");
const { marked } = require("marked");
const { markedTerminal } = require("marked-terminal");

// Configure marked for terminal output
marked.use(
  markedTerminal({
    code: chalk.yellow,
    blockquote: chalk.gray.italic,
    codespan: chalk.yellow,
    strong: chalk.bold,
    em: chalk.italic,
    heading: chalk.bold.cyan,
    listitem: chalk.white,
  }),
);

const SERVER_URL =
  process.env.SHELLGPT_SERVER || process.argv[2] || "http://localhost:3000";
const MODEL = process.env.SHELLGPT_MODEL || "llama3:8b";

const socket = io(SERVER_URL);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let waiting = false;
let currentResponse = "";
let messages = []; // Conversation history

const printHeader = () => {
  console.log(chalk.cyan("\n╔════════════════════════════════════════╗"));
  console.log(
    chalk.cyan("║") +
      chalk.bold.white("          ShellGPT Terminal            ") +
      chalk.cyan("║"),
  );
  console.log(chalk.cyan("╚════════════════════════════════════════╝\n"));
  console.log(chalk.gray(`Server: ${SERVER_URL}`));
  console.log(chalk.gray(`Model:  ${MODEL}`));
  console.log(chalk.gray("\nCommands:"));
  console.log(chalk.gray("  /clear  - Clear conversation history"));
  console.log(chalk.gray("  /help   - Show this help"));
  console.log(chalk.gray("  exit    - Quit the program\n"));
  console.log(chalk.cyan("─".repeat(42)) + "\n");
};

const printResponse = (text) => {
  const width = process.stdout.columns || 80;
  const topBorder = "┌─ Assistant " + "─".repeat(width - 14);
  const bottomBorder = "└" + "─".repeat(width - 2);

  try {
    const formatted = marked(text);
    console.log(chalk.green("\n" + topBorder));
    console.log(formatted.trim());
    console.log(chalk.green(bottomBorder + "\n"));
  } catch (e) {
    console.log(chalk.green("\n" + text + "\n"));
  }
};

socket.on("connect", () => {
  printHeader();
  ask();
});

socket.on("connect_error", (err) => {
  console.error(chalk.red(`Connection failed: ${err.message}`));
  process.exit(1);
});

socket.on("response", (data) => {
  currentResponse += data.text;
  process.stdout.write(chalk.white(data.text));

  if (data.done) {
    // Add assistant response to history
    messages.push({ role: "assistant", content: currentResponse });

    // Clear line and print formatted response
    process.stdout.write("\r\x1b[K");
    process.stdout.moveCursor(
      0,
      -Math.ceil(currentResponse.length / process.stdout.columns || 1),
    );
    process.stdout.clearScreenDown();

    printResponse(currentResponse);
    currentResponse = "";
    waiting = false;
    ask();
  }
});

socket.on("error", (err) => {
  console.error(chalk.red("\nError: " + err.message));
  waiting = false;
  ask();
});

const handleCommand = (input) => {
  const cmd = input.trim().toLowerCase();

  if (cmd === "/clear") {
    messages = [];
    console.log(chalk.yellow("\nConversation history cleared.\n"));
    return true;
  }

  if (cmd === "/help") {
    console.log(chalk.gray("\nCommands:"));
    console.log(chalk.gray("  /clear  - Clear conversation history"));
    console.log(chalk.gray("  /help   - Show this help"));
    console.log(chalk.gray("  exit    - Quit the program\n"));
    return true;
  }

  return false;
};

const ask = () => {
  if (waiting) return;

  rl.question(chalk.blue("You> "), (prompt) => {
    if (!prompt.trim()) return ask();

    if (prompt.toLowerCase() === "exit") {
      socket.disconnect();
      rl.close();
      return;
    }

    if (handleCommand(prompt)) {
      return ask();
    }

    // Add user message to history
    messages.push({ role: "user", content: prompt });

    waiting = true;
    currentResponse = "";

    console.log(chalk.gray("\nThinking..."));

    // Use conversation endpoint with full history
    socket.emit("conversation", {
      messages: messages,
      model: MODEL,
    });
  });
};

rl.on("close", () => {
  console.log(chalk.cyan("\nGoodbye! 👋\n"));
  process.exit(0);
});
