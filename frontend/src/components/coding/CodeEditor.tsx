import Editor, { type OnMount } from "@monaco-editor/react";
import { useRef } from "react";

export const SUPPORTED_LANGUAGES = [
  { value: "python",     label: "Python 3" },
  { value: "cpp",        label: "C++" },
  { value: "java",       label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "go",         label: "Go" },
  { value: "rust",       label: "Rust" },
  { value: "typescript", label: "TypeScript" },
];

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  theme?: string;
}

export function CodeEditor({ language, value, onChange, readOnly = false, theme = "vs-dark" }: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-white/10">
      <Editor
        height="100%"
        language={language === "cpp" ? "cpp" : language}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleMount}
        theme={theme}
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          automaticLayout: true,
          tabSize: 4,
          wordWrap: "on",
          lineNumbers: "on",
          renderLineHighlight: "line",
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          smoothScrolling: true,
          formatOnPaste: true,
          formatOnType: false,
          bracketPairColorization: { enabled: true },
          readOnly,
          padding: { top: 12, bottom: 12 },
          scrollBeyondLastLine: false,
        }}
        loading={
          <div className="flex h-full items-center justify-center bg-[#1e1e1e] text-slate-500 text-sm">
            Loading editor…
          </div>
        }
      />
    </div>
  );
}
