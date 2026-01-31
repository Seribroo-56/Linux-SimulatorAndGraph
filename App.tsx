import React, { useState, useMemo, useRef, useCallback } from 'react';
import TerminalController, { TerminalControllerRef } from './components/TerminalController';
import Sidebar from './components/Sidebar';
import GraphView, { GraphViewRef } from './components/GraphView';
import { VirtualFileSystem } from './services/VirtualFileSystem';

const App: React.FC = () => {
  const [systemStatus, setSystemStatus] = useState<string>('INITIALIZING');
  const [viewMode, setViewMode] = useState<'terminal' | 'graph'>('terminal');
  const [fsVersion, setFsVersion] = useState(0);

  const terminalRef = useRef<TerminalControllerRef>(null);
  const graphRef = useRef<GraphViewRef>(null);

  // Initialize VFS once
  const vfs = useMemo(() => new VirtualFileSystem(), []);

  const handleFsMutation = useCallback(() => {
    setFsVersion(v => v + 1);
  }, []);
  
  const handlePush = useCallback(() => {
      // Trigger animation via graph ref
      graphRef.current?.triggerPushAnimation();
  }, []);

  const toggleView = () => {
    setViewMode(prev => prev === 'terminal' ? 'graph' : 'terminal');
  };

  const handleGraphNavigate = (path: string) => {
      // Execute CD in terminal
      terminalRef.current?.runCommand(`cd "${path}"`);
      // Switch back
      setViewMode('terminal');
  };

  return (
    <div className="window-frame relative">
        {/* Top Bar: Mac-style window controls */}
        <div className="title-bar">
          <div className="window-controls">
            <span className="dot red"></span>
            <span className="dot yellow"></span>
            <span className="dot green"></span>
          </div>
          <div className="window-title">Linux Simulator 2024</div>
        </div>

        {/* Middle Bar: The Green Status/Instruction Bar */}
        <div className="status-bar">
          <span className="level-text">
            {systemStatus === 'CONNECTED' ? 'Level 1: Introduction' : systemStatus}
          </span>
          <div className="flex space-x-2">
            <button 
                onClick={toggleView}
                className="instructions-btn"
            >
                {viewMode === 'terminal' ? 'View Graph' : 'View Terminal'}
            </button>
            <button className="instructions-btn">Instructions</button>
          </div>
        </div>

        {/* The Terminal Content */}
        <div className="terminal-body">
             {/* Main View Area */}
             <div className="flex-1 relative h-full">
                <div className={`w-full h-full absolute inset-0 ${viewMode === 'terminal' ? 'z-10' : 'z-0'}`}>
                    <TerminalController 
                        ref={terminalRef}
                        onStatusChange={setSystemStatus} 
                        fileSystem={vfs}
                        onMutation={handleFsMutation}
                        onPush={handlePush}
                        isVisible={viewMode === 'terminal'}
                    />
                </div>
                
                <div className={`w-full h-full absolute inset-0 ${viewMode === 'graph' ? 'z-20' : 'z-0'}`} style={{ display: viewMode === 'graph' ? 'block' : 'none' }}>
                    <GraphView 
                        ref={graphRef}
                        fileSystem={vfs} 
                        visible={viewMode === 'graph'} 
                        version={fsVersion}
                        onNavigate={handleGraphNavigate}
                    />
                </div>
             </div>

             {/* Sidebar embedded in window */}
             <Sidebar status={systemStatus} />
        </div>
    </div>
  );
};

export default App;