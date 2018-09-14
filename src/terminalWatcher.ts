import { OutputWatcher } from './outputWatcher';

export class TerminalWatcher {
	private readonly terminalEscapeSequencesRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
	private carriedLastLineStart = "";

	constructor(
		private readonly watcher: OutputWatcher
	) {
	}

	onData(data: string) {
		data = data.replace(this.terminalEscapeSequencesRegex, "");

		if (data.length == 0)
			return;

		var lines = data.split("\n");

		if (this.carriedLastLineStart.length > 0) {
			lines[0] = (this.carriedLastLineStart + lines[0]).trimRight();
			this.carriedLastLineStart = "";
		}

		// If data doesn't end with '\n', it means we have an incomplete line that we need to carry to the next onData()
		// invocation. If data does end with '\n', string.split() will return an additional empty element at the end,
		// that we need to ignore. So in both cases we just pop the last element and carry it to the next onData() call.
		this.carriedLastLineStart = lines.pop() || "";

		lines.forEach(line => this.watcher.onLine(line.trimRight()));
	}
}
