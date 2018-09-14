export abstract class OutputWatcher {
	abstract onLine(line: string): void;
}
