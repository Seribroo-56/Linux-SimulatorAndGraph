import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import minimist from 'minimist';
import { VirtualFileSystem } from '../services/VirtualFileSystem';

const MAN_PAGES: {[key: string]: string} = {
  ls: `NAME\n       ls - list directory contents\n\nSYNOPSIS\n       ls [OPTION]... [FILE]...\n\nDESCRIPTION\n       List information about the FILEs (the current directory by default).\n       -l     use a long listing format`,
  cd: `NAME\n       cd - change the shell working directory\n\nSYNOPSIS\n       cd [dir]\n\nDESCRIPTION\n       Change the current directory to DIR.`,
  pwd: `NAME\n       pwd - print name of current/working directory\n\nSYNOPSIS\n       pwd`,
  chmod: `NAME\n       chmod - change file mode bits\n\nSYNOPSIS\n       chmod OCTAL-MODE FILE...`,
  grep: `NAME\n       grep - print lines that match patterns\n\nSYNOPSIS\n       grep PATTERN [FILE...]`,
  git: `NAME\n       git - the stupid content tracker\n\nSYNOPSIS\n       git [--version] <command> [<args>]`,
  nano: `NAME\n       nano - Nano's ANOther editor, an enhanced free Pico clone`,
  sudo: `NAME\n       sudo - execute a command as another user`,
  ping: `NAME\n       ping - send ICMP ECHO_REQUEST to network hosts`,
  echo: `NAME\n       echo - display a line of text\n\nDESCRIPTION\n       Supports redirection > to files.`,
  help: `NAME\n       help - display information about builtin commands`,
  clear: `NAME\n       clear - clear the terminal screen`,
  rm: `NAME\n       rm - remove files or directories\n\nSYNOPSIS\n       rm [OPTION]... [FILE]...\n\nOPTIONS\n       -r, -R   remove directories and their contents recursively`,
  mv: `NAME\n       mv - move (rename) files\n\nSYNOPSIS\n       mv [OPTION]... SOURCE... DEST`
};

enum InputMode {
  COMMAND,
  PASSWORD,
  EDITOR,
  PROCESS
}

export interface TerminalControllerRef {
  runCommand: (command: string) => void;
}

interface TerminalControllerProps {
  onStatusChange?: (status: string) => void;
  fileSystem: VirtualFileSystem;
  onMutation: () => void;
  onPush?: () => void;
  isVisible: boolean;
}

const TerminalController = forwardRef<TerminalControllerRef, TerminalControllerProps>(({ onStatusChange, fileSystem, onMutation, onPush, isVisible }, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const commandRef = useRef<string>("");
  const passwordBufferRef = useRef<string>("");
  
  // State refs
  const inputModeRef = useRef<InputMode>(InputMode.COMMAND);
  const sudoPendingCommandRef = useRef<string | null>(null);
  const processIntervalRef = useRef<number | null>(null);
  
  // Editor State
  const editorContentRef = useRef<string[]>([]);
  const editorFilePathRef = useRef<string>("");
  
  // History
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  // Trigger fit when visibility changes
  useEffect(() => {
    if (isVisible && fitAddonRef.current) {
        // Short delay to allow layout to settle
        setTimeout(() => {
            fitAddonRef.current?.fit();
            xtermRef.current?.focus();
        }, 50);
    }
  }, [isVisible]);

  // --- Helper Functions ---

  const prompt = useCallback(() => {
    if (!xtermRef.current) return;
    const path = fileSystem.currentPath;
    // Friendly Colors
    // \x1b[1;34m (Blue) -> \x1b[38;5;110m (Soft Blue)
    // \x1b[1;32m (Green) -> \x1b[38;5;150m (Soft Green)
    xtermRef.current.write(`\r\n\x1b[38;5;110mrunner@tyrell-node\x1b[0m:\x1b[38;5;150m${path}\x1b[0m$ `);
  }, [fileSystem]);

  const executeCommandLogic = useCallback((fullCmd: string, user: string): string[] => {
      // Tokenize respecting quotes
      const parts = fullCmd.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g)?.map(s => s.replace(/^['"]|['"]$/g, '')) || [];
      if (parts.length === 0) return [];

      const cmd = parts[0];
      const rawArgs = parts.slice(1);
      // @ts-ignore
      const argv = minimist(rawArgs);
      const output: string[] = [];
      
      let mutated = false;

      switch (cmd) {
        case 'ls':
          const files = fileSystem.ls(argv._[0], argv.l, user);
          output.push(...files);
          break;
        case 'cd':
          const resCd = fileSystem.cd(argv._[0], user);
          if (resCd) output.push(resCd.startsWith('bash:') ? `\x1b[31m${resCd}\x1b[0m` : resCd);
          break;
        case 'pwd':
          output.push(fileSystem.currentPath);
          break;
        case 'mkdir':
          const resMkdir = fileSystem.mkdir(argv._[0], user);
          if (resMkdir) output.push(`\x1b[31m${resMkdir}\x1b[0m`);
          else mutated = true;
          break;
        case 'rmdir':
           const resRmdir = fileSystem.rmdir(argv._[0], user);
           if (resRmdir) output.push(`\x1b[31m${resRmdir}\x1b[0m`);
           else mutated = true;
           break;
        case 'touch':
          const resTouch = fileSystem.touch(argv._[0], user);
          if (resTouch) output.push(`\x1b[31m${resTouch}\x1b[0m`);
          else mutated = true;
          break;
        case 'rm':
          const resRm = fileSystem.rm(argv._[0], argv.r || argv.R, user);
          if (resRm) output.push(`\x1b[31m${resRm}\x1b[0m`);
          else mutated = true;
          break;
        case 'cp':
          const resCp = fileSystem.cp(argv._[0], argv._[1], user);
          if (resCp) output.push(`\x1b[31m${resCp}\x1b[0m`);
          else mutated = true;
          break;
        case 'mv':
          const resMv = fileSystem.mv(argv._[0], argv._[1], user);
          if (resMv) output.push(`\x1b[31m${resMv}\x1b[0m`);
          else mutated = true;
          break;
        case 'chmod':
          const resChmod = fileSystem.chmod(argv._[1], argv._[0], user);
          if (resChmod) output.push(`\x1b[31m${resChmod}\x1b[0m`);
          else mutated = true;
          break;
        case 'cat':
          const resCat = fileSystem.cat(argv._[0], user);
          if (resCat.startsWith('cat:')) output.push(`\x1b[31m${resCat}\x1b[0m`);
          else output.push(resCat);
          break;
        case 'grep':
          const resGrep = fileSystem.grep(argv._[0], argv._[1], user);
          if (resGrep.startsWith('grep:')) output.push(`\x1b[31m${resGrep}\x1b[0m`);
          else if (resGrep) output.push(resGrep);
          break;
        case 'find':
          output.push(...fileSystem.find(argv._[0] || '.', argv.name, user));
          break;
        case 'stat':
           output.push(fileSystem.stat(argv._[0]));
           break;
        case 'tree':
           output.push(...fileSystem.tree(argv._[0] || '.', user));
           break;
        case 'whoami':
          output.push(user);
          break;
        case 'hostname':
          output.push('tyrell-node-42');
          break;
        case 'echo':
          output.push(argv._.join(' '));
          break;
        case 'man':
          output.push(MAN_PAGES[argv._[0]] || `No manual entry for ${argv._[0]}`);
          break;
        case 'git':
          const res = fileSystem.handleGit(argv, user);
          output.push(...res);
          mutated = true;
          if (argv._[0] === 'push' && res.length > 0 && !res[0].startsWith('fatal')) {
              onPush?.();
          }
          break;
        case 'history':
          historyRef.current.forEach((h, i) => output.push(`${i+1}  ${h}`));
          break;
        case 'clear':
          // Handled visually
          break;
        case 'help':
          output.push('GNU bash, version 5.0.17(1)-release (x86_64-pc-linux-gnu)');
          output.push('These shell commands are defined internally.  Type `help` to see this list.');
          output.push('Type `help name` to find out more about the function `name`.');
          output.push('');
          output.push('  ls [OPTION]... [FILE]...   List directory contents');
          output.push('  cd [dir]                   Change the shell working directory');
          output.push('  pwd                        Print name of current/working directory');
          output.push('  mkdir DIR...               Create the DIRECTORY(ies), if they do not already exist');
          output.push('  rmdir DIR...               Remove the DIRECTORY(ies), if they are empty');
          output.push('  touch FILE...              Update the access and modification times of each FILE');
          output.push('  rm [OPTION]... [FILE]...   Remove (unlink) the FILE(s)');
          output.push('  cp [OPTION]... SOURCE...   Copy SOURCE to DEST');
          output.push('  mv [OPTION]... SOURCE...   Rename SOURCE to DEST');
          output.push('  chmod MODE FILE...         Change the mode of each FILE to MODE');
          output.push('  cat [FILE]...              Concatenate FILE(s) to standard output');
          output.push('  grep PATTERN [FILE]...     Search for PATTERN in each FILE');
          output.push('  echo [arg ...]             Write arguments to the standard output');
          output.push('  nano [FILE]                Simple text editor');
          output.push('  sudo [COMMAND]             Execute a command as another user');
          output.push('  ping [HOST]                Send ICMP ECHO_REQUEST to network hosts');
          output.push('  git                        The stupid content tracker');
          output.push('  stat [FILE]                Display file status');
          output.push('  tree [DIR]                 List contents of directories in a tree-like format');
          output.push('  whoami                     Print effective user name');
          output.push('  hostname                   Print the system hostname');
          output.push('  man [COMMAND]              Format and display the on-line manual pages');
          output.push('  clear                      Clear the terminal screen');
          output.push('  history                    Display the command history list');
          output.push('  help                       Display this help text');
          break;
        default:
          output.push(`bash: ${cmd}: command not found`);
      }
      
      if (mutated) onMutation();
      return output;
  }, [fileSystem, onMutation, onPush]);

  // ... (rest of helper functions and useEffects)
  
  const renderNano = useCallback(() => {
      const term = xtermRef.current;
      if (!term) return;

      term.clear();
      term.writeln(`\x1b[7m  GNU nano 4.8                        File: ${editorFilePathRef.current}                                      \x1b[0m`);
      term.writeln('');
      
      // Print content
      editorContentRef.current.forEach(line => term.writeln(line));
      
      // Print Footer at bottom
      term.write('\x1b[22;1H'); // Move to roughly bottom
      term.writeln(`\x1b[7m^X Exit/Save                                                                                        \x1b[0m`);
  }, []);

  const handleCommand = useCallback((rawInput: string) => {
      const term = xtermRef.current;
      if (!term) return;

      // Check for sudo
      if (rawInput.trim().startsWith('sudo ')) {
        sudoPendingCommandRef.current = rawInput.trim().substring(5);
        inputModeRef.current = InputMode.PASSWORD;
        term.write('[sudo] password for runner: ');
        return;
      }

      // Check for Nano
      if (rawInput.trim().startsWith('nano ')) {
        const parts = rawInput.trim().split(' ');
        if (parts.length < 2) {
          term.writeln('nano: missing filename');
          prompt();
          return;
        }
        const fileName = parts[1];
        const existingContent = fileSystem.cat(fileName);
        
        // Initialize Editor Mode
        inputModeRef.current = InputMode.EDITOR;
        editorFilePathRef.current = fileName;
        editorContentRef.current = existingContent.startsWith('cat:') ? [] : existingContent.split('\n');
        
        // Render Editor UI
        renderNano();
        return;
      }

      // Check for Ping
      if (rawInput.trim().startsWith('ping ')) {
        inputModeRef.current = InputMode.PROCESS;
        const target = rawInput.split(' ')[1] || 'unknown';
        term.writeln(`PING ${target} (56) 56(84) bytes of data.`);
        
        let seq = 1;
        processIntervalRef.current = window.setInterval(() => {
          // Check if term is still valid (it might have been disposed if component unmounted, but cleanup handles interval)
          // We use xtermRef.current to be safe
          xtermRef.current?.writeln(`64 bytes from ${target}: icmp_seq=${seq++} ttl=118 time=${(Math.random()*10 + 10).toFixed(1)} ms`);
        }, 1000);
        return;
      }

      // Standard Command Processing with Redirection
      const [cmdPart, redirectFile] = rawInput.split('>').map(s => s.trim());
      
      const outputLines = executeCommandLogic(cmdPart, 'runner');
      
      if (redirectFile) {
        // Redirection Mode
        const content = outputLines.join('\n');
        const err = fileSystem.writeFile(redirectFile, content, 'runner');
        if (err) term.writeln(`\x1b[31m${err}\x1b[0m`);
        else onMutation(); // Write file is mutation
      } else {
        // Standard Output Mode
        outputLines.forEach(line => term.writeln(line));
      }
      
      if (rawInput.trim() === 'clear') term.clear();
      
      prompt();
  }, [fileSystem, onMutation, executeCommandLogic, prompt, renderNano]);

  // Use refs to store the latest versions of callback functions
  // This allows the event listener in useEffect to access fresh logic without re-running the effect
  const interactiveRefs = useRef({
      handleCommand,
      executeCommandLogic,
      prompt,
      renderNano
  });

  // Sync refs on render
  useEffect(() => {
      interactiveRefs.current = {
          handleCommand,
          executeCommandLogic,
          prompt,
          renderNano
      };
  }, [handleCommand, executeCommandLogic, prompt, renderNano]);

  // Exposed method for external command execution
  useImperativeHandle(ref, () => ({
    runCommand: (command: string) => {
        if (!xtermRef.current) return;
        
        // Visual echo
        xtermRef.current.write(`${command}\r\n`);
        
        // Execute
        handleCommand(command);
    }
  }));

  // Main Initialization Effect - Runs Once
  useEffect(() => {
    if (!terminalRef.current) return;

    // Wait slightly to ensure container is rendered with final size
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"Fira Code", monospace',
      fontSize: 16,
      theme: {
        background: '#293134', // Dark Grey from Learn Git Branching
        foreground: '#D8D8D8', // Softer White
        cursor: '#D8D8D8',
        selectionBackground: '#5e7279',
        black: '#293134',
        red: '#ff5f56', // Matching dots
        green: '#27c93f',
        yellow: '#ffbd2e',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#ffffff',
      },
      convertEol: true,
      scrollback: 1000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    // Add padding via xterm container style or xterm options
    // Using simple padding in the div works, but xterm needs to fit inside it.
    term.open(terminalRef.current);
    
    // Wrapper for safe fitting
    const fitTerminal = () => {
      if (terminalRef.current && fitAddon) {
        window.requestAnimationFrame(() => {
           try {
             fitAddon.fit();
           } catch(e) {
             console.error("Fit error", e);
           }
        });
      }
    };

    fitTerminal();
    
    // Re-fit when fonts are loaded
    document.fonts.ready.then(() => {
      fitTerminal();
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // --- Boot ---
    const boot = async () => {
      term.writeln('\x1b[33mInitializing Linux Simulator 2024...\x1b[0m');
      setTimeout(() => {
          term.writeln('Kernel: \x1b[32mOK\x1b[0m');
          term.writeln('');
          term.writeln('Welcome to the simulation. Type "help" to begin.');
          onStatusChange?.('CONNECTED');
          interactiveRefs.current.prompt();
      }, 500);
    };

    boot();

    // --- Input Listener ---
    term.onData((data) => {
      const mode = inputModeRef.current;
      const { handleCommand, executeCommandLogic, prompt, renderNano } = interactiveRefs.current;

      // --- PROCESS MODE (PING) ---
      if (mode === InputMode.PROCESS) {
        if (data === '\x03') { // Ctrl+C
          if (processIntervalRef.current) clearInterval(processIntervalRef.current);
          processIntervalRef.current = null;
          inputModeRef.current = InputMode.COMMAND;
          term.writeln('^C');
          prompt();
        }
        return;
      }

      // --- EDITOR MODE (NANO) ---
      if (mode === InputMode.EDITOR) {
        if (data === '\x18') { // Ctrl+X
           // Save and Exit
           const content = editorContentRef.current.join('\n');
           const err = fileSystem.writeFile(editorFilePathRef.current, content, 'runner');
           
           inputModeRef.current = InputMode.COMMAND;
           term.clear();
           if (err) term.writeln(`\x1b[31mError saving file: ${err}\x1b[0m`);
           else {
               term.writeln(`\x1b[32mFile '${editorFilePathRef.current}' saved.\x1b[0m`);
               // onMutation also refers to initial onMutation prop. 
               // If handleFsMutation in App wasn't memoized (it wasn't before, now it is), this would be stale.
               // But we are fixing App.tsx too.
               // However, to be strictly correct with the Ref pattern:
               onMutation(); 
           }
           
           prompt();
           return;
        }

        const code = data.charCodeAt(0);
        if (code === 13) { // Enter
          editorContentRef.current.push("");
          renderNano();
        } else if (code === 127 || code === 8) { // Backspace
          const lastLineIdx = editorContentRef.current.length - 1;
          if (lastLineIdx >= 0) {
            const line = editorContentRef.current[lastLineIdx];
            if (line.length > 0) {
              editorContentRef.current[lastLineIdx] = line.slice(0, -1);
            } else if (editorContentRef.current.length > 1) {
              editorContentRef.current.pop();
            }
          }
          renderNano();
        } else if (code >= 32) { // Printable
          if (editorContentRef.current.length === 0) editorContentRef.current.push("");
          const lastLineIdx = editorContentRef.current.length - 1;
          editorContentRef.current[lastLineIdx] += data;
          renderNano();
        }
        return;
      }

      // --- PASSWORD MODE (SUDO) ---
      if (mode === InputMode.PASSWORD) {
        const code = data.charCodeAt(0);
        if (code === 13) { // Enter
           term.writeln(''); // Newline
           inputModeRef.current = InputMode.COMMAND;
           
           if (passwordBufferRef.current === 'admin') {
               // Success - Execute pending command as root
               const cmd = sudoPendingCommandRef.current!;
               // Redirect logic for sudo commands
               const [cmdPart, redirectFile] = cmd.split('>').map(s => s.trim());
               // Use the fresh executeCommandLogic from Ref
               const output = executeCommandLogic(cmdPart, 'root');
               
               if (redirectFile) {
                   const err = fileSystem.writeFile(redirectFile, output.join('\n'), 'root');
                   if (err) term.writeln(`\x1b[31m${err}\x1b[0m`);
                   else onMutation();
               } else {
                   output.forEach(l => term.writeln(l));
               }
           } else {
               term.writeln('\x1b[31mSorry, try again.\x1b[0m');
           }
           
           passwordBufferRef.current = "";
           sudoPendingCommandRef.current = null;
           prompt();
        } else if (code === 127 || code === 8) {
           passwordBufferRef.current = passwordBufferRef.current.slice(0, -1);
        } else if (code >= 32) {
           passwordBufferRef.current += data;
           // No echo for password
        }
        return;
      }

      // --- COMMAND MODE ---
      const code = data.charCodeAt(0);
      
      const performVisualBackspace = () => {
        if (term.buffer.active.cursorX > 0) {
          term.write('\b \b');
        } else {
          // Wrapped line backspace: Move up, move to last column, erase char.
          // \x1b[A = Cursor Up
          // \x1b[nG = Cursor Horizontal Absolute (1-based)
          // \x1b[1X = Erase Character (clear without moving cursor)
          term.write(`\x1b[A\x1b[${term.cols}G\x1b[1X`);
        }
      };

      if (code === 13) { // Enter
        term.write('\r\n');
        const cmd = commandRef.current.trim();
        if (cmd) {
          if (historyRef.current[historyRef.current.length - 1] !== cmd) {
            historyRef.current.push(cmd);
          }
          historyIndexRef.current = historyRef.current.length;
          // Use fresh handleCommand from Ref
          handleCommand(cmd);
        } else {
          prompt();
        }
        commandRef.current = "";
      } 
      else if (code === 127 || code === 8) { // Backspace
        if (commandRef.current.length > 0) {
          commandRef.current = commandRef.current.slice(0, -1);
          performVisualBackspace();
        }
      } 
      else if (data === '\x1b[A') { // Up Arrow
         if (historyRef.current.length > 0 && historyIndexRef.current > 0) {
            historyIndexRef.current--;
            const hist = historyRef.current[historyIndexRef.current];
            // Clear current line
            while(commandRef.current.length > 0) {
                performVisualBackspace();
                commandRef.current = commandRef.current.slice(0, -1);
            }
            term.write(hist);
            commandRef.current = hist;
         }
      }
      else if (data === '\x1b[B') { // Down Arrow
         if (historyIndexRef.current < historyRef.current.length - 1) {
            historyIndexRef.current++;
            const hist = historyRef.current[historyIndexRef.current];
            while(commandRef.current.length > 0) {
                performVisualBackspace();
                commandRef.current = commandRef.current.slice(0, -1);
            }
            term.write(hist);
            commandRef.current = hist;
         } else {
            while(commandRef.current.length > 0) {
                performVisualBackspace();
                commandRef.current = commandRef.current.slice(0, -1);
            }
         }
      }
      else if (code >= 32) {
        commandRef.current += data;
        term.write(data);
      }
    });

    // Replace basic resize listener with ResizeObserver to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
        fitTerminal();
    });
    if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current);
    }
    
    // Also listen to window resize as a fallback
    window.addEventListener('resize', fitTerminal);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', fitTerminal);
      if (processIntervalRef.current) clearInterval(processIntervalRef.current);
      term.dispose();
    };
  }, []); // Empty dependencies = run only on mount

  return (
      <div className="w-full h-full p-2 overflow-hidden">
        <div className="w-full h-full" ref={terminalRef} />
      </div>
  );
});

export default TerminalController;