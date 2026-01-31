
export interface VFSNode {
  type: 'file' | 'directory';
  content?: string;
  children?: { [key: string]: VFSNode };
  permissions?: string; // e.g. "drwxr-xr-x"
  owner?: string;
  size?: number;
  modified?: string;
}

interface GitCommit {
  id: string;
  message: string;
  author: string;
  timestamp: string;
  parentId: string | null;
  files: string[]; // Snapshot of files tracked in this commit
}

export class GitSimulator {
  private isInitialized: boolean = false;
  private stagingArea: Set<string> = new Set();
  private commits: Map<string, GitCommit> = new Map();
  private branches: Map<string, string | null> = new Map(); // branchName -> commitId
  private HEAD: string = 'main'; // Current branch name
  private repoRoot: string | null = null;

  constructor() {
    this.branches.set('main', null);
  }

  public getRepoRoot(): string | null {
      return this.repoRoot;
  }

  public getHead(): string {
      return this.HEAD;
  }

  // --- Helper for UI ---
  getFileStatus(path: string): 'staged' | 'untracked' | 'clean' {
      if (!this.isInitialized) return 'clean'; // No git repo, treat as normal
      if (path.includes('/.git')) return 'clean'; // Ignore git internals

      // Note: The UI GraphView handles checking if path is inside repoRoot
      // But for correctness we check here too, although GraphView overrides it.
      if (this.repoRoot && !path.startsWith(this.repoRoot)) return 'clean';

      if (this.stagingArea.has(path)) return 'staged';

      const currentCommitId = this.branches.get(this.HEAD);
      const currentCommit = currentCommitId ? this.commits.get(currentCommitId) : null;
      const trackedFiles = currentCommit ? new Set(currentCommit.files) : new Set();

      if (trackedFiles.has(path)) return 'clean';

      return 'untracked';
  }

  execute(argv: any, vfs: VirtualFileSystem, currentPath: string, user: string): string[] {
    const command = argv._[0];

    // Handle global flags and commands that don't require a repo
    if (argv.version || command === 'version') {
        return [`git version 2.25.1`];
    }

    if (argv.help || !command) {
        return [
            `usage: git [--version] [--help] [-C <path>] [-c <name>=<value>]`,
            `           [--exec-path[=<path>]] [--html-path] [--man-path] [--info-path]`,
            `           [-p | --paginate | -P | --no-pager] [--no-replace-objects] [--bare]`,
            `           [--git-dir=<path>] [--work-tree=<path>] [--namespace=<name>]`,
            `           <command> [<args>]`,
            ``,
            `These are common Git commands used in various situations:`,
            ``,
            `start a working area (see also: git help tutorial)`,
            `   clone      Clone a repository into a new directory`,
            `   init       Create an empty Git repository or reinitialize an existing one`,
            ``,
            `work on the current change (see also: git help everyday)`,
            `   add        Add file contents to the index`,
            `   mv         Move or rename a file, a directory, or a symlink`,
            `   restore    Restore working tree files`,
            `   rm         Remove files from the working tree and from the index`,
            ``,
            `examine the history and state (see also: git help revisions)`,
            `   bisect     Use binary search to find the commit that introduced a bug`,
            `   diff       Show changes between commits, commit and working tree, etc`,
            `   grep       Print lines matching a pattern`,
            `   log        Show commit logs`,
            `   show       Show various types of objects`,
            `   status     Show the working tree status`,
            ``,
            `grow, mark and tweak your common history`,
            `   branch     List, create, or delete branches`,
            `   commit     Record changes to the repository`,
            `   merge      Join two or more development histories together`,
            `   rebase     Reapply commits on top of another base tip`,
            `   reset      Reset current HEAD to the specified state`,
            `   switch     Switch branches`,
            `   tag        Create, list, delete or verify a tag object signed with GPG`,
            ``,
            `collaborate (see also: git help workflows)`,
            `   fetch      Download objects and refs from another repository`,
            `   pull       Fetch from and integrate with another repository or a local branch`,
            `   push       Update remote refs along with associated objects`,
            ``,
            `'git help -a' and 'git help -g' list available subcommands and some`,
            `concept guides. See 'git help <command>' or 'git help <concept>'`,
            `to read about a specific subcommand or concept.`
        ];
    }

    if (command === 'init') return this.init(currentPath);
    
    if (!this.isInitialized) {
      return [`fatal: not a git repository (or any of the parent directories): .git`];
    }

    // Enforce running git commands from the root or subdirectories (simplified: assuming single repo at root for game)
    // Realistically we would check if currentPath is inside repoRoot.
    
    switch (command) {
      case 'status':
        return this.status(vfs, currentPath);
      case 'add':
        return this.add(argv._[1], vfs, currentPath);
      case 'commit':
        const msg = argv.m || "update";
        return this.commit(msg, user);
      case 'log':
        return this.log();
      case 'branch':
        return this.branch(argv._[1]);
      case 'checkout':
        const branchName = argv._[1] || argv.b; // support checkout -b logic if we wanted, but simplistic for now
        return this.checkout(branchName);
      case 'merge':
        return this.merge(argv._[1]);
      case 'push':
        return this.push(argv._[1]);
      default:
        return [`git: '${command}' is not a git command. See 'git --help'.`];
    }
  }

  private init(path: string): string[] {
    if (this.isInitialized) {
      return [`Reinitialized existing Git repository in ${path}/.git/`];
    }
    this.isInitialized = true;
    this.repoRoot = path;
    this.branches.set('main', null);
    this.HEAD = 'main';
    return [`Initialized empty Git repository in ${path}/.git/`];
  }

  private status(vfs: VirtualFileSystem, currentPath: string): string[] {
    const output: string[] = [];
    const currentCommitId = this.branches.get(this.HEAD);
    const currentCommit = currentCommitId ? this.commits.get(currentCommitId) : null;
    const trackedFiles = currentCommit ? new Set(currentCommit.files) : new Set();

    // Get all files in VFS
    // We search within the repoRoot
    const searchPath = this.repoRoot || currentPath;
    const allFiles = vfs.find(searchPath); 
    
    output.push(`On branch ${this.HEAD}`);
    
    if (!currentCommit) {
      output.push(`No commits yet`);
    }

    output.push(``);

    // 1. Changes to be committed (Staged)
    if (this.stagingArea.size > 0) {
      output.push(`Changes to be committed:`);
      output.push(`  (use "git rm --cached <file>..." to unstage)`);
      this.stagingArea.forEach(file => {
        // Strip the repoRoot for display
        const display = file.replace((this.repoRoot || '') + '/', '');
        output.push(`\t\x1b[32mnew file:   ${display}\x1b[0m`);
      });
      output.push(``);
    }

    // 2. Untracked files (In VFS, not in Staging, not in HEAD)
    const untracked: string[] = [];
    allFiles.forEach(f => {
      // Ensure file is inside repoRoot
      if (this.repoRoot && !f.startsWith(this.repoRoot)) return;

      // Normalize path check
      if (!this.stagingArea.has(f) && !trackedFiles.has(f) && !f.includes('/.git')) {
         const display = f.replace((this.repoRoot || '') + '/', '');
         untracked.push(display);
      }
    });

    if (untracked.length > 0) {
      output.push(`Untracked files:`);
      output.push(`  (use "git add <file>..." to include in what will be committed)`);
      untracked.forEach(f => {
        output.push(`\t\x1b[31m${f}\x1b[0m`);
      });
      output.push(``);
    }

    if (this.stagingArea.size === 0 && untracked.length === 0) {
      output.push(`nothing to commit, working tree clean`);
    }

    return output;
  }

  private add(filename: string, vfs: VirtualFileSystem, currentPath: string): string[] {
    if (!filename) return [`Nothing specified, nothing added.`];

    if (filename === '.') {
      const searchPath = this.repoRoot || currentPath;
      const allFiles = vfs.find(searchPath);
      let count = 0;
      allFiles.forEach(f => {
        if (!f.includes('/.git')) {
          this.stagingArea.add(f);
          count++;
        }
      });
      return []; // git add . is usually silent on success
    }
    
    const fullPath = filename.startsWith('/') ? filename : `${currentPath}/${filename}`;
    // Simple verification check
    const check = vfs.ls(fullPath); 
    if (check[0] && check[0].startsWith('ls: cannot')) {
        return [`fatal: pathspec '${filename}' did not match any files`];
    }

    // Ensure we are adding something inside the repo
    if (this.repoRoot && !fullPath.startsWith(this.repoRoot)) {
        return [`fatal: ${filename}: outside repository`];
    }

    this.stagingArea.add(fullPath);
    return [];
  }

  private commit(message: string, user: string): string[] {
    if (this.stagingArea.size === 0) {
      return [`On branch ${this.HEAD}`, `nothing to commit, working tree clean`];
    }

    const parentId = this.branches.get(this.HEAD);
    const parentCommit = parentId ? this.commits.get(parentId) : null;
    
    // Inherit tracked files from parent, then overlay staging
    const newFileSet = new Set(parentCommit ? parentCommit.files : []);
    this.stagingArea.forEach(f => newFileSet.add(f));

    const commitId = Math.random().toString(16).substring(2, 9);
    const newCommit: GitCommit = {
      id: commitId,
      message: message,
      author: `${user} <${user}@tyrell.com>`,
      timestamp: new Date().toString().split(' ').slice(0,5).join(' '),
      parentId: parentId || null,
      files: Array.from(newFileSet)
    };

    this.commits.set(commitId, newCommit);
    this.branches.set(this.HEAD, commitId);
    
    const changedCount = this.stagingArea.size;
    this.stagingArea.clear();

    return [
      `[${this.HEAD} ${commitId}] ${message}`,
      ` ${changedCount} file(s) changed`
    ];
  }

  private log(): string[] {
    let currentId = this.branches.get(this.HEAD);
    const output: string[] = [];

    if (!currentId) {
      return [`fatal: your current branch '${this.HEAD}' does not have any commits yet`];
    }

    while (currentId) {
      const c = this.commits.get(currentId);
      if (!c) break;

      output.push(`\x1b[33mcommit ${c.id}\x1b[0m`);
      output.push(`Author: ${c.author}`);
      output.push(`Date:   ${c.timestamp}`);
      output.push(``);
      output.push(`    ${c.message}`);
      output.push(``);

      currentId = c.parentId;
    }

    return output;
  }

  private branch(name: string): string[] {
    if (!name) return [`fatal: branch name required`];
    if (this.branches.has(name)) return [`fatal: A branch named '${name}' already exists.`];
    
    const currentCommit = this.branches.get(this.HEAD);
    this.branches.set(name, currentCommit || null);
    return [];
  }

  private checkout(name: string): string[] {
    if (!name) return [`fatal: branch name required`];
    if (!this.branches.has(name)) {
      return [`error: pathspec '${name}' did not match any file(s) known to git`];
    }

    this.HEAD = name;
    return [`Switched to branch '${name}'`];
  }

  private merge(targetBranch: string): string[] {
    if (!targetBranch) return [`fatal: branch name required`];
    if (!this.branches.has(targetBranch)) return [`merge: ${targetBranch} - not something we can merge`];

    const targetCommitId = this.branches.get(targetBranch);
    const currentCommitId = this.branches.get(this.HEAD);

    if (targetCommitId === currentCommitId) {
        return [`Already up to date.`];
    }

    // Simplistic Fast-Forward simulation
    this.branches.set(this.HEAD, targetCommitId || null);
    
    return [
        `Updating ${currentCommitId?.substring(0,6) || '000000'}..${targetCommitId?.substring(0,6)}`,
        `Fast-forward`,
        ` (simulated merge success)`
    ];
  }

  private push(remote: string): string[] {
    // Simulate push output
    return [
        `Enumerating objects: 5, done.`,
        `Counting objects: 100% (5/5), done.`,
        `Delta compression using up to 8 threads`,
        `Compressing objects: 100% (3/3), done.`,
        `Writing objects: 100% (3/3), 320 bytes | 320.00 KiB/s, done.`,
        `Total 3 (delta 2), reused 0 (delta 0)`,
        `To github.com:tyrell-corp/project-chimera.git`,
        `   ${this.branches.get(this.HEAD)?.substring(0,7) || '0000000'}..${Math.random().toString(16).substring(2,9)}  ${this.HEAD} -> ${this.HEAD}`
    ];
  }
}

export class VirtualFileSystem {
  private root: VFSNode;
  private pathStack: string[];
  private previousPathStack: string[] | null = null;
  private gitSimulator = new GitSimulator();
// ... (rest of class remains unchanged)
  constructor() {
    this.root = {
      type: 'directory',
      permissions: 'drwxr-xr-x',
      owner: 'root',
      children: {
        'home': {
          type: 'directory',
          permissions: 'drwxr-xr-x',
          owner: 'root',
          children: {
            'runner': {
              type: 'directory',
              permissions: 'drwxr-xr-x',
              owner: 'runner',
              children: {
                'welcome.txt': {
                    type: 'file',
                    content: "Welcome to the Tyrell Node.\nUnauthorized access is a felony.\n\nType 'help' for available commands.",
                    permissions: '-rw-r--r--',
                    owner: 'runner',
                    size: 102
                },
                'tools': {
                    type: 'directory',
                    permissions: 'drwxr-xr-x',
                    owner: 'runner',
                    children: {
                        'decoder.sh': {
                            type: 'file',
                            content: "#!/bin/bash\n# Decodes corporate cyphers\necho 'Decoding...'",
                            permissions: '-rwxr-xr-x',
                            owner: 'runner',
                            size: 45
                        }
                    }
                }
              }
            }
          }
        },
        'var': {
            type: 'directory',
            permissions: 'drwxr-xr-x',
            owner: 'root',
            children: {
                'log': {
                    type: 'directory',
                    permissions: 'drwxr-xr-x',
                    owner: 'root',
                    children: {
                        'syslog': {
                            type: 'file',
                            content: "[CRITICAL] Project Chimera access attempted by user 'unknown'.\n[INFO] Sector 7 firewall integrity: 98%.",
                            permissions: '-rw-r-----',
                            owner: 'root',
                            size: 120
                        }
                    }
                }
            }
        },
        'opt': {
             type: 'directory',
             permissions: 'drwxr-xr-x',
             owner: 'root',
             children: {
                 'secure': {
                     type: 'directory',
                     permissions: 'drwx------',
                     owner: 'root',
                     children: {
                         'private.key': {
                             type: 'file',
                             content: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n(Encrypted content)",
                             permissions: '-r--------',
                             owner: 'root',
                             size: 1024
                         }
                     }
                 }
             }
        },
        'bin': {
            type: 'directory',
            permissions: 'drwxr-xr-x',
            owner: 'root',
            children: {} // Mock bin for realism
        }
      }
    };
    // Initialize user at /home/runner
    this.pathStack = ['home', 'runner'];
  }

  get currentPath(): string {
    return '/' + this.pathStack.join('/');
  }

  public getRoot(): VFSNode {
    return this.root;
  }
  
  public getGitSimulator(): GitSimulator {
      return this.gitSimulator;
  }

  // --- Helper Methods ---

  private getTimestamp(): string {
      const date = new Date();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const day = date.getDate();
      const time = date.toTimeString().slice(0, 5);
      return `${month} ${day} ${time}`;
  }

  private resolvePathSegments(path: string): string[] {
    if (!path) return [...this.pathStack];
    
    // Handle Absolute Path
    let segments = path.startsWith('/') ? [] : [...this.pathStack];
    const parts = path.split('/').filter(p => p.length > 0 && p !== '.');
    
    for (const part of parts) {
        if (part === '..') {
            if (segments.length > 0) segments.pop();
        } else {
            segments.push(part);
        }
    }
    return segments;
  }

  private getNode(segments: string[]): VFSNode | null {
    let current = this.root;
    for (const segment of segments) {
      if (current.children && current.children[segment]) {
        current = current.children[segment];
      } else {
        return null;
      }
    }
    return current;
  }

  private getParentNode(segments: string[]): { parent: VFSNode | null, name: string } {
      if (segments.length === 0) return { parent: null, name: '' };
      const parentSegments = segments.slice(0, -1);
      const name = segments[segments.length - 1];
      const parent = this.getNode(parentSegments);
      return { parent, name };
  }

  private checkAccess(node: VFSNode, mode: 'r' | 'w' | 'x', user: string = 'runner'): boolean {
      if (user === 'root') return true; // Root god mode

      const perms = node.permissions || '----------';
      let offset = 7; // Default to 'other' permissions (indices 7, 8, 9)
      
      if (node.owner === user) {
          offset = 1; // User permissions (indices 1, 2, 3)
      }
      
      if (mode === 'r') return perms[offset] === 'r';
      if (mode === 'w') return perms[offset + 1] === 'w';
      if (mode === 'x') return perms[offset + 2] === 'x';
      
      return false;
  }

  // --- Git Handler ---
  
  handleGit(argv: any, user: string): string[] {
      return this.gitSimulator.execute(argv, this, this.currentPath, user);
  }

  // --- File System Commands ---

  cd(path: string, user: string = 'runner'): string {
     if (path === '-') {
         if (!this.previousPathStack) return 'bash: cd: OLDPWD not set';
         const old = [...this.pathStack];
         this.pathStack = [...this.previousPathStack];
         this.previousPathStack = old;
         return '/' + this.pathStack.join('/');
     }

     const oldStack = [...this.pathStack];

     if (!path) {
         this.pathStack = ['home', 'runner'];
         this.previousPathStack = oldStack;
         return '';
     }
     
     const segments = this.resolvePathSegments(path);
     const node = this.getNode(segments);
     
     if (!node) return `bash: cd: ${path}: No such file or directory`;
     if (node.type !== 'directory') return `bash: cd: ${path}: Not a directory`;
     
     if (!this.checkAccess(node, 'x', user)) return `bash: cd: ${path}: Permission denied`;

     this.pathStack = segments;
     this.previousPathStack = oldStack;
     
     return '';
  }

  ls(path?: string, longFormat: boolean = false, user: string = 'runner'): string[] {
    const segments = path ? this.resolvePathSegments(path) : [...this.pathStack];
    const node = this.getNode(segments);
    
    if (!node) {
        return [`ls: cannot access '${path}': No such file or directory`];
    }
    if (node.type === 'directory') {
        if (!this.checkAccess(node, 'r', user)) return [`ls: cannot open directory '${path || '.'}': Permission denied`];
    }

    if (node.type !== 'directory') {
        const size = node.size || 0;
        const date = node.modified || '';
        let name = path?.split('/').pop() || '';
        if (node.permissions?.includes('x')) name = `\x1b[1;32m${name}\x1b[0m`;
        
        if (longFormat) {
             return [`${node.permissions} 1 ${node.owner} runner ${size.toString().padStart(6)} ${date} ${name}`];
        }
        return [name];
    }
    
    const keys = Object.keys(node.children || {}).sort();

    return keys.map(key => {
        const child = node.children![key];
        const size = child.size || 0;
        const date = child.modified || '';
        
        let displayName = key;
        if (child.type === 'directory') {
            displayName = `\x1b[1;34m${key}\x1b[0m`; 
        } else if (child.permissions?.includes('x')) {
            displayName = `\x1b[1;32m${key}\x1b[0m`; 
        }

        if (longFormat) {
            return `${child.permissions?.padEnd(10)} 1 ${child.owner?.padEnd(6) || 'root  '} runner ${size.toString().padStart(6)} ${date} ${displayName}`;
        }
        return displayName;
    });
  }

  mkdir(path: string, user: string = 'runner'): string {
    const segments = this.resolvePathSegments(path);
    const { parent, name } = this.getParentNode(segments);
    
    if (!parent) return `mkdir: cannot create directory '${path}': Invalid path`;
    if (parent.type !== 'directory') return `mkdir: cannot create directory '${path}': Not a directory`;
    
    if (!this.checkAccess(parent, 'w', user)) return `mkdir: cannot create directory '${path}': Permission denied`;

    if (!parent.children) parent.children = {};
    if (parent.children[name]) return `mkdir: cannot create directory '${path}': File exists`;

    parent.children[name] = {
      type: 'directory',
      permissions: 'drwxr-xr-x',
      owner: user,
      modified: this.getTimestamp(),
      children: {}
    };
    return '';
  }

  rmdir(path: string, user: string = 'runner'): string {
      const segments = this.resolvePathSegments(path);
      const { parent, name } = this.getParentNode(segments);
      
      if (!parent || !parent.children || !parent.children[name]) {
          return `rmdir: failed to remove '${path}': No such file or directory`;
      }
      
      if (!this.checkAccess(parent, 'w', user)) return `rmdir: failed to remove '${path}': Permission denied`;

      const target = parent.children[name];
      if (target.type !== 'directory') {
          return `rmdir: failed to remove '${path}': Not a directory`;
      }
      
      if (Object.keys(target.children || {}).length > 0) {
          return `rmdir: failed to remove '${path}': Directory not empty`;
      }
      
      delete parent.children[name];
      return '';
  }

  touch(path: string, user: string = 'runner'): string {
    const segments = this.resolvePathSegments(path);
    const { parent, name } = this.getParentNode(segments);

    if (!parent) return `touch: cannot touch '${path}': Invalid path`;
    if (parent.type !== 'directory') return `touch: cannot touch '${path}': Not a directory`;
    if (!parent.children) parent.children = {};

    if (parent.children[name]) {
        if (!this.checkAccess(parent.children[name], 'w', user)) return `touch: cannot touch '${path}': Permission denied`;
        parent.children[name].modified = this.getTimestamp();
    } else {
        if (!this.checkAccess(parent, 'w', user)) return `touch: cannot touch '${path}': Permission denied`;
        
        parent.children[name] = {
            type: 'file',
            content: '',
            permissions: '-rw-r--r--',
            owner: user,
            size: 0,
            modified: this.getTimestamp()
        };
    }
    return '';
  }

  writeFile(path: string, content: string, user: string = 'runner'): string {
      const segments = this.resolvePathSegments(path);
      const { parent, name } = this.getParentNode(segments);

      if (!parent) return `bash: ${path}: Invalid path`;
      if (parent.type !== 'directory') return `bash: ${path}: Not a directory`;
      if (!parent.children) parent.children = {};

      if (parent.children[name]) {
          const file = parent.children[name];
          if (file.type === 'directory') return `bash: ${path}: Is a directory`;
          if (!this.checkAccess(file, 'w', user)) return `bash: ${path}: Permission denied`;
          
          file.content = content;
          file.size = content.length;
          file.modified = this.getTimestamp();
      } else {
          if (!this.checkAccess(parent, 'w', user)) return `bash: ${path}: Permission denied`;
          
          parent.children[name] = {
              type: 'file',
              content: content,
              permissions: '-rw-r--r--',
              owner: user,
              size: content.length,
              modified: this.getTimestamp()
          };
      }
      return '';
  }

  cat(path: string, user: string = 'runner'): string {
      const segments = this.resolvePathSegments(path);
      const node = this.getNode(segments);
      if (!node) return `cat: ${path}: No such file or directory`;
      if (node.type === 'directory') return `cat: ${path}: Is a directory`;
      
      if (!this.checkAccess(node, 'r', user)) return `cat: ${path}: Permission denied`;

      return node.content || '';
  }

  rm(path: string, recursive: boolean = false, user: string = 'runner'): string {
      const segments = this.resolvePathSegments(path);
      if (segments.length === 0) return `rm: cannot remove root directory`;
      
      const { parent, name } = this.getParentNode(segments);
      if (!parent || !parent.children) return `rm: cannot remove '${path}': No such file or directory`;
      
      if (!this.checkAccess(parent, 'w', user)) return `rm: cannot remove '${path}': Permission denied`;

      const target = parent.children[name];
      if (!target) return `rm: cannot remove '${path}': No such file or directory`;
      
      if (target.type === 'directory' && !recursive) {
          return `rm: cannot remove '${path}': Is a directory`;
      }
      
      delete parent.children[name];
      return '';
  }

  cp(src: string, dest: string, user: string = 'runner'): string {
      const srcSegments = this.resolvePathSegments(src);
      const srcNode = this.getNode(srcSegments);
      
      if (!srcNode) return `cp: cannot stat '${src}': No such file or directory`;
      if (srcNode.type === 'directory') return `cp: -r not specified; omitting directory '${src}'`;
      
      if (!this.checkAccess(srcNode, 'r', user)) return `cp: cannot open '${src}' for reading: Permission denied`;

      const destSegments = this.resolvePathSegments(dest);
      let destParent: VFSNode | null = null;
      let destName = '';

      const potentialDestDir = this.getNode(destSegments);
      if (potentialDestDir && potentialDestDir.type === 'directory') {
          destParent = potentialDestDir;
          destName = srcSegments[srcSegments.length - 1]; 
      } else {
          const parentData = this.getParentNode(destSegments);
          destParent = parentData.parent;
          destName = parentData.name;
      }

      if (!destParent || destParent.type !== 'directory') return `cp: cannot create regular file '${dest}': Not a directory`;
      
      if (!this.checkAccess(destParent, 'w', user)) return `cp: cannot create regular file '${dest}': Permission denied`;

      if (!destParent.children) destParent.children = {};

      destParent.children[destName] = {
          ...srcNode,
          modified: this.getTimestamp(),
          owner: user
      };
      
      return '';
  }

  mv(src: string, dest: string, user: string = 'runner'): string {
      const srcSegments = this.resolvePathSegments(src);
      const { parent: srcParent, name: srcName } = this.getParentNode(srcSegments);
      
      if (!srcParent || !srcParent.children || !srcParent.children[srcName]) {
          return `mv: cannot stat '${src}': No such file or directory`;
      }
      
      if (!this.checkAccess(srcParent, 'w', user)) return `mv: cannot move '${src}': Permission denied`;

      const srcNode = srcParent.children[srcName];
      
      const destSegments = this.resolvePathSegments(dest);
      const destNode = this.getNode(destSegments);
      
      let finalDestParent: VFSNode | null = null;
      let finalDestName = '';

      if (destNode && destNode.type === 'directory') {
          finalDestParent = destNode;
          finalDestName = srcName;
      } else {
          const parentData = this.getParentNode(destSegments);
          finalDestParent = parentData.parent;
          finalDestName = parentData.name;
      }

      if (!finalDestParent || finalDestParent.type !== 'directory') {
          return `mv: cannot move '${src}' to '${dest}': Not a directory`;
      }
      
      if (!this.checkAccess(finalDestParent, 'w', user)) return `mv: cannot move '${src}' to '${dest}': Permission denied`;

      if (!finalDestParent.children) finalDestParent.children = {};

      finalDestParent.children[finalDestName] = srcNode;
      delete srcParent.children[srcName];
      
      return '';
  }

  chmod(path: string, mode: string, user: string = 'runner'): string {
      const segments = this.resolvePathSegments(path);
      const node = this.getNode(segments);

      if (!node) return `chmod: cannot access '${path}': No such file or directory`;
      
      // Permission Check: Only owner can change permissions (unless root)
      if (user !== 'root' && node.owner !== user) return `chmod: changing permissions of '${path}': Operation not permitted`;

      if (!/^[0-7]{3}$/.test(mode)) {
          return `chmod: invalid mode: '${mode}'`;
      }

      const map = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
      
      const u = map[parseInt(mode[0])];
      const g = map[parseInt(mode[1])];
      const o = map[parseInt(mode[2])];
      
      const typeChar = node.type === 'directory' ? 'd' : '-';
      node.permissions = `${typeChar}${u}${g}${o}`;
      
      return '';
  }

  grep(pattern: string, path: string, user: string = 'runner'): string {
      const segments = this.resolvePathSegments(path);
      const node = this.getNode(segments);

      if (!node) return `grep: ${path}: No such file or directory`;
      if (node.type === 'directory') return `grep: ${path}: Is a directory`;
      
      if (!this.checkAccess(node, 'r', user)) return `grep: ${path}: Permission denied`;

      const content = node.content || '';
      const lines = content.split('\n');
      
      try {
          const regex = new RegExp(pattern);
          const matches = lines.filter(line => regex.test(line));
          return matches.join('\n');
      } catch (e) {
          const matches = lines.filter(line => line.includes(pattern));
          return matches.join('\n');
      }
  }

  stat(path: string): string {
      const segments = this.resolvePathSegments(path);
      const node = this.getNode(segments);
      
      if (!node) return `stat: cannot stat '${path}': No such file or directory`;
      
      const fileName = segments[segments.length - 1] || 'root';
      const typeStr = node.type === 'directory' ? 'directory' : 'regular file';
      const size = node.size || (node.type === 'directory' ? 4096 : 0);
      const blocks = Math.ceil(size / 512);
      const perms = node.permissions || '-rw-r--r--';
      const uid = node.owner === 'root' ? 0 : 1000;
      const user = node.owner || 'root';
      const inode = Math.floor(Math.random() * 1000000); 
      const links = node.type === 'directory' ? 2 : 1;
      
      return `  File: ${fileName}
  Size: ${size}\t\tBlocks: ${blocks}\t\tIO Block: 4096   ${typeStr}
Device: 802h/2050d\tInode: ${inode}\tLinks: ${links}
Access: (0${perms === 'drwxr-xr-x' ? '755' : '644'}/${perms})  Uid: ( ${uid}/ ${user})   Gid: ( 1000/  runner)
Access: ${node.modified || this.getTimestamp()}
Modify: ${node.modified || this.getTimestamp()}
Change: ${node.modified || this.getTimestamp()}
 Birth: -`;
  }

  find(path: string, pattern?: string, user: string = 'runner'): string[] {
      const segments = this.resolvePathSegments(path);
      const node = this.getNode(segments);
      
      if (!node) return [`find: '${path}': No such file or directory`];
      
      if (!this.checkAccess(node, 'r', user)) return [`find: '${path}': Permission denied`];

      const results: string[] = [];
      let regex: RegExp | null = null;
      if (pattern) {
          const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&'); 
          const globbed = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
          regex = new RegExp(`^${globbed}$`);
      }
      
      const traverse = (n: VFSNode, relPath: string) => {
          const fullDisplayPath = relPath === '' ? path : (path.endsWith('/') ? path + relPath : path + '/' + relPath);
          
          if (!pattern) {
             results.push(fullDisplayPath); 
          } else {
             const name = relPath.split('/').pop() || (path.split('/').pop() || '');
             if (regex!.test(name)) {
                 results.push(fullDisplayPath);
             }
          }

          if (n.type === 'directory' && n.children) {
              if (this.checkAccess(n, 'r', user)) {
                 for (const key of Object.keys(n.children)) {
                    traverse(n.children[key], relPath === '' ? key : `${relPath}/${key}`);
                 }
              }
          }
      };

      traverse(node, '');
      return results;
  }
  
  tree(path: string, user: string = 'runner'): string[] {
      const segments = this.resolvePathSegments(path);
      const node = this.getNode(segments);
      
      if (!node) return [`${path} [error opening dir]`];
      if (node.type !== 'directory') return [`${path} [error opening dir]`];
      
      if (!this.checkAccess(node, 'r', user)) return [`${path} [error opening dir]`];

      const results: string[] = [];
      results.push(`\x1b[1;34m${path === '.' ? '.' : path}\x1b[0m`);

      const generate = (n: VFSNode, prefix: string) => {
          if (!this.checkAccess(n, 'r', user)) return; 

          const keys = Object.keys(n.children || {}).sort();
          keys.forEach((key, index) => {
             const child = n.children![key];
             const isLast = index === keys.length - 1;
             const connector = isLast ? '└── ' : '├── ';
             const childPrefix = isLast ? '    ' : '│   ';
             
             let displayName = key;
             if (child.type === 'directory') displayName = `\x1b[1;34m${key}\x1b[0m`;
             else if (child.permissions?.includes('x')) displayName = `\x1b[1;32m${key}\x1b[0m`;
             
             results.push(`${prefix}${connector}${displayName}`);
             
             if (child.type === 'directory') {
                 generate(child, prefix + childPrefix);
             }
          });
      };
      
      generate(node, '');
      return results;
  }
}
    