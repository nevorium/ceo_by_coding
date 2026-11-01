/**
 * EditorBridge — Connects the Phaser game to the DOM-based Monaco Editor
 * Manages Monaco initialization, script tab rendering, and run/stop controls.
 */
import * as monaco from 'monaco-editor';
import { pixelIcon } from '../rendering/PixelAssets.js';
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'javascript' || label === 'typescript') {
      return new Worker(new URL('../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' });
    }
    return new Worker(new URL('../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' });
  },
};

import { ITEM_METADATA } from '../data/items.js';
import { fillColorCSS } from '../utils/fillColor.js';


export class EditorBridge {
  /**
   * @param {Phaser.Scene} scene - The game scene
   * @param {ScriptManager} scriptManager - Script management system
   * @param {ScriptSandbox} scriptSandbox - Code execution sandbox
   * @param {ConsoleManager} consoleManager - Console output manager
   * @param {import('./DeviceManager.js').default} [deviceManager] - Device manager
   */
  constructor(scene, scriptManager, scriptSandbox, consoleManager, deviceManager) {
    this.scene = scene;
    this.scriptManager = scriptManager;
    this._fallbackScriptSandbox = scriptSandbox;
    this.consoleManager = consoleManager;
    this.deviceManager = deviceManager || null;
    this.editor = null;
    this.isEditorVisible = true;

    this.isPhoneOpen = false;
    this.activePhoneApp = 'home';
    this.isBackpackOpen = false;
    this.isWarehouseOpen = false;

    const panels = scene.panelManager;
    panels.register('journal-panel');
    panels.register('backpack-popup', () => { this.isBackpackOpen = false; });
    panels.register('warehouse-popup', () => { this.isWarehouseOpen = false; });
    panels.register('smartphone-chat', () => { this.isPhoneOpen = false; });
    this._initMonaco();
    this._setupPanelTabs();
    this._setupTabUI();
    this._setupControls();
    this._setupToggle();
    this._setupResizablePanel();
    this._setupSandboxCallbacks();
    this._setupCloudSyncUI();
    this._setupSmartphoneUI();
    this._setupWarehousePopupUI();
    this._updateControlsUI();
    this.updateProductionDashboard();
  }

  get scriptSandbox() {
    return this.deviceManager?.getActiveDevice()?.scriptSandbox || this._fallbackScriptSandbox;
  }

  /** Initialize Monaco Editor in the container */
  _initMonaco() {
    const container = document.getElementById('monaco-container');
    if (!container) return;

    // Define custom theme
    monaco.editor.defineTheme('droneHarvest', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'E94560' },
        { token: 'string', foreground: '00FF88' },
        { token: 'number', foreground: 'FFD700' },
        { token: 'type', foreground: '4FC3F7' },
      ],
      colors: {
        'editor.background': '#101a21',
        'editor.foreground': '#edf0d4',
        'editor.lineHighlightBackground': '#101a21',
        'editor.selectionBackground': '#0f346066',
        'editorCursor.foreground': '#9b794e',
        'editorLineNumber.foreground': '#42535b',
        'editorLineNumber.activeForeground': '#9b794e',
        'editor.selectionHighlightBackground': '#0f346033',
        'editorWidget.background': '#22343c',
        'editorSuggestWidget.background': '#22343c',
        'editorSuggestWidget.selectedBackground': '#22343c',
      },
    });

    // Configure JavaScript compiler options to support ESNext (rest parameters, default parameters, etc.)
    if (monaco.languages?.typescript?.javascriptDefaults) {
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        allowNonTsExtensions: true,
        allowJs: true,
        checkJs: false,
        noLib: false,
        lib: ['esnext', 'dom'],
      });

      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });

      // Provide drone & mem ambient declarations so Monaco provides intellisense and doesn't flag globals
      const droneTypeDefs = `
        interface DroneAPI {
          move(direction: 'up' | 'down' | 'left' | 'right'): Promise<boolean> | boolean;
          till(): void;
          water(): void;
          plant(crop: string): void;
          canCrop(): boolean;
          crop(): boolean;
          getBatteryLevel(): number;
          hasPower(): boolean;
          checkFrontItem(): string;
          checkNode(): string;
          checkGround(): string;
          collect(): void;
          wait(seconds: number): void;
          getDrones(): Array<{ id: string; x: number; y: number; status: string }>;
          getDronePosition(droneId: string): { x: number; y: number } | null;
          transferTo(targetDroneId: string, itemId: string, amount: number): boolean;
          transferToPlayer(): void;
          transferToWarehouse(itemId?: string, amount?: number): void;
          retrieveFromWarehouse(itemId?: string, amount?: number): void;
          depositToMachine(machineId: string, itemId: string, qty?: number): void;
          retrieveFromMachine(machineId: string): void;
          sell(): void;
          setRoutingFilter(direction: 'up' | 'down' | 'left' | 'right', filterType: string): boolean;
          clearRoutingFilter(direction: 'up' | 'down' | 'left' | 'right'): boolean;
          getRoutingFilters(): Record<string, string>;
          inspectTile(x: number, y: number): any;
        }
        declare const drone: DroneAPI;
        declare const mem: {
          get(key: string): any;
          set(key: string, val: any): void;
          has(key: string): boolean;
          delete(key: string): boolean;
          clear(): void;
        };
      `;
      try {
        monaco.languages.typescript.javascriptDefaults.addExtraLib(droneTypeDefs, 'ts:drone-api.d.ts');
      } catch {}
    }

    if (monaco.languages?.typescript?.typescriptDefaults) {
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        allowNonTsExtensions: true,
        allowJs: true,
        checkJs: false,
      });
    }

    // Create editor instance
    this.editor = monaco.editor.create(container, {
      value: this._getActiveCode(),
      language: 'javascript',
      theme: 'droneHarvest',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      minimap: { enabled: false },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
      padding: { top: 8 },
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      overviewRulerBorder: false,
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
    });

    // Register drone API auto-completion
    this._registerDroneCompletions();

    // Save on change (debounced)
    this.editor.onDidChangeModelContent(() => {
      if (this._loadingEditorContent) return;
      clearTimeout(this._saveCodeTimeout);
      const activeScript = this.scriptManager.getActiveScript();
      if (!activeScript) return;
      const { id } = activeScript;
      const code = this.editor.getValue();
      this._saveCodeTimeout = setTimeout(() => this.scriptManager.updateCode(id, code), 500);
    });
    this._onPageHide = () => this._syncMonacoActiveScriptCode();
    window.addEventListener('beforeunload', this._onPageHide);
    window.addEventListener('pagehide', this._onPageHide);
    this.scene.events.once('shutdown', () => {
      this._syncMonacoActiveScriptCode();
      window.removeEventListener('beforeunload', this._onPageHide);
      window.removeEventListener('pagehide', this._onPageHide);
      this.editor.dispose();
    });
  }

  /** Register auto-completion items for drone API */
  _registerDroneCompletions() {
    monaco.languages.registerCompletionItemProvider('javascript', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = [
          // Movement
          {
            label: 'drone.move',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: "drone.move('${1|up,down,left,right|}');",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Move the drone one tile in a direction.',
            range,
          },
          // Basic Actions
          {
            label: 'drone.till',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.till();',
            documentation: 'Till the soil at the drone\'s current position.',
            range,
          },
          {
            label: 'drone.water',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.water();',
            documentation: 'Water the soil at the drone\'s current position.',
            range,
          },
          {
            label: 'drone.plant',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: "drone.plant('${1|wheat,potato,apple_tree,cactus|}');",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Plant a seed at the drone\'s current position.',
            range,
          },
          {
            label: 'drone.crop',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.crop();',
            documentation: 'Cut a non-fruit plant (e.g., wheat, potato) at the drone\'s position.',
            range,
          },
          {
            label: 'drone.harvest',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.harvest();',
            documentation: 'Pick fruit from a fruit-bearing plant at the drone\'s position.',
            range,
          },
          {
            label: 'drone.doFlip',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.doFlip();',
            documentation: 'Make the drone do a cool flip! (Cosmetic)',
            range,
          },
          {
            label: 'drone.say',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: "drone.say('${1:Hello!}');",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Make the drone speak in a bubble. Splits long texts automatically.',
            range,
          },
          // Conditionals
          {
            label: 'drone.canCrop',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.canCrop()',
            documentation: 'Returns true if the non-fruit plant is mature and ready to crop.',
            range,
          },
          {
            label: 'drone.canHarvest',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.canHarvest()',
            documentation: 'Returns true if a fruit-bearing plant has ripe fruit to pick.',
            range,
          },
          {
            label: 'drone.isWatered',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.isWatered()',
            documentation: 'Returns true if the tile at the drone\'s position is watered.',
            range,
          },
          {
            label: 'drone.isTilled',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.isTilled()',
            documentation: 'Returns true if the tile at the drone\'s position is tilled.',
            range,
          },
          {
            label: 'drone.hasPlant',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.hasPlant()',
            documentation: 'Returns true if there is a plant at the drone\'s position.',
            range,
          },
          {
            label: 'drone.getPlantStage',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.getPlantStage()',
            documentation: 'Returns the growth stage (0-3) of the plant at the drone\'s position.',
            range,
          },
          {
            label: 'drone.getPosition',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'drone.getPosition()',
            documentation: 'Returns {x, y} tile coordinates of the drone.',
            range,
          },
          // Common patterns
          {
            label: 'if (drone.canCrop()) { drone.crop(); }',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'if (drone.canCrop()) {\n  drone.crop();\n}',
            documentation: 'Safe harvest pattern: only crop when mature.',
            range,
          },
          {
            label: 'for loop (farming row)',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "for (var i = 0; i < ${1:5}; i++) {\n  drone.move('${2|right,down|}');\n  drone.till();\n  drone.water();\n  drone.plant('${3|wheat,potato|}');\n}",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Plant a row of crops using a for loop.',
            range,
          },
          {
            label: 'function (default parameters)',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "function ${1:plantRow}(crop = '${2:wheat}', times = ${3:3}) {\n  for (var i = 0; i < times; i++) {\n    drone.move('${4|right,down|}');\n    drone.till();\n    drone.water();\n    drone.plant(crop);\n  }\n}",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Define a function using default parameter values.',
            range,
          },
          {
            label: 'function (rest parameters ...args)',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "function ${1:harvestMany}(tag = 'Harvest:', ...crops) {\n  for (var i = 0; i < crops.length; i++) {\n    console.log(tag, crops[i]);\n  }\n}",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Define a function accepting variable arguments via rest parameters (...args).',
            range,
          },
          {
            label: 'arrow function (default & rest params)',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "const ${1:processAll} = (header = 'DRONE', ...items) => {\n  console.log(header, items.join(', '));\n};",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Arrow function supporting default and rest parameters.',
            range,
          },
        ];

        return { suggestions };
      },
    });
  }

  /** Setup script tab UI */
  _setupTabUI() {
    this._renderTabs();
  }

  _renderTabs() {
    const tabContainer = document.getElementById('script-tabs');
    if (!tabContainer) return;

    // Clear existing tabs (except new button)
    const newBtn = document.getElementById('btn-new-script');
    tabContainer.innerHTML = '';

    // Render script tabs
    const scripts = this.scriptManager.getAllScripts();
    const activeId = this.scriptManager.activeScriptId;

    scripts.forEach((script) => {
      const tab = document.createElement('button');
      tab.className = `script-tab ${script.id === activeId ? 'active' : ''}`;
      tab.innerHTML = `<span class="color-dot" style="background:${script.color}"></span>${script.name}`;

      tab.addEventListener('click', () => {
        this._selectScript(script.id);
      });

      tabContainer.appendChild(tab);
    });

    // Re-add new script button
    const newButton = document.createElement('button');
    newButton.id = 'btn-new-script';
    newButton.textContent = '+ New';
    newButton.addEventListener('click', () => {
      if (this.scriptManager.canCreateScript()) {
        this._syncMonacoActiveScriptCode();
        const script = this.scriptManager.createScript();
        if (script) {
          this._selectScript(script.id);
        }
      } else {
        const { current, max } = this.scriptManager.getSlotCount();
        this.consoleManager.addLine(`Cannot create more scripts. (${current}/${max} slots used)`, 'error');
      }
    });
    tabContainer.appendChild(newButton);
  }

  /** Setup run/stop controls */
  _setupControls() {
    const btnRun = document.getElementById('btn-run');
    const btnStop = document.getElementById('btn-stop');

    if (btnRun) {
      btnRun.addEventListener('click', () => {
        const activeScript = this.scriptManager.getActiveScript();
        if (!activeScript) {
          this.consoleManager.addLine('No active script found.', 'warn');
          return;
        }

        const assignedDroneId = activeScript.assignedDroneId;
        if (!assignedDroneId) {
          this.consoleManager.addLine(`✗ Script "${activeScript.name}" is not assigned to any drone. Assign it in the Devices tab.`, 'warn');
          return;
        }

        const drone = this.deviceManager?.getById(assignedDroneId);
        if (!drone) {
          this.consoleManager.addLine(`✗ Assigned drone (${assignedDroneId}) is not found.`, 'error');
          return;
        }

        const sandbox = drone.scriptSandbox;
        if (sandbox.isRunning) {
          sandbox.stop();
          this._updateControlsUI();
          this._renderDevicesTab();
          this.updateProductionDashboard();
          return;
        }

        this._syncMonacoActiveScriptCode();
        const latestScript = this.scriptManager.getScript(activeScript.id);
        const code = latestScript ? latestScript.code : '';
        if (!code.trim()) {
          this.consoleManager.addLine('No code to execute.', 'warn');
          return;
        }

        this.consoleManager.addLine(` Executing "${activeScript.name}" on ${drone.label}...`, 'info');

        // Run Benchmark to calculate simulated offline rates
        const benchmarkResult = sandbox.benchmark(code);
        if (benchmarkResult.success) {
          drone.productionRates = benchmarkResult.rates;
          drone.benchmarkError = null;
          this.consoleManager.addLine(` Script Benchmark: Success! Production rates calculated.`, 'info');
        } else {
          drone.productionRates = null;
          drone.benchmarkError = benchmarkResult.error;
          this.consoleManager.addLine(` Script Benchmark: Has crash or error: ${benchmarkResult.error}`, 'warn');
        }

        drone.setStatus('running');
        sandbox.execute(code);
        this.scene?.tutorialSystem?.onDroneStarted();
        this._updateControlsUI();
        this._renderDevicesTab();
        this.updateProductionDashboard();
      });
    }

    if (btnStop) {
      btnStop.addEventListener('click', () => {
        const activeScript = this.scriptManager.getActiveScript();
        if (activeScript && activeScript.assignedDroneId) {
          const drone = this.deviceManager?.getById(activeScript.assignedDroneId);
          if (drone) {
            drone.scriptSandbox?.stop();
          }
        } else {
          this.scriptSandbox?.stop();
        }
        this._updateControlsUI();
        this._renderDevicesTab();
        this.updateProductionDashboard();
      });
    }

    // Console clear
    const btnClear = document.getElementById('btn-clear-console');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        this.consoleManager.clear();
      });
    }
  }

  openTab(name) {
    document.querySelector('#panel-tabs .panel-tab[data-tab="' + name + '"]')?.click();
  }

  toggleEditor(forceState = !this.isEditorVisible) {
    this._syncMonacoActiveScriptCode();
    this.isEditorVisible = forceState;
    const panel = document.getElementById('editor-panel');
    const resizeHandle = document.getElementById('editor-resize-handle');
    panel.classList.toggle('collapsed', !forceState);
    panel.inert = !forceState;
    resizeHandle?.classList.toggle('is-hidden', !forceState);
    const toggle = document.getElementById('btn-toggle-editor');
    toggle.textContent = forceState ? '[ CODE ]' : '[ < ]';
    toggle.setAttribute('aria-expanded', String(forceState));
    if (!forceState && panel.contains(document.activeElement)) toggle.focus({ preventScroll: true });
    if (forceState) requestAnimationFrame(() => this.editor?.layout());
  }

  /** Make the code sidebar wide enough for Monaco suggestions without hiding the game. */
  _setupResizablePanel() {
    const panel = document.getElementById('editor-panel');
    const handle = document.getElementById('editor-resize-handle');
    if (!panel || !handle) return;

    const storageKey = 'ceoByCode_editorPanelSizes';
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    const defaultSize = () => isMobile()
      ? Math.round(window.innerHeight * 0.4)
      : Math.round(window.innerWidth * 0.25);
    const bounds = () => {
      const protectedGameSpace = isMobile() ? 180 : 320;
      const minimum = isMobile() ? 220 : 320;
      const maximum = Math.max(minimum, (isMobile() ? window.innerHeight : window.innerWidth) - protectedGameSpace);
      return { minimum: Math.min(minimum, maximum), maximum };
    };
    const loadSizes = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    };
    const saveSize = size => {
      try {
        const sizes = loadSizes();
        sizes[isMobile() ? 'mobile' : 'desktop'] = size;
        localStorage.setItem(storageKey, JSON.stringify(sizes));
      } catch {
        // Resizing is still useful when storage is unavailable.
      }
    };

    this._applyEditorPanelSize = (requestedSize, { persist = false } = {}) => {
      const { minimum, maximum } = bounds();
      const size = Math.round(Math.min(maximum, Math.max(minimum, Number(requestedSize) || defaultSize())));
      const mobile = isMobile();

      if (mobile) {
        panel.style.width = '';
        panel.style.height = `${size}px`;
        handle.setAttribute('aria-orientation', 'horizontal');
      } else {
        panel.style.height = '';
        panel.style.width = `${size}px`;
        handle.setAttribute('aria-orientation', 'vertical');
      }

      handle.setAttribute('aria-valuemin', String(minimum));
      handle.setAttribute('aria-valuemax', String(maximum));
      handle.setAttribute('aria-valuenow', String(size));
      if (persist) saveSize(size);
      requestAnimationFrame(() => this.editor?.layout());
      return size;
    };

    const restoreSize = () => {
      const saved = loadSizes()[isMobile() ? 'mobile' : 'desktop'];
      this._applyEditorPanelSize(saved ?? defaultSize());
    };
    const finishResize = event => {
      if (this._resizePointerId === undefined || (event && event.pointerId !== this._resizePointerId)) return;
      const size = Number(handle.getAttribute('aria-valuenow'));
      this._resizePointerId = undefined;
      handle.classList.remove('is-resizing');
      document.body.classList.remove('is-resizing-editor');
      saveSize(size);
    };

    this._onPanelResize = () => restoreSize();
    this._onEditorResizeStart = event => {
      if (event.button !== 0) return;
      this._resizePointerId = event.pointerId;
      handle.setPointerCapture?.(event.pointerId);
      handle.classList.add('is-resizing');
      document.body.classList.add('is-resizing-editor');
      event.preventDefault();
    };
    this._onEditorResizeMove = event => {
      if (event.pointerId !== this._resizePointerId) return;
      const size = isMobile()
        ? window.innerHeight - event.clientY - (handle.offsetHeight / 2)
        : window.innerWidth - event.clientX - (handle.offsetWidth / 2);
      this._applyEditorPanelSize(size);
    };
    this._onEditorResizeKeydown = event => {
      const { minimum, maximum } = bounds();
      const current = Number(handle.getAttribute('aria-valuenow')) || defaultSize();
      const step = event.shiftKey ? 80 : 40;
      let next = current;
      if (event.key === 'Home') next = minimum;
      else if (event.key === 'End') next = maximum;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next += step;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next -= step;
      else return;
      event.preventDefault();
      this._applyEditorPanelSize(next, { persist: true });
    };
    this._onEditorResizeReset = () => this._applyEditorPanelSize(defaultSize(), { persist: true });

    restoreSize();
    handle.addEventListener('pointerdown', this._onEditorResizeStart);
    handle.addEventListener('pointermove', this._onEditorResizeMove);
    handle.addEventListener('pointerup', finishResize);
    handle.addEventListener('pointercancel', finishResize);
    handle.addEventListener('keydown', this._onEditorResizeKeydown);
    handle.addEventListener('dblclick', this._onEditorResizeReset);
    window.addEventListener('resize', this._onPanelResize);
    this.scene.events.once('shutdown', () => {
      handle.removeEventListener('pointerdown', this._onEditorResizeStart);
      handle.removeEventListener('pointermove', this._onEditorResizeMove);
      handle.removeEventListener('pointerup', finishResize);
      handle.removeEventListener('pointercancel', finishResize);
      handle.removeEventListener('keydown', this._onEditorResizeKeydown);
      handle.removeEventListener('dblclick', this._onEditorResizeReset);
      window.removeEventListener('resize', this._onPanelResize);
    });
  }

  _setupToggle() {
    const toggle = document.getElementById('btn-toggle-editor');
    this._onToggle = () => this.toggleEditor();
    toggle.addEventListener('click', this._onToggle);
    const journal = document.getElementById('btn-journal');
    this._onJournal = () => this.scene.panelManager.open('journal-panel', journal);
    journal.addEventListener('click', this._onJournal);
    this._onPanelShortcut = e => {
      if (e.key !== 'Tab' || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || this.scene.isModalOpen) return;
      const active = document.activeElement;
      if (active?.matches('input, textarea, select') || active?.isContentEditable ||
          document.getElementById('monaco-container')?.contains(active)) return;
      e.preventDefault();
      this.toggleEditor();
    };
    document.addEventListener('keydown', this._onPanelShortcut);
    this.scene.events.once('shutdown', () => {
      document.removeEventListener('keydown', this._onPanelShortcut);
      toggle.removeEventListener('click', this._onToggle);
      journal.removeEventListener('click', this._onJournal);
    });
  }

  /** Setup sandbox callbacks */
  _setupSandboxCallbacks() {
    // Set up callbacks for already registered devices
    if (this.deviceManager) {
      this.deviceManager.getAll().forEach(drone => {
        this._setupDroneSandboxCallbacks(drone);
      });

      // Listen for new drone registrations
      this.deviceManager.events.on('device-registered', (data) => {
        const drone = this.deviceManager.getById(data.droneId);
        if (drone) {
          this._setupDroneSandboxCallbacks(drone);
        }
      });

      // Listen for active device changes
      this.deviceManager.events.on('active-device-changed', () => {
        this._updateControlsUI();
      });
    }
  }

  _setupDroneSandboxCallbacks(drone) {
    const sandbox = drone.scriptSandbox;
    if (!sandbox) return;

    sandbox.onLog = (msg) => {
      this.consoleManager.addLine(`[${drone.label || drone.id}] ${msg}`, 'log');
    };

    sandbox.onError = (msg) => {
      this.consoleManager.addLine(`[${drone.label || drone.id}] ${msg}`, 'error');
    };

    sandbox.onComplete = (result) => {
      // Set status
      drone.setStatus(result.success ? 'idle' : 'error');
      drone.productionRates = null;

      // Update console
      if (result.success) {
        this.consoleManager.addLine(`✓ [${drone.label || drone.id}] Script completed. (${result.steps} steps)`, 'info');
      } else {
        this.consoleManager.addLine(`✗ [${drone.label || drone.id}] Script stopped.`, 'error');
      }

      // Update control UI if this completed drone is the active one
      if (this.deviceManager?.activeDeviceId === drone.id) {
        this._updateControlsUI();
      }

      // Re-render devices list to update LEDs and run/stop buttons
      this._renderDevicesTab();
      this.updateProductionDashboard();
    };
  }

  _updateControlsUI() {
    const activeDrone = this.deviceManager?.getActiveDevice();
    const sandbox = activeDrone?.scriptSandbox;
    const btnRun = document.getElementById('btn-run');
    const btnStop = document.getElementById('btn-stop');
    const statusEl = document.getElementById('execution-status');

    if (!btnRun) return;

    if (sandbox && sandbox.isRunning) {
      btnRun.textContent = '■ STOP';
      btnRun.classList.add('running');
      if (btnStop) btnStop.disabled = false;
      if (statusEl) statusEl.textContent = 'Running...';
    } else {
      btnRun.textContent = ' RUN';
      btnRun.classList.remove('running');
      if (btnStop) btnStop.disabled = true;
      if (statusEl) statusEl.textContent = activeDrone ? 'Idle' : 'No Device';
    }
  }

  /** Get the active script code */
  _getActiveCode() {
    const active = this.scriptManager.getActiveScript();
    return active ? active.code : '// Write your drone code here...\n';
  }

  /** Update editor content from external source */
  setEditorContent(code) {
    if (this.editor) {
      clearTimeout(this._saveCodeTimeout);
      this._loadingEditorContent = true;
      try {
        this.editor.setValue(code);
      } finally {
        this._loadingEditorContent = false;
      }
    }
  }

  /** Persist the current buffer before loading another script. */
  _selectScript(id) {
    this._syncMonacoActiveScriptCode();
    this.scriptManager.setActiveScript(id);
    this.scriptManager.saveToLocalStorage();
    this.setEditorContent(this._getActiveCode());
    this._renderTabs();
  }

  /** Setup panel tabs navigation and event bindings */
  _setupPanelTabs() {
    const tabs = document.querySelectorAll('#panel-tabs .panel-tab');
    const tabViews = document.querySelectorAll('#editor-panel > .tab-view');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        this.toggleEditor(true);

        // Toggle active button
        tabs.forEach((t) => t.classList.toggle('active', t === tab));

        // Toggle views
        tabViews.forEach((view) => {
          const isTarget = view.id === `tab-view-${targetTab}`;
          view.style.display = isTarget ? 'flex' : 'none';
        });

        // Trigger Monaco layout update or tab refresh if visible
        if (targetTab === 'editor' && this.editor) {
          requestAnimationFrame(() => this.editor?.layout());
        } else if (targetTab === 'devices') {
          this._renderDevicesTab();
        } else if (targetTab === 'profile') {
          this._renderProfile();
          this._renderBackpack();
        } else if (targetTab === 'guide') {
          this._setupAcademyUI();
        }
      });
    });

    // Initialize individual components
    this._setupProfileUI();
    this._setupBackpackUI();
    this._setupAcademyUI();
    this._setupDevicesUI();

    // Initial render
    this._renderProfile();
    this._renderBackpack();
    this._renderDevicesTab();
  }

  /** Set up profile tab name changes and upgrades listeners */
  _setupProfileUI() {
    const profile = this.scene.profileSystem;
    if (!profile) return;

    // Name rename binding
    const nameInput = document.getElementById('profile-name-input');
    const nameSaveBtn = document.getElementById('btn-profile-save');
    if (nameInput && nameSaveBtn) {
      nameSaveBtn.addEventListener('click', () => {
        const newName = nameInput.value.trim();
        if (newName) {
          profile.rename(newName);
          nameInput.blur();
        }
      });
    }

    // Upgrade buttons binding
    const upgradeBtns = document.querySelectorAll('.btn-upgrade');
    upgradeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-upgrade');
        const res = profile.upgrade(type, this.scene.inventorySystem);
        if (res.success) {
          this.consoleManager.addLine(`System Upgraded: ${res.message}`, 'info');
        } else {
          this.consoleManager.addLine(`Upgrade Failed: ${res.message}`, 'error');
        }
      });
    });

    // Subscribe to profile changes
    profile.events.on('profile-changed', () => {
      this._renderProfile();
    });
    profile.events.on('level-up', (data) => {
      this.consoleManager.addLine(` LEVEL UP! You are now Level ${data.level}!`, 'info');
    });
    profile.events.on('upgrade', () => {
      this._renderProfile();
    });
  }

  /** Render profile details, experience bar, and drone upgrades status */
  _renderProfile() {
    const profile = this.scene.profileSystem;
    if (!profile) return;

    const coins = this.scene.inventorySystem.getCoins();

    // Render pilot name (if user is not focusing it)
    const nameInput = document.getElementById('profile-name-input');
    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = profile.name;
    }

    // Render level and wallet
    const levelEl = document.getElementById('profile-level');
    if (levelEl) {
      levelEl.textContent = `LVL ${profile.level}`;
    }
    const walletEl = document.getElementById('profile-wallet');
    if (walletEl) {
      walletEl.textContent = ` ${coins}`;
    }

    // Render XP
    const xp = profile.xp;
    const needed = profile.getXpNeeded();
    const percent = Math.min(100, Math.max(0, (xp / needed) * 100));

    const xpTextEl = document.getElementById('xp-text');
    if (xpTextEl) {
      xpTextEl.textContent = `${xp} / ${needed}`;
    }
    const xpBarEl = document.getElementById('xp-bar-inner');
    if (xpBarEl) {
      xpBarEl.style.width = `${percent}%`;
    }

    // Render upgrades status
    const types = ['speed', 'action', 'battery'];
    types.forEach((type) => {
      const lvl = profile.getUpgradeLevel(type);
      const dotContainer = document.getElementById(`upgrade-dots-${type}`);
      if (dotContainer) {
        const dots = dotContainer.querySelectorAll('.upgrade-dot');
        dots.forEach((dot, idx) => {
          dot.classList.toggle('active', idx < lvl);
        });
      }

      const cost = profile.getUpgradeCost(type);
      const btn = document.getElementById(`btn-upgrade-${type}`);
      if (btn) {
        if (cost === null) {
          btn.textContent = 'MAX';
          btn.disabled = true;
        } else {
          btn.textContent = `Upgrade: ${cost}g`;
          btn.disabled = coins < cost;
        }
      }
    });

    // Update spec labels
    const speedVal = profile.getUpgradeValue('speed');
    const actionVal = profile.getUpgradeValue('action');
    const batteryVal = profile.getUpgradeValue('battery');

    const specSpeedEl = document.getElementById('spec-speed');
    if (specSpeedEl) {
      specSpeedEl.textContent = `${speedVal}ms`;
    }
    const specActionEl = document.getElementById('spec-action');
    if (specActionEl) {
      specActionEl.textContent = `${actionVal}ms`;
    }
    const specBatteryEl = document.getElementById('spec-battery');
    if (specBatteryEl) {
      specBatteryEl.textContent = `${batteryVal.toLocaleString()} steps`;
    }
  }

  /** Set up inventory backpack listeners and sell actions */
  _setupBackpackUI() {
    document.getElementById('btn-workspace-backpack')?.addEventListener('click', () => this.toggleBackpack());
    const btnClose = document.getElementById('btn-close-backpack');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.toggleBackpack(false));
    }

    // Subscribe to inventory mutations
    this.scene.inventorySystem.events.on('inventory-changed', () => {
      this._renderBackpack();
    });
    this.scene.inventorySystem.events.on('coins-changed', () => {
      this._renderProfile();
      this._renderBackpack();
    });
  }

  toggleBackpack(forceState = null) {
    const bpEl = document.getElementById('backpack-popup');
    if (!bpEl) return;

    if (forceState !== null) {
      this.isBackpackOpen = forceState;
    } else {
      this.isBackpackOpen = !this.isBackpackOpen;
    }

    if (this.isBackpackOpen) {
      this.scene.panelManager.open('backpack-popup');
      this._renderBackpack();
    } else {
      if (this.scene.panelManager.current === 'backpack-popup') this.scene.panelManager.close();
      this._hideHoverTooltip();
    }
  }

  /** Render all backpack slots with visual slot cells and select detail panel card */
  _renderBackpack() {
    const backpackGrid = document.getElementById('backpack-popup-grid');
    if (!backpackGrid) return;

    backpackGrid.innerHTML = '';

    const allItems = this.scene.inventorySystem.getAllItems();
    let hasRenderedAny = false;

    // Filter and sort items to show owned tools/seeds/ores/products
    allItems.forEach(({ id, count }) => {
      if (count <= 0) return;
      hasRenderedAny = true;

      const meta = ITEM_METADATA[id] || { name: id, emoji: '', desc: 'Unknown item.', rarity: 'Common', sector: 'Umum' };
      
      const slotEl = document.createElement('div');
      slotEl.className = 'inventory-slot';
      slotEl.setAttribute('data-id', id);
      slotEl.setAttribute('role', 'button'); slotEl.tabIndex = 0;
      slotEl.setAttribute('aria-label', meta.name + ', ' + count);
      slotEl.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();slotEl.click();} });

      slotEl.innerHTML = `
        ${pixelIcon(id, "inventory-slot-emoji")}
        <div class="inventory-slot-qty">${count}</div>
      `;

      // Hover Tooltip Triggers
      slotEl.addEventListener('mouseenter', (e) => {
        this._showHoverTooltip(id, count, e);
      });
      slotEl.addEventListener('mousemove', (e) => {
        this._moveHoverTooltip(e);
      });
      slotEl.addEventListener('mouseleave', () => {
        this._hideHoverTooltip();
      });

      // Drag and selection support
      slotEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (this.scene.dragManager) {
          this.scene.dragManager.startDrag(e, {
            type: 'item',
            id,
            count,
            source: 'backpack',
            element: slotEl,
            onDragStart: () => {
              slotEl.classList.add('dragging');
              this._hideHoverTooltip();
            },
            onDragEnd: () => {
              slotEl.classList.remove('dragging');
            },
            onClick: () => {
              document.querySelectorAll('#backpack-popup-grid .inventory-slot').forEach(s => s.classList.remove('selected'));
              slotEl.classList.add('selected');
              this._showBackpackItemDetails(id, count, meta);
            }
          });
        }
      });

      slotEl.addEventListener('click', () => {
        document.querySelectorAll('#backpack-popup-grid .inventory-slot').forEach(s => s.classList.remove('selected'));
        slotEl.classList.add('selected');
        this._showBackpackItemDetails(id, count, meta);
      });

      backpackGrid.appendChild(slotEl);
    });

    if (!hasRenderedAny) {
      backpackGrid.innerHTML = '<div style="grid-column: span 6; text-align: center; color: #42535b; font-size: 10px; padding: 20px;">Backpack is empty.</div>';
    }

    // Auto-select first item if details card was open or clear it
    const detailsCard = document.getElementById('backpack-popup-details');
    if (detailsCard) {
      if (hasRenderedAny) {
        const firstSlot = backpackGrid.querySelector('.inventory-slot');
        if (firstSlot) firstSlot.click();
      } else {
        detailsCard.innerHTML = '<div style="color: #4a7c59; font-style: italic; text-align: center; margin-top: 10px;">Pilih item untuk melihat deskripsi</div>';
      }
    }
  }

  /** Set up copying code snippets from Academy API cards */
  _setupAcademyUI() {
    const copyBtns = document.querySelectorAll('.btn-copy');
    copyBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const snippet = btn.getAttribute('data-snippet');
        if (!snippet) return;

        navigator.clipboard.writeText(snippet).then(() => {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.classList.add('copied');

          setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
          }, 1500);
        }).catch((err) => {
          console.error('Failed to copy text: ', err);
        });
      });
    });
  }

  /** Set up Devices tab event listeners and subscriptions */
  _setupDevicesUI() {
    const dm = this.deviceManager;
    if (!dm) return;

    // Re-render whenever any device updates
    dm.events.on('device-registered', (data) => {
      this._renderDevicesTab();
      // Also attach inventory-changed listener to the newly registered drone
      const drone = dm.getById(data.droneId);
      if (drone) {
        drone.events.on('inventory-changed', () => this._renderDevicesTab());
      }
    });
    dm.events.on('device-updated', () => this._renderDevicesTab());
    dm.events.on('active-device-changed', () => this._renderDevicesTab());

    // Attach inventory-changed listeners to all already-registered drones
    dm.getAll().forEach(drone => {
      drone.events.on('inventory-changed', () => this._renderDevicesTab());
    });
  }

  /** Render the Devices tab with all drone cards */
  /** Helper to sync active code from Monaco editor to the active script card */
  _syncMonacoActiveScriptCode() {
    clearTimeout(this._saveCodeTimeout);
    if (this.editor) {
      const activeScript = this.scriptManager.getActiveScript();
      if (activeScript) {
        this.scriptManager.updateCode(activeScript.id, this.editor.getValue());
      }
    }
  }

  /** Setup Cloud Sync UI Auth & backup handlers */
  _setupCloudSyncUI() {
    const cloud = this.scene.cloudSaveSystem;
    const warningEl = document.getElementById('sync-env-warning');
    const loggedOutEl = document.getElementById('sync-logged-out');
    const loggedInEl = document.getElementById('sync-logged-in');

    if (!cloud || !cloud.isConfigured()) {
      if (warningEl) warningEl.style.display = 'block';
      if (loggedOutEl) loggedOutEl.style.display = 'none';
      if (loggedInEl) loggedInEl.style.display = 'none';
      return;
    }

    if (warningEl) warningEl.style.display = 'none';

    const btnLogin = document.getElementById('btn-login');
    const btnSignup = document.getElementById('btn-signup');
    const btnLoginGoogle = document.getElementById('btn-login-google');
    const btnBackup = document.getElementById('btn-cloud-backup');
    const btnRestore = document.getElementById('btn-cloud-restore');
    const btnLogout = document.getElementById('btn-logout');

    const inputIdent = document.getElementById('auth-email-username');
    const inputPass = document.getElementById('auth-password');

    if (btnLogin) {
      btnLogin.addEventListener('click', async () => {
        const ident = inputIdent?.value.trim();
        const pass = inputPass?.value;
        if (!ident || !pass) {
          this.consoleManager.addLine(' Username/Email and Password are required.', 'warn');
          return;
        }
        try {
          this.consoleManager.addLine(' Logging in...', 'info');
          const data = await cloud.signIn(ident, pass);
          this.consoleManager.addLine(`✓ Logged in as ${data.user.email}`, 'info');
        } catch (err) {
          this.consoleManager.addLine(`✗ Login failed: ${err.message}`, 'error');
        }
      });
    }

    if (btnSignup) {
      btnSignup.addEventListener('click', async () => {
        const ident = inputIdent?.value.trim();
        const pass = inputPass?.value;
        if (!ident || !pass) {
          this.consoleManager.addLine(' Username/Email and Password are required.', 'warn');
          return;
        }
        if (pass.length < 6) {
          this.consoleManager.addLine(' Password must be at least 6 characters.', 'warn');
          return;
        }
        try {
          this.consoleManager.addLine(' Registering account...', 'info');
          const data = await cloud.signUp(ident, pass);
          if (data.user?.identities?.length === 0) {
            this.consoleManager.addLine(` Account already exists or email needs verification.`, 'warn');
          } else {
            this.consoleManager.addLine(`✓ Account created! Logged in as ${data.user?.email || ident}`, 'info');
          }
        } catch (err) {
          this.consoleManager.addLine(`✗ Registration failed: ${err.message}`, 'error');
        }
      });
    }

    if (btnLoginGoogle) {
      btnLoginGoogle.addEventListener('click', async () => {
        try {
          this.consoleManager.addLine(' Redirecting to Google Auth...', 'info');
          await cloud.signInWithGoogle();
        } catch (err) {
          this.consoleManager.addLine(`✗ Google Auth failed: ${err.message}`, 'error');
        }
      });
    }

    if (btnBackup) {
      btnBackup.addEventListener('click', async () => {
        try {
          this._syncMonacoActiveScriptCode();
          const data = this.scene.saveSystem.compileSaveData();
          this.consoleManager.addLine(' Uploading save to cloud backup...', 'info');
          // For backward compatibility with JSON structures, save entire state in profile_data, and scripts in scripts_data
          await cloud.backupSave(data, data.scripts);
          this.consoleManager.addLine('✓ Game state backed up to cloud!', 'info');
        } catch (err) {
          this.consoleManager.addLine(`✗ Cloud backup failed: ${err.message}`, 'error');
        }
      });
    }

    if (btnRestore) {
      btnRestore.addEventListener('click', async () => {
        try {
          this.consoleManager.addLine(' Fetching cloud save...', 'info');
          const save = await cloud.restoreSave();
          if (!save) {
            this.consoleManager.addLine(' No cloud save found for this account.', 'warn');
            return;
          }
          let saveData = null;
          if (save.profile_data && save.profile_data.version === 1) {
            saveData = save.profile_data;
            if (save.scripts_data) {
              saveData.scripts = save.scripts_data;
            }
          } else {
            saveData = {
              version: 1,
              profile: save.profile_data,
              scripts: save.scripts_data || [],
              inventory: { coins: save.profile_data?.coins || 100, items: [] },
              drones: [],
              grid: []
            };
          }
          const success = this.scene.saveSystem.applySaveData(saveData);
          if (success) {
            clearTimeout(this._saveCodeTimeout);
            this._renderTabs();
            this._renderDevicesTab();
            this._renderProfile();
            this._renderBackpack();
            if (this.editor) {
              this.setEditorContent(this._getActiveCode());
            }
            this.consoleManager.addLine('✓ Cloud save restored successfully!', 'info');
          } else {
            this.consoleManager.addLine('✗ Failed to apply restored save data.', 'error');
          }
        } catch (err) {
          this.consoleManager.addLine(`✗ Cloud restore failed: ${err.message}`, 'error');
        }
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        try {
          this.consoleManager.addLine(' Logging out...', 'info');
          await cloud.signOut();
          this.consoleManager.addLine('✓ Logged out.', 'info');
        } catch (err) {
          this.consoleManager.addLine(`✗ Logout failed: ${err.message}`, 'error');
        }
      });
    }

    // Reset Local Save button — clears all local data and reloads
    const btnResetSave = document.getElementById('btn-reset-save');
    if (btnResetSave) {
      btnResetSave.addEventListener('click', () => {
        if (!confirm(' This will delete your local save and start fresh.\nAre you sure?')) return;
        this.scene.saveSystem?.clearLocalSave();
        // Also clear script cards
        localStorage.removeItem('ceoByCode_scripts');
        this.consoleManager.addLine(' Local save cleared. Reloading...', 'warn');
        setTimeout(() => window.location.reload(), 800);
      });
    }

    cloud.onAuthStateChange((event, session) => {
      this._updateCloudUI(session?.user || null);
    });

    cloud.getCurrentUser().then(user => {
      this._updateCloudUI(user);
    });
  }

  _updateCloudUI(user) {
    const loggedOutEl = document.getElementById('sync-logged-out');
    const loggedInEl = document.getElementById('sync-logged-in');
    const userEmailEl = document.getElementById('sync-user-email');

    if (user) {
      if (loggedOutEl) loggedOutEl.style.display = 'none';
      if (loggedInEl) loggedInEl.style.display = 'flex';
      if (userEmailEl) {
        const email = user.email || '';
        userEmailEl.textContent = email.endsWith('@droneharvest.com') 
          ? email.split('@')[0] 
          : email;
      }
    } else {
      if (loggedOutEl) loggedOutEl.style.display = 'flex';
      if (loggedInEl) loggedInEl.style.display = 'none';
    }
  }

  _renderDevicesTab() {
    const container = document.getElementById('devices-list');
    if (!container) return;

    const dm = this.deviceManager;
    if (!dm) {
      container.innerHTML = '<div style="color:#42535b;font-size:11px;padding:12px;">No Device Manager available.</div>';
      return;
    }

    const scripts = this.scriptManager.getAllScripts();
    const summaries = dm.getDeviceSummaries();

    // Rebuild Devices tab structure: script card deck first, then drone list
    container.innerHTML = `
      <div class="devices-layout" style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Section 1: Script Cards Deck -->
        <div class="script-cards-library" style="background: rgba(18, 18, 36, 0.4); border: 1px solid rgba(99,216,209, 0.15); border-radius: 12px; padding: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.25);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-family: 'Press Start 2P', monospace; font-size: 8px; color: #9b794e;">SCRIPT CARDS</span>
            <span style="font-size: 10px; color: #93a7a1;" id="script-cards-count">${scripts.length} / ${this.scriptManager.maxSlots} Used</span>
          </div>
          
          <!-- Script Cards Grid -->
          <div id="script-cards-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
            ${scripts.map(script => `
              <div class="script-card-item" data-script-id="${script.id}" style="background: rgba(10, 10, 20, 0.65); border: 1px solid rgba(255,255,255,0.06); border-left: 4px solid ${script.color}; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; cursor: grab; position: relative; transition: all 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                  <input type="text" value="${script.name}" class="script-card-rename-input" data-script-id="${script.id}" style="background: transparent; border: none; border-bottom: 1px dashed rgba(255,255,255,0.1); color: #edf0d4; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; width: 70%; outline: none; padding: 2px 0;" />
                  <span style="font-size: 8px; padding: 2px 4px; border-radius: 3px; background: ${script.assignedDroneId ? 'rgba(99,216,209, 0.1)' : 'rgba(255, 255, 255, 0.05)'}; color: ${script.assignedDroneId ? '#63d8d1' : '#93a7a1'}; font-weight: bold;">
                    ${script.assignedDroneId ? 'Bound' : 'Free'}
                  </span>
                </div>
                <div style="font-size: 9px; color: #4a7c59; height: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${script.assignedDroneId ? `Linked: <b style="color:#63d8d1;">${script.assignedDroneId}</b>` : 'Drag to drone drop zone'}
                </div>
                <div style="display: flex; gap: 6px; margin-top: 4px;">
                  <button class="btn-card-edit" data-script-id="${script.id}" style="flex: 1; font-size: 9px; padding: 4px 6px; background: rgba(99,216,209, 0.08); border: 1px solid rgba(99,216,209, 0.15); color: #63d8d1; border-radius: 4px; cursor: pointer; font-family: inherit;"> Edit</button>
                  <button class="btn-card-delete" data-script-id="${script.id}" style="font-size: 9px; padding: 4px 6px; background: rgba(255, 68, 68, 0.08); border: 1px solid rgba(255, 68, 68, 0.15); color: #9b794e; border-radius: 4px; cursor: pointer; font-family: inherit;">Delete</button>
                </div>
              </div>
            `).join('')}
            ${scripts.length === 0 ? `<div style="grid-column: span 2; text-align: center; color: #42535b; font-size: 10px; padding: 12px;">No script cards. Click below to create.</div>` : ''}
          </div>
          
          <!-- Create script card button -->
          <button id="btn-create-script-card" style="width: 100%; border: 1px dashed rgba(99,216,209, 0.3); background: rgba(99,216,209,0.02); color: #9b794e; border-radius: 6px; padding: 8px; margin-top: 10px; font-family: 'JetBrains Mono', monospace; font-size: 11px; cursor: pointer; transition: all 0.3s ease;">
            + Create New Script Card
          </button>
        </div>
        
        <!-- Section 2: Drones Hardware Grid -->
        <div style="font-family: 'Press Start 2P', monospace; font-size: 8px; color: #9b794e; margin-top: 8px; border-left: 3px solid #9b794e; padding-left: 8px;">DRONE HARDWARE</div>
        <div id="drones-hardware-grid" style="display: flex; flex-direction: column; gap: 12px;">
          <!-- Active Drones lists -->
        </div>
      </div>
    `;

    const dronesContainer = container.querySelector('#drones-hardware-grid');
    if (!dronesContainer) return;

    const MODULE_EMOJIS = { farming: '', supplier: '', seller: '' };
    const STATUS_COLORS_CSS = { idle: '#63d8d1', running: '#e9bf62', error: '#9b794e', paused: '#e9bf62' };

    summaries.forEach((device) => {
      const droneCard = document.createElement('div');
      droneCard.className = 'device-card' + (device.isActive ? ' device-card-active' : '');
      droneCard.style.position = 'relative';

      const statusColor = STATUS_COLORS_CSS[device.status] || '#63d8d1';
      const moduleEmoji = device.module ? MODULE_EMOJIS[device.module] || '' : '';
      const moduleName = device.module ? device.module.charAt(0).toUpperCase() + device.module.slice(1) : 'None';

      // Find if this drone has an assigned script
      const assignedScript = scripts.find(s => s.assignedDroneId === device.id);

      droneCard.innerHTML = `
        <div class="device-header">
          <div class="device-id-row">
            <span class="device-led" style="background:${statusColor};box-shadow:0 0 6px ${statusColor}"></span>
            <span class="device-id">${device.id}</span>
            ${device.isActive ? '<span class="device-active-badge">ACTIVE</span>' : ''}
          </div>
          <span class="device-status" style="color:${statusColor}">${device.status.toUpperCase()}</span>
        </div>
        
        <div class="device-info-row">
          <span class="device-module">${pixelIcon(device.module ? "module_" + device.module : "crate")} ${moduleName}</span>
          <span class="device-inv">Inv: ${device.inventoryCount}/${device.inventoryCapacity}</span>
        </div>
        <div style="width: 100%; height: 4px; background: #101a21; border: 1px solid #1b1b1b; border-radius: 2px; overflow: hidden; margin-top: 2px; margin-bottom: 6px;">
          <div style="width: ${Math.min(100, Math.round((device.inventoryCount / Math.max(1, device.inventoryCapacity)) * 100))}%; height: 100%; background: ${fillColorCSS(device.inventoryCount / Math.max(1, device.inventoryCapacity))}; transition: width 0.2s ease;"></div>
        </div>
        
        <div class="device-inv-preview" id="device-inv-${device.id}"></div>
        
        <!-- SCRIPT DROP ZONE -->
        <div class="drone-card-drop-zone" data-drone-id="${device.id}" style="border: 2px dashed ${assignedScript ? assignedScript.color : '#22343c'}; border-radius: 8px; padding: 12px; text-align: center; font-size: 10px; color: ${assignedScript ? '#edf0d4' : '#4a7c59'}; background: ${assignedScript ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)'}; transition: all 0.2s ease; position: relative;">
          ${assignedScript ? `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${assignedScript.color}; box-shadow: 0 0 4px ${assignedScript.color}"></span>
                <b style="color: #edf0d4; font-size: 11px;">${assignedScript.name}</b>
              </div>
              <button class="btn-card-unassign" data-drone-id="${device.id}" style="background: transparent; border: none; color: #9b794e; cursor: pointer; font-size: 9px; font-weight: bold; font-family: inherit; padding: 2px 6px;"> Eject</button>
            </div>
          ` : `
            <div style="color: #42535b; font-family: inherit; font-size: 9px; line-height: 1.4;">
              Drag script card here to bind
            </div>
          `}
        </div>
        
        <div class="device-actions" style="margin-top: 4px;">
          <!-- RUN / STOP button per drone -->
          <button class="btn-device-run" data-drone-id="${device.id}" style="flex: 2; background: ${device.status === 'running' ? '#9b794e' : '#63d8d1'}; color: #101a21; border: none; border-radius: 6px; padding: 8px 10px; font-weight: bold; cursor: pointer; font-family: inherit; font-size: 10px; transition: all 0.2s ease;">
            ${device.status === 'running' ? '■ STOP' : ' RUN'}
          </button>
          <button class="btn-device-equip" data-drone-id="${device.id}"> Module</button>
          <button class="btn-device-transfer" data-drone-id="${device.id}"> Transfer</button>
        </div>
      `;

      dronesContainer.appendChild(droneCard);

      // Render drone inventory items as compact grid slots
      const drone = dm.getById(device.id);
      const invPreview = droneCard.querySelector(`#device-inv-${device.id}`);
      if (drone && invPreview) {
        const items = drone.droneInventory.getAll();
        if (items.length === 0) {
          invPreview.innerHTML = '<span style="color:#42535b;font-size:10px;">Empty</span>';
        } else {
          invPreview.className = 'drone-inventory-grid';
          invPreview.innerHTML = items.map(({ id, count }) => {
            const meta = ITEM_METADATA[id] || { name: id, emoji: '' };
            return `
              <div class="drone-inventory-slot" title="${meta.name}: ${count}">
                ${pixelIcon(id, "drone-inventory-slot-emoji")}
                <div class="drone-inventory-slot-qty">${count}</div>
              </div>
            `;
          }).join('');
        }
      }

      // Card clicking makes it the active drone for edit (Monaco target)
      droneCard.addEventListener('click', (e) => {
        // Prevent click if clicking buttons or drop zones
        if (e.target.closest('button') || e.target.closest('.drone-card-drop-zone') || e.target.closest('input')) {
          return;
        }
        dm.setActiveDevice(device.id);
      });

      // Equip Module button
      const equipBtn = droneCard.querySelector('.btn-device-equip');
      if (equipBtn) {
        equipBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._showModuleEquipMenu(device.id);
        });
      }

      // Transfer to Player button
      const transferBtn = droneCard.querySelector('.btn-device-transfer');
      if (transferBtn) {
        transferBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetDrone = dm.getById(device.id);
          if (!targetDrone) return;
          const items = targetDrone.droneInventory.getAll();
          if (items.length === 0) {
            this.consoleManager.addLine(`${device.id}: Drone inventory is empty.`, 'warn');
            return;
          }
          const inv = this.scene.inventorySystem;
          for (const { id, count } of items) {
            inv.addItem(id, count);
          }
          targetDrone.droneInventory.clear();
          targetDrone.events.emit('inventory-changed', { droneId: targetDrone.id });
          this.consoleManager.addLine(` Transferred items from ${device.id} to backpack.`, 'info');
        });
      }
    });

    if (summaries.length === 0) {
      dronesContainer.innerHTML = '<div style="color:#42535b;font-size:11px;padding:12px;text-align:center;">No drones registered yet. Buy drones in Shop!</div>';
    }

    // ── Setup Card Drag and Drop Event Listeners ──
    container.querySelectorAll('.script-card-item').forEach(card => {
      card.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button') || e.target.closest('input')) return;
        const scriptId = card.getAttribute('data-script-id');
        const scriptName = card.querySelector('.script-card-rename-input')?.value || scriptId;
        if (this.scene.dragManager) {
          this.scene.dragManager.startDrag(e, {
            type: 'script_card',
            scriptId,
            name: scriptName,
            element: card,
            onDragStart: () => card.classList.add('dragging'),
            onDragEnd: () => card.classList.remove('dragging'),
          });
        }
      });
    });

    container.querySelectorAll('.drone-card-drop-zone').forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const scriptId = e.dataTransfer.getData('text/plain');
        const droneId = zone.getAttribute('data-drone-id');
        if (scriptId && droneId) {
          this._syncMonacoActiveScriptCode();
          this.scriptManager.assignScriptToDrone(scriptId, droneId);
          this.consoleManager.addLine(` Script card linked to ${droneId}`, 'info');
          this._renderDevicesTab();
          
          if (this.deviceManager?.activeDeviceId === droneId) {
            this._selectScript(scriptId);
          }
        }
      });
    });

    // Unassign script card
    container.querySelectorAll('.btn-card-unassign').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const droneId = btn.getAttribute('data-drone-id');
        if (droneId) {
          this.scriptManager.assignScriptToDrone(null, droneId);
          this.consoleManager.addLine(` Unassigned script card from ${droneId}`, 'info');
          this._renderDevicesTab();
        }
      });
    });

    // Edit script card code button
    container.querySelectorAll('.btn-card-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scriptId = btn.getAttribute('data-script-id');
        if (scriptId) {
          this._selectScript(scriptId);
          const script = this.scriptManager.getScript(scriptId);
          if (script && script.assignedDroneId) {
            this.deviceManager.setActiveDevice(script.assignedDroneId);
          }
          this.openTab('editor');
          this.consoleManager.addLine(` Editing script: ${script?.name || scriptId}`, 'info');
        }
      });
    });

    // Delete script card button
    container.querySelectorAll('.btn-card-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scriptId = btn.getAttribute('data-script-id');
        if (scriptId) {
          const script = this.scriptManager.getScript(scriptId);
          if (confirm(`Delete script "${script?.name || 'Untitled'}"?`)) {
            this._syncMonacoActiveScriptCode();
            this.scriptManager.deleteScript(scriptId);
            this.consoleManager.addLine(` Script card "${script?.name}" deleted.`, 'info');
            this._renderDevicesTab();
            this._renderTabs();
            if (this.editor) {
              this.setEditorContent(this._getActiveCode());
            }
          }
        }
      });
    });

    // Inline Rename input handlers
    container.querySelectorAll('.script-card-rename-input').forEach(input => {
      input.addEventListener('focus', (e) => {
        e.stopPropagation();
      });
      input.addEventListener('blur', (e) => {
        const scriptId = input.getAttribute('data-script-id');
        const newName = input.value.trim();
        if (newName && scriptId) {
          this.scriptManager.renameScript(scriptId, newName);
          this._renderTabs(); // sync Monaco script tabs
        }
      });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation(); // prevent game hotkeys like SPACE or E when typing
        if (e.key === 'Enter') {
          input.blur();
        }
      });
    });

    // Create Script Card button listener
    const btnCreateScriptCard = container.querySelector('#btn-create-script-card');
    if (btnCreateScriptCard) {
      const { current, max } = this.scriptManager.getSlotCount();
      if (current >= max) {
        btnCreateScriptCard.disabled = true;
        btnCreateScriptCard.style.opacity = '0.4';
        btnCreateScriptCard.style.cursor = 'not-allowed';
        btnCreateScriptCard.textContent = `Script Cards Maxed (${current}/${max})`;
      } else {
        btnCreateScriptCard.addEventListener('click', (e) => {
          e.stopPropagation();
          const script = this.scriptManager.createScript('Untitled Card');
          if (script) {
            this.consoleManager.addLine(` Created new script card "${script.name}"`, 'info');
            this._renderDevicesTab();
            this._renderTabs();
          }
        });
      }
    }

    // Drone Run/Stop buttons
    container.querySelectorAll('.btn-device-run').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const droneId = btn.getAttribute('data-drone-id');
        const drone = this.deviceManager?.getById(droneId);
        if (!drone) return;

        const assignedScript = scripts.find(s => s.assignedDroneId === droneId);
        if (!assignedScript) {
          this.consoleManager.addLine(` Cannot run: No script card is assigned to ${drone.label || droneId}.`, 'warn');
          return;
        }

        const sandbox = drone.scriptSandbox;
        if (sandbox.isRunning) {
          sandbox.stop();
          this._updateControlsUI();
          this._renderDevicesTab();
          return;
        }

        this._syncMonacoActiveScriptCode();
        const latestScript = this.scriptManager.getScript(assignedScript.id);
        const code = latestScript ? latestScript.code : '';
        if (!code.trim()) {
          this.consoleManager.addLine(` No code in script "${assignedScript.name}".`, 'warn');
          return;
        }

        this.consoleManager.addLine(` Executing "${assignedScript.name}" on ${drone.label}...`, 'info');

        // Run Benchmark to calculate simulated offline rates
        const benchmarkResult = sandbox.benchmark(code);
        if (benchmarkResult.success) {
          drone.productionRates = benchmarkResult.rates;
          drone.benchmarkError = null;
          this.consoleManager.addLine(` Script Benchmark: Success! Production rates calculated.`, 'info');
        } else {
          drone.productionRates = null;
          drone.benchmarkError = benchmarkResult.error;
          this.consoleManager.addLine(` Script Benchmark: Has crash or error: ${benchmarkResult.error}`, 'warn');
        }

        drone.setStatus('running');
        sandbox.execute(code);
        this._updateControlsUI();
        this._renderDevicesTab();
      });
    });
  }

  /** Show a quick module equip menu for a drone */
  _showModuleEquipMenu(droneId) {
    const dm = this.deviceManager;
    const drone = dm?.getById(droneId);
    if (!drone) return;

    const inv = this.scene.inventorySystem;
    const moduleItems = [
      { key: 'farming', itemId: 'module_farming', name: ' Farming Module' },
      { key: 'supplier', itemId: 'module_supplier', name: ' Supplier Module' },
      { key: 'seller', itemId: 'module_seller', name: ' Seller/Buyer Module' },
    ];

    // Find what player has in inventory
    const available = moduleItems.filter(m => inv.hasItem(m.itemId, 1));

    if (available.length === 0 && !drone.module) {
      this.consoleManager.addLine('No modules in inventory! Buy them at the Market.', 'warn');
      return;
    }

    // Build a simple selector notification
    let menuHtml = `<div style="padding:12px;">`;
    if (drone.module) {
      menuHtml += `<div style="margin-bottom:8px;color:#93a7a1;font-size:11px;">Current: <b style="color:#63d8d1">${drone.module}</b></div>`;
      menuHtml += `<button class="btn-unequip-module" style="width:100%;margin-bottom:8px;"> Unequip Module (return to inventory)</button>`;
    }
    available.forEach(m => {
      menuHtml += `<button class="btn-equip-module-item" data-module="${m.key}" data-item="${m.itemId}" style="width:100%;margin-bottom:6px;">${m.name}</button>`;
    });
    menuHtml += `</div>`;

    // Inject into devices list temporarily as a modal-like overlay inside the card
    const overlay = document.createElement('div');
    overlay.id = 'module-equip-overlay';
    overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(16,26,33,0.95);z-index:999;border-radius:12px;display:flex;flex-direction:column;justify-content:center;';
    overlay.innerHTML = `
      <div style="padding:16px;">
        <div style="font-family:'Press Start 2P',monospace;font-size:9px;color:#9b794e;margin-bottom:12px;">EQUIP MODULE</div>
        <div style="font-size:11px;color:#93a7a1;margin-bottom:12px;">Drone: <b style="color:#edf0d4">${droneId}</b></div>
        ${drone.module ? `<div style="margin-bottom:8px;font-size:11px;color:#93a7a1;">Current: <b style="color:#63d8d1">${drone.module}</b></div><button id="btn-unequip" style="width:100%;background:transparent;border:1px solid #9b794e;color:#9b794e;border-radius:6px;padding:6px;cursor:pointer;font-family:monospace;font-size:11px;margin-bottom:8px;"> Unequip</button>` : ''}
        ${available.map(m => `<button class="btn-equip-mod" data-module="${m.key}" data-item="${m.itemId}" style="width:100%;background:rgba(99,216,209,0.1);border:1px solid rgba(99,216,209,0.3);color:#63d8d1;border-radius:6px;padding:8px;cursor:pointer;font-family:monospace;font-size:11px;margin-bottom:6px;">${m.name}</button>`).join('')}
        <button id="btn-close-equip" style="width:100%;background:transparent;border:1px dashed #22343c;color:#4a7c59;border-radius:6px;padding:6px;cursor:pointer;font-family:monospace;font-size:11px;margin-top:4px;">Cancel</button>
      </div>
    `;

    const devicesTab = document.getElementById('tab-view-devices');
    if (!devicesTab) return;
    devicesTab.style.position = 'relative';
    devicesTab.appendChild(overlay);

    // Unequip button
    const unequipBtn = overlay.querySelector('#btn-unequip');
    if (unequipBtn) {
      unequipBtn.addEventListener('click', () => {
        if (drone.module) {
          // Return module to player inventory
          inv.addItem(`module_${drone.module}`, 1);
          drone.equipModule(null);
          this.consoleManager.addLine(`Module unequipped from ${droneId}.`, 'info');
        }
        overlay.remove();
        this._renderDevicesTab();
      });
    }

    // Equip buttons
    overlay.querySelectorAll('.btn-equip-mod').forEach(btn => {
      btn.addEventListener('click', () => {
        const moduleKey = btn.getAttribute('data-module');
        const itemId = btn.getAttribute('data-item');
        // Return old module if present
        if (drone.module) {
          inv.addItem(`module_${drone.module}`, 1);
        }
        // Consume from inventory
        inv.removeItem(itemId, 1);
        const result = drone.equipModule(moduleKey);
        this.consoleManager.addLine(result.message, result.success ? 'info' : 'error');
        overlay.remove();
        this._renderDevicesTab();
      });
    });

    // Close button
    overlay.querySelector('#btn-close-equip')?.addEventListener('click', () => {
      overlay.remove();
    });
  }

  _showBackpackItemDetails(itemId, qty, meta) {
    const detailsCard = document.getElementById('backpack-popup-details');
    if (!detailsCard) return;

    // Show exactly the price that the economy will actually pay.
    const sellPrice = this.scene.economySystem.getSellPrice(itemId);

    let actionBtnHtml = '';
    if (sellPrice) {
      actionBtnHtml = `
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button class="btn-profile-save btn-sell" data-item="${itemId}" id="btn-details-sell-one" style="flex: 1; font-size: 10px;">Sell 1 (+${sellPrice}g)</button>
          <button class="btn-profile-save btn-sell" data-item="${itemId}" id="btn-details-sell-all" style="flex: 1; font-size: 10px; background: transparent; border: 1px dashed #9b794e; color: #9b794e;">Sell All</button>
        </div>
      `;
    } else {
      let typeLabel = 'Seed';
      if (itemId.startsWith('module_')) typeLabel = 'Drone Module';
      else if (itemId.startsWith('key_')) typeLabel = 'Zone Key';
      else if (itemId === 'plow' || itemId === 'watering_can' || itemId === 'pickaxe') typeLabel = 'Tool';
      actionBtnHtml = `<div style="margin-top: 8px;"><span style="font-size: 8px; color: #63d8d1; border: 1px dashed rgba(99,216,209, 0.4); padding: 4px 8px; border-radius: 4px; display: inline-block; font-weight: bold; font-family: 'Press Start 2P', monospace;">${typeLabel.toUpperCase()}</span></div>`;
    }

    if (itemId.endsWith('_seed') || itemId === 'plow' || itemId === 'watering_can' || itemId === 'pickaxe') {
      actionBtnHtml += '<button id="btn-details-hotbar" style="margin-top:12px;width:100%">Pasang di slot aktif</button>';
    }
    detailsCard.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; margin-top: 12px;">
        ${pixelIcon(itemId)}
        <div style="display: flex; flex-direction: column;">
          <strong style="color: #edf0d4; font-size: 13px;">${meta.name}</strong>
          <span style="color: #63d8d1; font-size: 10px; font-weight: bold;">Owned: ${qty}</span>
        </div>
      </div>
      <p style="color: #93a7a1; font-size: 11px; margin-top: 4px; line-height: 1.4;">${meta.desc || 'No description available.'}</p>
      <div style="width: 100%;">
        ${actionBtnHtml}
      </div>
    `;

    // Wire up buttons
    document.getElementById('btn-details-hotbar')?.addEventListener('click', () => {
      this.scene.hotbar.moveItemToHotbar(itemId, this.scene.hotbar.activeSlot);
      this.scene.hud.showMessage('Item dipasang pada slot aktif.');
      this.scene.saveSystem.saveLocal();
      this._renderBackpack();
    });
    const btnSellOne = document.getElementById('btn-details-sell-one');
    if (btnSellOne) {
      btnSellOne.onclick = () => {
        const res = this.scene.economySystem.sellCrop(itemId, 1);
        if (res.success) {
          this.consoleManager.addLine(`Sold: ${res.message}`, 'info');
        } else {
          this.consoleManager.addLine(`Sell Error: ${res.message}`, 'error');
        }
        this._renderBackpack();
      };
    }

    const btnSellAll = document.getElementById('btn-details-sell-all');
    if (btnSellAll) {
      btnSellAll.onclick = () => {
        const count = this.scene.inventorySystem.getItemCount(itemId);
        const res = this.scene.economySystem.sellCrop(itemId, count);
        if (res.success) {
          this.consoleManager.addLine(`Sold: ${res.message}`, 'info');
        } else {
          this.consoleManager.addLine(`Sell Error: ${res.message}`, 'error');
        }
        this._renderBackpack();
      };
    }
  }

  openInGameSmartphoneUI(isEfficient, earnings, crashedDroneName, eliNPCSprite) {
    this.toggleSmartphone(true, 'chat');
    const msgContainer = document.getElementById('smartphone-chat-messages');
    const actionsContainer = document.getElementById('smartphone-chat-actions');

    if (!msgContainer || !actionsContainer) return;

    msgContainer.innerHTML = '';
    actionsContainer.innerHTML = '';

    const addMessage = (sender, text) => {
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${sender}`;
      if (sender === 'eli') {
        bubble.innerHTML = `<span style="font-size: 8px; color: #9b794e; font-weight: bold; margin-bottom: 2px;">Eli (Assistant Manager)</span><div>${text}</div>`;
      } else {
        bubble.innerHTML = `<div>${text}</div>`;
      }
      msgContainer.appendChild(bubble);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    };

    if (isEfficient) {
      const hasOres = Object.keys(earnings).some(id => id.includes('ore') || id.includes('ingot') || id === 'coal');
      
      if (hasOres) {
        setTimeout(() => addMessage('eli', ' Laporan hilirisasi industri kita semalam sukses besar! Logika mining yang kamu buat lancar jaya tanpa izin tambang ilegal.'), 500);

        setTimeout(() => {
          actionsContainer.innerHTML = `
            <button class="smartphone-btn" id="btn-reply-esdm">"Izin tambangnya kan dari kamu..."</button>
          `;
          document.getElementById('btn-reply-esdm').onclick = () => {
            addMessage('player', 'Izin tambangnya kan dari kamu...');
            actionsContainer.innerHTML = '';
            
            setTimeout(() => {
              addMessage('eli', 'Sshh! Jangan keras-keras, nanti kedengaran NPC lain. Pokoknya batubara sama hasil tambang udah masuk regulasi gudang pusat.');
              
              let earningsList = Object.entries(earnings).map(([id, qty]) => `+${qty} ${id.replace('_', ' ')}`).join(', ');
              
              setTimeout(() => {
                addMessage('eli', `Ini hasil hilirisasi kita: ${earningsList}. Dah, sana cek smelter. Jangan malas, kuota produksi kita masih banyak hari ini!`);
                
                actionsContainer.innerHTML = `
                  <button class="smartphone-btn-claim" id="btn-claim-esdm">KLAIM HASIL HILIRISASI</button>
                `;
                document.getElementById('btn-claim-esdm').onclick = () => {
                  this.scene.claimOfflineResources(earnings);
                  this.toggleSmartphone(false);
                  this.scene.tweens.add({
                    targets: eliNPCSprite,
                    x: 15 * 32 + 16,
                    y: 22 * 32 + 16,
                    duration: 2000,
                    ease: 'Power1',
                    onComplete: () => {
                      eliNPCSprite.destroy();
                      if (this.scene.speechBubbleContainer) this.scene.speechBubbleContainer.destroy();
                    }
                  });
                };
              }, 1200);
            }, 1000);
          };
        }, 1500);
      } else {
        setTimeout(() => addMessage('eli', ' Kodinganmu semalam rapi banget. Tumben. Nggak ada infinite loop, logikanya efisian, bahkan dronenya nggak ada yang nabrak pagar.'), 500);

        setTimeout(() => {
          actionsContainer.innerHTML = `
            <button class="smartphone-btn" id="btn-reply-crop">"Siapa dulu dong programmernya."</button>
          `;
          document.getElementById('btn-reply-crop').onclick = () => {
            addMessage('player', 'Siapa dulu dong programmernya.');
            actionsContainer.innerHTML = '';
            
            setTimeout(() => {
              addMessage('eli', 'Iya deh, yang otaknya isi algoritma. Ini semua hasil panen semalam udah aku rapihin ke gudang.');
              
              let earningsList = Object.entries(earnings).map(([id, qty]) => `+${qty} ${id.replace('_', ' ')}`).join(', ');
              
              setTimeout(() => {
                addMessage('eli', `Total panen: ${earningsList}. Jangan dipakai buat gacha game sebelah ya, tabung buat upgrade smelter kita.`);
                addMessage('eli', 'Sama satu lagi... kopi di mejamu itu udah dingin. Ganti air putih sana, aku gamau asistenan sama hantu kurang tidur.');
                
                actionsContainer.innerHTML = `
                  <button class="smartphone-btn-claim" id="btn-claim-crop">KLAIM HASIL PANEN</button>
                `;
                document.getElementById('btn-claim-crop').onclick = () => {
                  this.scene.claimOfflineResources(earnings);
                  this.toggleSmartphone(false);
                  this.scene.tweens.add({
                    targets: eliNPCSprite,
                    x: 10 * 32 + 16,
                    y: 2 * 32 + 16,
                    duration: 2000,
                    ease: 'Power1',
                    onComplete: () => {
                      eliNPCSprite.destroy();
                      if (this.scene.speechBubbleContainer) this.scene.speechBubbleContainer.destroy();
                    }
                  });
                };
              }, 1200);
            }, 1000);
          };
        }, 1500);
      }
    } else {
      const isMiningCrash = crashedDroneName.toLowerCase().includes('mining') || crashedDroneName.toLowerCase().includes('miner');
      
      if (isMiningCrash) {
        setTimeout(() => addMessage('eli', ` Bencana investasi, Abang... Kodinganmu tadi malam kena Stagnasi. Dronemu ${crashedDroneName} mogok karena salah naruh tanda kurung.`), 500);

        setTimeout(() => {
          actionsContainer.innerHTML = `
            <button class="smartphone-btn" id="btn-reply-crash-mine">"Aduh, inflasi logika nih."</button>
          `;
          document.getElementById('btn-reply-crash-mine').onclick = () => {
            addMessage('player', 'Aduh, inflasi logika nih.');
            actionsContainer.innerHTML = '';
            
            setTimeout(() => {
              addMessage('eli', 'Inflasi gundulmu! Ini namanya krisis energi! Mesin pengolah gandum mati lampu semalaman karena suplai batubara dari drone macet. Kita rugi besar.');
              
              const bonus = { stone: 5, coal: 2 };
              
              setTimeout(() => {
                addMessage('eli', 'Untung aku gantiin manual beberapa tugas ringan tadi pagi, jadi adalah dikit bonus batu buat kamu. Dah, buruan benerin gih kodenya.');
                
                actionsContainer.innerHTML = `
                  <button class="smartphone-btn-claim" id="btn-claim-crash-mine">AMBIL SISA SUBSIDI ENERGI</button>
                `;
                document.getElementById('btn-claim-crash-mine').onclick = () => {
                  this.scene.claimOfflineResources(bonus);
                  this.toggleSmartphone(false);
                  this.scene.tweens.add({
                    targets: eliNPCSprite,
                    x: 10 * 32 + 16,
                    y: 2 * 32 + 16,
                    duration: 2000,
                    ease: 'Power1',
                    onComplete: () => {
                      eliNPCSprite.destroy();
                      if (this.scene.speechBubbleContainer) this.scene.speechBubbleContainer.destroy();
                    }
                  });
                };
              }, 1200);
            }, 1000);
          };
        }, 1500);
      } else {
        setTimeout(() => addMessage('eli', ` Bang, baru ditinggal tidur bentar, itu skrip logistikmu di ${crashedDroneName} udah Crash. Kamu ngetik drone.crop() malah jadi drone.krop(). Kreatif banget nyiptain sintaks baru.`), 500);

        setTimeout(() => {
          actionsContainer.innerHTML = `
            <button class="smartphone-btn" id="btn-reply-crash-crop">"Aduh, ngantuk semalam..."</button>
          `;
          document.getElementById('btn-reply-crash-crop').onclick = () => {
            addMessage('player', 'Aduh, ngantuk semalam...');
            actionsContainer.innerHTML = '';
            
            setTimeout(() => {
              addMessage('eli', 'Alasan klasik. Dronemu cuma muter-muter di pojokan grid sampai baterainya abis. Hasil semalam zonk.');
              
              const bonus = { wheat: 5 };
              
              setTimeout(() => {
                addMessage('eli', 'Untung aku gantiin manual beberapa tugas ringan, jadi adalah dikit bonus gandum buat kamu. Dah, buruan benerin kodenya. Malu sama status programmer.');
                
                actionsContainer.innerHTML = `
                  <button class="smartphone-btn-claim" id="btn-claim-crash-crop">KLAIM BONUS SUBSIDI</button>
                `;
                document.getElementById('btn-claim-crash-crop').onclick = () => {
                  this.scene.claimOfflineResources(bonus);
                  this.toggleSmartphone(false);
                  this.scene.tweens.add({
                    targets: eliNPCSprite,
                    x: 10 * 32 + 16,
                    y: 2 * 32 + 16,
                    duration: 2000,
                    ease: 'Power1',
                    onComplete: () => {
                      eliNPCSprite.destroy();
                      if (this.scene.speechBubbleContainer) this.scene.speechBubbleContainer.destroy();
                    }
                  });
                };
              }, 1200);
            }, 1000);
          };
        }, 1500);
      }
    }
  }

  toggleSmartphone(forceState = null, appId = 'home') {
    const chatEl = document.getElementById('smartphone-chat');
    if (!chatEl) return;

    if (forceState !== null) {
      this.isPhoneOpen = forceState;
    } else {
      this.isPhoneOpen = !this.isPhoneOpen;
    }

    if (this.isPhoneOpen) {
      this.scene.panelManager.open('smartphone-chat');
      this._openPhoneApp(appId);
    } else {
      if (this.scene.panelManager.current === 'smartphone-chat') this.scene.panelManager.close();
      this._hideHoverTooltip();
    }
  }

  _setupSmartphoneUI() {
    document.getElementById('btn-workspace-phone')?.addEventListener('click', () => this.toggleSmartphone());
    const btnClose = document.getElementById('btn-close-phone');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.toggleSmartphone(false));
    }

    const btnAppChat = document.getElementById('btn-app-chat');
    if (btnAppChat) {
      btnAppChat.addEventListener('click', () => this._openPhoneApp('chat'));
    }

    const btnAppEsdm = document.getElementById('btn-app-esdm');
    if (btnAppEsdm) {
      btnAppEsdm.addEventListener('click', () => this._openPhoneApp('esdm'));
    }

    const btnChatBack = document.getElementById('btn-chat-back');
    if (btnChatBack) {
      btnChatBack.addEventListener('click', () => this._openPhoneApp('home'));
    }

    const btnEsdmBack = document.getElementById('btn-esdm-back');
    if (btnEsdmBack) {
      btnEsdmBack.addEventListener('click', () => this._openPhoneApp('home'));
    }
  }

  _openPhoneApp(appId) {
    this.activePhoneApp = appId;
    const homeMenu = document.getElementById('phone-home-menu');
    const appChat = document.getElementById('phone-app-chat');
    const appEsdm = document.getElementById('phone-app-esdm');

    if (homeMenu) homeMenu.style.display = appId === 'home' ? 'flex' : 'none';
    if (appChat) appChat.style.display = appId === 'chat' ? 'flex' : 'none';
    if (appEsdm) appEsdm.style.display = appId === 'esdm' ? 'flex' : 'none';

    if (appId === 'esdm') {
      this._renderRemoteShop();
      this._updateActiveDronesCount();
    }
  }

  _renderRemoteShop() {
    const shopContainer = document.getElementById('phone-esdm-shop');
    if (!shopContainer) return;

    shopContainer.innerHTML = '';
    const buyableSeeds = ['wheat', 'potato', 'apple_tree', 'cactus'];

    buyableSeeds.forEach(plantType => {
      const def = this.scene.economySystem.shopItems?.find(i => i.id === plantType) || {
        name: plantType.replace('_', ' ').toUpperCase(),
        seedCost: plantType === 'wheat' ? 5 : plantType === 'potato' ? 10 : plantType === 'cactus' ? 18 : 25,
        unlockLevel: plantType === 'wheat' ? 1 : plantType === 'potato' ? 1 : plantType === 'cactus' ? 1 : 1
      };

      const seedCost = def.seedCost;
      const unlockLevel = def.unlockLevel || 1;
      const isLocked = this.scene.profileSystem.level < unlockLevel;

      const shopItemEl = document.createElement('div');
      shopItemEl.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:8px; border-radius:8px;';
      
      const emojiMap = { wheat: '', potato: '', apple_tree: '', cactus: '' };
      const emoji = emojiMap[plantType] || '';

      shopItemEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:16px;">${emoji}</span>
          <div style="display:flex; flex-direction:column;">
            <span style="font-size:10px; font-weight:bold; color:#edf0d4;">${def.name} Seed</span>
            <span style="font-size:8px; color:#e9bf62;">Cost: ${seedCost}g ${isLocked ? `(Lvl ${unlockLevel})` : ''}</span>
          </div>
        </div>
        <button class="btn-buy-seed-remote" data-seed="${plantType}" ${isLocked ? 'disabled' : ''} style="background:#63d8d1; border:none; border-radius:4px; padding:4px 8px; color:#101a21; font-family:inherit; font-size:9px; font-weight:bold; cursor:pointer;">
          ${isLocked ? '' : 'BUY'}
        </button>
      `;

      if (!isLocked) {
        shopItemEl.querySelector('.btn-buy-seed-remote').addEventListener('click', () => {
          const res = this.scene.economySystem.buySeed(plantType);
          if (res.success) {
            this.consoleManager.addLine(`Remote Shop: ${res.message}`, 'info');
            this._renderBackpack();
            this._renderProfile();
          } else {
            this.consoleManager.addLine(`Remote Shop Error: ${res.message}`, 'error');
          }
        });
      }

      shopContainer.appendChild(shopItemEl);
    });
  }

  _updateActiveDronesCount() {
    const activeCountEl = document.getElementById('phone-active-drones-count');
    if (activeCountEl && this.deviceManager) {
      const activeCount = this.deviceManager.getAll().filter(d => d.status === 'running').length;
      activeCountEl.textContent = activeCount;
    }
  }

  toggleWarehouse(forceState = null) {
    // Warehouse now lives in the right-side storage dock so it can support
    // direct pointer drag/drop between the backpack and shared inventory.
    if (this.scene.storageUI) {
      const shouldOpen = forceState === null ? !this.scene.storageUI.isOpen() : forceState;
      if (shouldOpen) this.scene.storageUI.open();
      else this.scene.storageUI.close();
      return;
    }
    const whEl = document.getElementById('warehouse-popup');
    if (!whEl) return;

    if (forceState !== null) {
      this.isWarehouseOpen = forceState;
    } else {
      this.isWarehouseOpen = !this.isWarehouseOpen;
    }

    if (this.isWarehouseOpen) {
      this.scene.panelManager.open('warehouse-popup');
      this._renderWarehousePopup();
    } else {
      if (this.scene.panelManager.current === 'warehouse-popup') this.scene.panelManager.close();
      this._hideHoverTooltip();
    }
  }

  _setupWarehousePopupUI() {
    const btnClose = document.getElementById('btn-close-warehouse');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.toggleWarehouse(false));
    }

    const btnDeposit = document.getElementById('btn-warehouse-popup-deposit-all');
    if (btnDeposit) {
      btnDeposit.addEventListener('click', () => {
        const warehouse = this.scene.warehouse;
        if (!warehouse) return;

        const inv = this.scene.inventorySystem;
        const items = inv.getAllItems();
        let depositedCount = 0;
        items.forEach(({ id, count }) => {
          // Do not deposit tools (plow, watering_can, pickaxe) or key items
          if (id !== 'plow' && id !== 'watering_can' && id !== 'pickaxe' && !id.startsWith('key_') && count > 0) {
            warehouse.deposit(id, count);
            inv.removeItem(id, count);
            depositedCount += count;
          }
        });
        if (depositedCount > 0) {
          this.consoleManager.addLine(` Deposited ${depositedCount} items from backpack to warehouse.`, 'info');
          this._renderBackpack();
          this._renderWarehousePopup();
        } else {
          this.consoleManager.addLine(`No depositable crops or materials in backpack.`, 'warn');
        }
      });
    }

    // Refresh warehouse popup when warehouse events fire
    if (this.scene.warehouse) {
      this.scene.warehouse.events.on('changed', () => {
        if (this.isWarehouseOpen) {
          this._renderWarehousePopup();
        }
      });
    }
  }

  _renderWarehousePopup() {
    const warehouseGrid = document.getElementById('warehouse-popup-grid');
    const warehouse = this.scene.warehouse;
    if (!warehouse || !warehouseGrid) return;

    warehouseGrid.innerHTML = '';

    const whItems = warehouse.getAll().filter(({ count }) => count > 0);
    const totalSlots = 24; // 4x6 grid

    for (let i = 0; i < totalSlots; i++) {
      const slotEl = document.createElement('div');
      
      if (i < whItems.length) {
        const { id, count } = whItems[i];
        const meta = ITEM_METADATA[id] || { name: id, emoji: '', rarity: 'Common', sector: 'Umum' };

        slotEl.className = 'inventory-slot btn-warehouse-popup-item';
        slotEl.setAttribute('data-item-id', id);
        slotEl.setAttribute('role', 'button'); slotEl.tabIndex = 0;
        slotEl.setAttribute('aria-label', `${meta.name}, ${count}`);
        slotEl.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slotEl.click(); } });
        slotEl.innerHTML = `
          ${pixelIcon(id, 'inventory-slot-emoji')}
          <div class="inventory-slot-qty">${count}</div>
        `;

        // Tooltip listeners
        slotEl.addEventListener('mouseenter', (e) => {
          this._showHoverTooltip(id, count, e);
        });
        slotEl.addEventListener('mousemove', (e) => {
          this._moveHoverTooltip(e);
        });
        slotEl.addEventListener('mouseleave', () => {
          this._hideHoverTooltip();
        });

        // Click to withdraw
        slotEl.addEventListener('click', (e) => {
          const totalCount = warehouse.getItemCount(id);
          const qtyToWithdraw = e.shiftKey ? totalCount : 1;

          if (warehouse.withdraw(id, qtyToWithdraw)) {
            this.scene.inventorySystem.addItem(id, qtyToWithdraw);
            this.consoleManager.addLine(` Retrieved ${qtyToWithdraw}x ${id.replace('_', ' ')} from warehouse to backpack.`, 'info');
            this._renderBackpack();
            this._renderWarehousePopup();
            
            // Also trigger tooltip update
            const updatedCount = warehouse.getItemCount(id);
            if (updatedCount > 0) {
              this._showHoverTooltip(id, updatedCount, e);
            } else {
              this._hideHoverTooltip();
            }
          }
        });
      } else {
        // Render dashed empty slot placeholder
        slotEl.className = 'inventory-slot empty-placeholder';
      }

      warehouseGrid.appendChild(slotEl);
    }
  }

  _showHoverTooltip(itemId, count, event) {
    const tooltip = document.getElementById('inventory-tooltip');
    if (!tooltip) return;

    const meta = ITEM_METADATA[itemId] || { name: itemId, emoji: '', desc: 'Unknown item.', rarity: 'Common', sector: 'Umum' };
    
    // Fallback price list
    const priceMap = {
      wheat: 15, potato: 22, cactus: 25, apple_tree: 30,
      coal: 12, copper_ore: 18, iron_ore: 25, gold_ore: 50,
      copper_ingot: 40, iron_ingot: 60, gold_ingot: 120,
      flour: 30, bread: 80, apple_juice: 50, apple_jam: 100,
      potato_starch: 45, chips: 110, wire: 60, gear: 90, chip: 250
    };
    const sellPrice = priceMap[itemId] || null;

    // Colors by rarity
    const rarityColors = {
      Common: '#edf0d4',
      Rare: '#63d8d1',
      Epic: '#93a7a1',
      Legendary: '#e9bf62'
    };
    const rarityColor = rarityColors[meta.rarity] || '#edf0d4';

    // Colors by sector
    const sectorColors = {
      'Peralatan': '#9b794e',
      'Pertanian': '#e9bf62',
      'Tambang': '#63d8d1',
      'Artisan Refineri': '#e9bf62',
      'Upgrade': '#93a7a1',
      'Umum': '#edf0d4'
    };
    const sectorColor = sectorColors[meta.sector] || '#edf0d4';

    tooltip.style.borderColor = rarityColor;
    tooltip.style.boxShadow = `0 10px 25px rgba(0,0,0,0.8), 0 0 15px ${rarityColor}44`;

    tooltip.innerHTML = `
      <div style="font-weight:bold; font-size:12px; color:#edf0d4; display:flex; align-items:center; gap:4px; margin-bottom:4px;">
        ${pixelIcon(itemId)} <span>${meta.name}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:9px; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:4px;">
        <span style="color:${rarityColor}; font-weight:bold;">${meta.rarity.toUpperCase()}</span>
        <span style="color:${sectorColor};">${meta.sector}</span>
      </div>
      <div style="font-size:9.5px; color:#93a7a1; line-height:1.3; margin-bottom:6px;">
        ${meta.desc || 'No description available.'}
      </div>
      <div style="display:flex; justify-content:space-between; font-size:9px; font-weight:bold; color:#63d8d1; border-top:1px solid rgba(255,255,255,0.08); padding-top:4px;">
        <span>Owned: ${count}</span>
        ${sellPrice ? `<span>Price: ${sellPrice}g</span>` : ''}
      </div>
    `;

    tooltip.style.opacity = '1';
    this._moveHoverTooltip(event);
  }

  _moveHoverTooltip(event) {
    const tooltip = document.getElementById('inventory-tooltip');
    if (!tooltip) return;

    const mouseX = event.clientX;
    const mouseY = event.clientY;

    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;

    let posX = mouseX + 15;
    let posY = mouseY + 15;

    if (posX + tooltipWidth > window.innerWidth) {
      posX = mouseX - tooltipWidth - 15;
    }
    if (posY + tooltipHeight > window.innerHeight) {
      posY = mouseY - tooltipHeight - 15;
    }

    tooltip.style.left = `${posX}px`;
    tooltip.style.top = `${posY}px`;
  }

  _hideHoverTooltip() {
    const tooltip = document.getElementById('inventory-tooltip');
    if (tooltip) {
      tooltip.style.opacity = '0';
    }
  }

  updateProductionDashboard() {
    const ratesContainer = document.getElementById('production-dashboard-rates');
    if (!ratesContainer) return;

    this._updateActiveDronesCount();

    if (!this.deviceManager) {
      ratesContainer.innerHTML = '<span style="color:#4a7c59; font-style:italic;">No active production rates benched.</span>';
      return;
    }

    const runningDrones = this.deviceManager.getAll().filter(d => d.status === 'running');
    if (runningDrones.length === 0) {
      ratesContainer.innerHTML = '<span style="color:#4a7c59; font-style:italic;">No active production rates benched.</span>';
      return;
    }

    // Sum up rates
    const summedRates = {};
    runningDrones.forEach(drone => {
      if (drone.productionRates) {
        for (const [itemId, ratePerMinute] of Object.entries(drone.productionRates)) {
          summedRates[itemId] = (summedRates[itemId] || 0) + ratePerMinute;
        }
      }
    });

    const ratesEntries = Object.entries(summedRates);
    if (ratesEntries.length === 0) {
      ratesContainer.innerHTML = '<span style="color:#93a7a1; font-style:italic;">Drones running (calibrating rates)...</span>';
      return;
    }

    ratesContainer.innerHTML = ratesEntries.map(([itemId, ratePerMinute]) => {
      const meta = ITEM_METADATA[itemId] || { name: itemId, emoji: '' };
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; margin-top:2px;">
          <span>${pixelIcon(itemId)} ${meta.name}:</span>
          <span style="color:#63d8d1; font-weight:bold;">+${ratePerMinute.toFixed(1)} / min</span>
        </div>
      `;
    }).join('');
  }
}
