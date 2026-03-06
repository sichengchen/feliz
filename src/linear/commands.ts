export interface FelizCommand {
  command: string;
  extraText: string;
}

const VALID_COMMANDS = [
  "start",
  "plan",
  "retry",
  "status",
  "approve",
  "cancel",
  "decompose",
];

export function parseCommand(text: string): FelizCommand | null {
  if (!text) return null;

  const match = text.match(/@feliz\s+(\w+)(.*)?/i);
  if (!match) return null;

  const command = match[1]!.toLowerCase();
  if (!VALID_COMMANDS.includes(command)) return null;

  const extraText = (match[2] ?? "").trim();

  return { command, extraText };
}
