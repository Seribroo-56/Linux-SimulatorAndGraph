import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { VirtualFileSystem, VFSNode } from '../services/VirtualFileSystem';

export interface GraphViewRef {
  triggerPushAnimation: () => void;
}

interface GraphViewProps {
  fileSystem: VirtualFileSystem;
  visible: boolean;
  version: number;
  onNavigate?: (path: string) => void;
}

const GraphView = forwardRef<GraphViewRef, GraphViewProps>(({ fileSystem, visible, version, onNavigate }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    triggerPushAnimation: () => {
        const net = networkRef.current;
        if(!net) return;
        
        const git = fileSystem.getGitSimulator();
        const rootId = git.getRepoRoot(); 
        
        if (!rootId) return; // Should not happen if push was successful

        const positions = net.getPositions([rootId]);
        const startPos = positions[rootId] || {x: 0, y: 0};
        
        const tempNodes: any[] = [];
        const tempEdges: any[] = [];
        
        for(let i=0; i<5; i++) {
            const tempId = `packet_${Date.now()}_${i}`;
            tempNodes.push({
                id: tempId,
                shape: 'dot',
                color: '#ffffff', // White data packets
                size: 5,
                x: startPos.x,
                y: startPos.y,
                shadow: {
                    enabled: true,
                    color: '#00f3ff',
                    size: 10,
                    x: 0,
                    y: 0
                }
            });
            tempEdges.push({ 
                from: tempId, 
                to: 'internet', 
                id: `edge_${tempId}`,
                color: { color: '#ffffff', opacity: 0.8 },
                dashes: false // Packets themselves solid? or keep consistent
            });
        }
        
        if (net.body.data.nodes && net.body.data.edges) {
             net.body.data.nodes.add(tempNodes);
             net.body.data.edges.add(tempEdges);
             
             setTimeout(() => {
                 try {
                    net.body.data.nodes.remove(tempNodes.map(n => n.id));
                    net.body.data.edges.remove(tempEdges.map(e => e.id));
                 } catch(e) {
                     // ignore if already removed
                 }
             }, 2000);
        }
    }
  }));

  useEffect(() => {
    if (!containerRef.current || !window['vis']) return;

    const nodes: any[] = [];
    const edges: any[] = [];
    const git = fileSystem.getGitSimulator();
    const repoRoot = git.getRepoRoot();
    
    // Add Internet Node
    nodes.push({
        id: 'internet',
        label: 'GitHub',
        shape: 'icon',
        icon: { face: '"Font Awesome 6 Free"', code: '\uf0c2', weight: '900', color: '#8e44ad', size: 50 },
        x: 0,
        y: -300,
        fixed: true,
        font: { color: '#ffffff', face: 'monospace', strokeWidth: 3, strokeColor: '#000000' },
        shadow: {
            enabled: true,
            color: '#8e44ad',
            size: 20,
            x: 0,
            y: 0
        }
    });

    const traverse = (node: VFSNode, path: string, parentId: string | null) => {
        const id = path || 'root';
        const name = path.split('/').pop() || '/';
        const absolutePath = path ? '/' + path : '/';
        
        let color = '#4ade80'; // File: Green (Clean)
        let iconCode = '\uf15b'; // fa-file
        let label = name;

        if (path === '') {
            color = '#ef4444'; // Root: Red
            iconCode = '\uf233'; // fa-server
        } else if (node.type === 'directory') {
            color = '#3b82f6'; // Dir: Blue
            iconCode = '\uf07b'; // fa-folder
        } else {
            // Check Git Status
            let isTrackedInRepo = false;
            if (repoRoot) {
                // If absolute path matches repoRoot or starts with repoRoot/
                if (absolutePath === repoRoot || absolutePath.startsWith(repoRoot + '/')) {
                    isTrackedInRepo = true;
                }
            }

            if (isTrackedInRepo) {
                const status = git.getFileStatus(absolutePath);
                if (status === 'staged') {
                    color = '#eab308'; // Yellow
                } else if (status === 'untracked') {
                    color = '#ef4444'; // Red
                }
            }
        }
        
        // Add Branch Label
        if (repoRoot && absolutePath === repoRoot) {
             const head = git.getHead();
             label += `\n(${head})`;
        }

        nodes.push({ 
            id, 
            label: label, 
            shape: 'icon',
            icon: {
                face: '"Font Awesome 6 Free"',
                code: iconCode,
                weight: '900', // Necessary for FA Solid
                color: color,
                size: 30
            }
        });

        if (parentId) {
            // Simplified edge creation to inherit global options
            edges.push({ from: parentId, to: id });
        }

        if (node.children) {
            Object.entries(node.children).forEach(([childName, childNode]) => {
                const childPath = path === '' ? childName : `${path}/${childName}`;
                traverse(childNode, childPath, id);
            });
        }
    };

    traverse(fileSystem.getRoot(), '', null);

    const data = { nodes, edges };
    const options = {
      layout: {
        hierarchical: false
      },
      edges: {
        smooth: {
            type: 'dynamic',
            roundness: 0.5
        },
        color: {
            color: '#00f3ff', // Cyan Neon
            highlight: '#ffffff',
            hover: '#ffffff'
        },
        width: 2, // Standard width
        dashes: false, // Solid lines
        shadow: {
            enabled: true,
            color: '#00f3ff', // Glow same as line
            size: 10,
            x: 0,
            y: 0
        },
        arrows: {
            to: {
                enabled: true,
                scaleFactor: 1.2,
                type: 'arrow'
            }
        }
      },
      nodes: {
          borderWidth: 2,
          shadow: {
              enabled: true,
              color: '#00f3ff', // Cyan Glow for nodes too
              size: 20,
              x: 0,
              y: 0
          },
          font: {
              face: 'monospace',
              color: '#ffffff',
              strokeWidth: 3,
              strokeColor: '#000000',
              size: 14,
              multi: 'html', 
          }
      },
      physics: {
        solver: 'barnesHut',
        barnesHut: {
            gravitationalConstant: -2000,
            centralGravity: 0.3,
            springLength: 95,
            springConstant: 0.04,
            damping: 0.09,
            avoidOverlap: 0.1
        },
        stabilization: {
             enabled: true,
             iterations: 1000,
             updateInterval: 100
        }
      },
      interaction: {
        dragNodes: true,
        zoomView: true,
        dragView: true,
        hover: true
      }
    };

    if (!networkRef.current) {
        networkRef.current = new window['vis'].Network(containerRef.current, data, options);
        
        networkRef.current.on('doubleClick', (params: any) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                if (nodeId === 'internet') return; // Don't navigate to internet
                if (onNavigate) {
                    onNavigate(nodeId === 'root' ? '/' : nodeId);
                }
            }
        });
    } else {
        networkRef.current.setOptions(options); // Update options dynamically if needed
        networkRef.current.setData(data);
    }

  }, [fileSystem, version, visible]);

  return (
    <div 
        ref={containerRef} 
        className="w-full h-full absolute inset-0 z-40"
        style={{ 
            display: visible ? 'block' : 'none',
            backgroundColor: '#050505',
            backgroundImage: `linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            boxShadow: 'inset 0 0 150px #000000'
        }} 
    />
  );
});

export default GraphView;