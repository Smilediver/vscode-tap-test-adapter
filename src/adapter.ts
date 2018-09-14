import * as vscode from 'vscode';
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { TerminalWatcher } from './terminalWatcher';
import { TapTestsWatcher } from './tapTestsWatcher';

export class ExampleAdapter implements TestAdapter {
	private capturers: { [id: number] : TerminalWatcher; } = {};
	private disposables: { dispose(): void }[] = [];
	private foundTests: TestSuiteInfo = { type: 'suite', id: 'root', label: 'UnitTest++', children: [] };

	private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
	private readonly autorunEmitter = new vscode.EventEmitter<void>();


	get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> { return this.testsEmitter.event; }
	get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> { return this.testStatesEmitter.event; }
	get autorun(): vscode.Event<void> | undefined { return this.autorunEmitter.event; }

	constructor(
		public readonly workspace: vscode.WorkspaceFolder,
		private readonly log: Log
	) {

		this.log.info('Initializing example adapter');

		this.disposables.push(this.testsEmitter);
		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.autorunEmitter);

		vscode.tasks.onDidStartTaskProcess((e: vscode.TaskProcessStartEvent) => { this.onDidStartTask(e); });
		vscode.window.onDidOpenTerminal(e => { this.onDidOpenTerminal(e); });
	}


	onDidOpenTerminal(terminal: vscode.Terminal) {
		terminal.processId.then(pid => {
			terminal.onDidWriteData(data => {
				if (this.capturers[pid] === undefined)
					this.capturers[pid] = new TerminalWatcher(new TapTestsWatcher(this.foundTests, this.testsEmitter, this.testStatesEmitter));

				this.capturers[pid].onData(data);
			});
		});
	}


	onDidStartTask(event: vscode.TaskProcessStartEvent) {
		var task = event.execution.task;
		if (task.group === vscode.TaskGroup.Test) {
			this.log.info('Test task started, pid: ' + event.processId);
		}
	}


	async load(): Promise<void> {
		this.foundTests.children = [];
		this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });
		this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: this.foundTests });
	}


	async run(tests: string[]): Promise<void> {
		//throw new Error("Method not implemented.");
	}


	async debug(tests: string[]): Promise<void> {
		//throw new Error("Method not implemented.");
	}


	cancel(): void {
		//throw new Error("Method not implemented.");
	}


	dispose(): void {
		this.cancel();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}
