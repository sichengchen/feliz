export interface CliCommand {
  command: string;
  subcommand?: string;
  args: string[];
  flags: Record<string, string>;
}

export function parseArgs(argv: string[]): CliCommand {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      return { command: "help", args: [], flags };
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        flags[key] = value;
        i += 2;
        continue;
      }
      flags[key] = "true";
      i++;
      continue;
    }
    positional.push(arg);
    i++;
  }

  if (positional.length === 0) {
    return { command: "help", args: [], flags };
  }

  const command = positional[0]!;
  const subcommand = positional[1];
  const args = positional.slice(2);

  return { command, subcommand, args, flags };
}
