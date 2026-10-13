// The `feedbakkr` command. bin/feedbakkr.js runs this from dist/cli.js.
import { nodeIo, runCli } from "./run.js";

export async function main(argv: string[]): Promise<number> {
	return runCli(argv, nodeIo());
}
