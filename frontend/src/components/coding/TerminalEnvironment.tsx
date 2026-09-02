import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebContainer } from "@webcontainer/api";
import "@xterm/xterm/css/xterm.css";
import { Loader2 } from "lucide-react";

// Singleton to avoid re-booting webcontainer on re-renders
let webcontainerInstance: WebContainer | null = null;

export function TerminalEnvironment() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0f172a", // slate-900
        foreground: "#cbd5e1", // slate-300
        cursor: "#06b6d4", // cyan-500
      },
      fontFamily: '"Fira Code", monospace',
      fontSize: 13,
      cursorBlink: true,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    let shellProcess: any = null;

    async function bootContainer() {
      try {
        if (!webcontainerInstance) {
          term.writeln("Booting secure WebContainer...");
          webcontainerInstance = await WebContainer.boot();
        }
        
        term.writeln("Starting shell...");
        shellProcess = await webcontainerInstance.spawn("jsh");
        
        shellProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              term.write(data);
            },
          })
        );
        
        const input = shellProcess.input.getWriter();
        term.onData((data) => {
          input.write(data);
        });

        setIsBooting(false);
      } catch (err) {
        console.error("WebContainer boot failed:", err);
        term.writeln("\r\n\x1b[31mError booting terminal environment.\x1b[0m");
        term.writeln("Make sure your browser supports SharedArrayBuffer and Cross-Origin Isolation.");
        setIsBooting(false);
      }
    }

    bootContainer();

    return () => {
      resizeObserver.disconnect();
      if (shellProcess) {
        shellProcess.kill();
      }
      term.dispose();
    };
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col bg-slate-900">
      {isBooting && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          <span className="mt-2 text-xs text-slate-400">Initializing Kernel...</span>
        </div>
      )}
      <div ref={terminalRef} className="flex-1 overflow-hidden p-2" />
    </div>
  );
}
