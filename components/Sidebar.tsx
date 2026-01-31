import React from 'react';
import { GameStatus } from '../types';

interface SidebarProps {
  status: string;
}

const Sidebar: React.FC<SidebarProps> = ({ status }) => {
  return (
    <div className="w-64 bg-slate-900 border-l border-slate-700 flex flex-col p-4 text-green-500 font-mono text-sm hidden md:flex z-40">
      <div className="mb-8">
        <h2 className="text-xl font-bold font-['Orbitron'] text-white mb-2 tracking-wider">NETRUNNER</h2>
        <div className="h-0.5 bg-green-600 w-full mb-4"></div>
        <div className="flex items-center space-x-2 mb-2">
            <div className={`w-3 h-3 rounded-full ${status === 'PROCESSING' ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
            <span className="uppercase">{status}</span>
        </div>
        <div className="text-xs text-slate-400">
            ID: GUEST-9921<br/>
            IP: 10.14.22.99
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <h3 className="text-white font-bold mb-2 uppercase">Objectives</h3>
        <ul className="space-y-3 text-slate-300">
            <li className="flex items-start">
                <span className="mr-2 text-green-500">[ ]</span>
                Explore /home/runner
            </li>
            <li className="flex items-start">
                <span className="mr-2 text-green-500">[ ]</span>
                Locate secure keys
            </li>
            <li className="flex items-start">
                <span className="mr-2 text-green-500">[ ]</span>
                Breach /var/www
            </li>
        </ul>

        <h3 className="text-white font-bold mt-8 mb-2 uppercase">Network Graph</h3>
        <div className="h-32 border border-slate-700 bg-black p-2 opacity-70">
            {/* Simple ASCII viz visualization placeholder */}
            <pre className="text-[10px] leading-3 text-green-700">
{`   [ROOT]
     |
  +--+--+
  |     |
[DB]  [WEB]
  |     |
  *    [???]`}
            </pre>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-slate-800">
         <div className="text-xs text-slate-500">
            SECURE CONNECTION v4.2<br/>
            ENCRYPTED BY GEMINI
         </div>
      </div>
    </div>
  );
};

export default Sidebar;