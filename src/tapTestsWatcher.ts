import * as vscode from 'vscode';
import { OutputWatcher } from "./outputWatcher";
import { TestInfo, TestSuiteInfo, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import * as yaml from 'js-yaml';

export class TapTestsWatcher extends OutputWatcher {
	private readonly tapOutputStartRegex: RegExp = /^TAP version (\d+)$/;
	// https://regex101.com/r/Upsqe7/2
	private readonly tapTestStatusRegex = /^(ok|not ok)(?: (\d+))?(?: ([^#]+))?(?: # ([a-zA-Z]+)(?: (.*?))?)? *$/;
	private readonly tapTestDescriptionRegex = /^(?:([^:]*)::)?(.*)/;
	private readonly tapTestCountRegex = /^1\.\.(\d+)$/;
	private readonly tapYamlStartTagRegex = /^\s+---$/;
	private readonly tapYamlEndTagRegex = /^\s+...$/;
	private capturing = false;

	private currentTestCount = 0;
	private expectedTestCount: number | undefined;

	private currentTestIndex = 0;
	private lastTestResult: TestEvent | undefined;

	private yamlBlockBeingCaptured = false;
	private yamlBlockData: string[] = [];
	private yamlBlockIndent = 0;


	constructor(
		private readonly foundTests: TestSuiteInfo,
		private readonly testsEmitter:  vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>,
		private readonly testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
	){
		super();
	}


	onLine(line: string): void {
		if (line.startsWith("TAP version ")) {
			var match = this.tapOutputStartRegex.exec(line);
			if (match && match.length > 0 && match[1] !== undefined) {
				if (parseInt(match[1]) == 13) {
					this.capturing = true;
					this.currentTestIndex = 1;
					this.yamlBlockBeingCaptured = false;
					this.currentTestCount = 0;
					this.expectedTestCount = undefined;
					this.lastTestResult = undefined;

					this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests: ["root"] });
				}
			}
		} else if (this.capturing) {
			if (this.yamlBlockBeingCaptured) {
				var currentIndent = line.search(/\S|$/);
				if (currentIndent < this.yamlBlockIndent || this.tapYamlEndTagRegex.test(line))
					this.completeYamlBlock();
			}

			if (line.startsWith("ok") || line.startsWith("not ok")) {
				this.currentTestCount++;
				this.parseTestResult(line);
			} else if (line.startsWith(" ")) {
				if (this.yamlBlockBeingCaptured) {
					this.yamlBlockData.push(line.slice(this.yamlBlockIndent));
				} else if (!this.yamlBlockBeingCaptured && this.tapYamlStartTagRegex.test(line)) {
					this.yamlBlockBeingCaptured = true;
					this.yamlBlockIndent = line.search(/\S|$/);
					this.yamlBlockData = [];
				}
			} else if (line.startsWith("1..")) {
				var match = this.tapTestCountRegex.exec(line);
				if (match)
					this.expectedTestCount = parseInt(match[1]);
			}

			if (this.expectedTestCount && this.currentTestCount >= this.expectedTestCount) {
				this.completeYamlBlock();
				this.capturing = false;
				this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
			}
		}
	}


	private completeYamlBlock() {
		if (!this.yamlBlockBeingCaptured)
			return;

		var text = this.yamlBlockData.join("\n");
		try {
			var value = yaml.safeLoad(text);
		}
		catch (e) {
		}
		if (this.lastTestResult !== undefined)
			this.updateTestYamlBlockStatus(this.lastTestResult, value);
		this.yamlBlockBeingCaptured = false;
		this.yamlBlockData = [];
	}


	private parseTestResult(line: string) {
		var match = this.tapTestStatusRegex.exec(line);
		if (!match)
			return;

		var state = match[1] == "ok" ? "passed" : "failed";
		var id = parseInt(match[2]) || this.currentTestIndex;
		var description = match[3] || "";
		//var directive = match[4] ? match[4].toLowerCase() : "";
		//var note = match[5] || "";

		this.currentTestIndex = id + 1;

		var test = this.createTestIfDoesntExist(description);
		this.lastTestResult = <TestEvent>{ type: 'test', test: test, state: state };
		this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: test, state: "running"});
		this.testStatesEmitter.fire(this.lastTestResult);
	}


	private createTestIfDoesntExist(description: string): TestInfo {
		var match = this.tapTestDescriptionRegex.exec(description);

		var suiteName = "";
		var testName = description;

		if (match) {
			suiteName = match[1];
			testName = match[2];
		}

		var suite: TestSuiteInfo;

		if (suiteName !== undefined) {
			var found = this.foundTests.children.find(s => s.type === "suite" && s.label == suiteName);
			if (found && found.type === "suite") {
				suite = found;
			} else {
				suite = { type: "suite", id: suiteName, label: suiteName, children: [] };
				this.foundTests.children.push(suite);
			}
		} else {
			suite = this.foundTests;
		}

		var test: TestInfo;
		var found = suite.children.find(s => s.type === "test" && s.id == description);
		if (found && found.type === "test") {
			test = found;
		} else {
			test = { type: "test", id: description, label: testName };
			suite.children.push(test);

			this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });
			this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: this.foundTests });
		}

		return test;
	}


	private updateTestYamlBlockStatus(testEvent: TestEvent, yaml: any): void {
		var test = typeof testEvent.test === "string" ? this.createTestIfDoesntExist(testEvent.test) : testEvent.test;

		test.file = yaml.file;
		test.line = yaml.line - 1;

		if (yaml.failures instanceof Array) {
			yaml.failures.forEach((failure: any) => {
				if (testEvent.decorations === undefined)
					testEvent.decorations = [];

				testEvent.decorations.push({
					line: (failure.line || 0) - 1,
					message: failure.message || ""
				});
			});

			testEvent.test = test.id;

			this.testStatesEmitter.fire(testEvent);
		}
	}
}
