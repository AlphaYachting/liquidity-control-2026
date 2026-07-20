import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from "@/components/ui/button";
import { Copy, Zap, CheckCircle2, AlertCircle, Loader2, ChevronRight, Clock, Mail } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FunctionDisplay = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall?.name || 'Function';
  const status = toolCall?.status || 'pending';
  const results = toolCall?.results;

  const parsedResults = (() => {
    if (!results) return null;
    try { return typeof results === 'string' ? JSON.parse(results) : results; }
    catch { return results; }
  })();

  const isError = results && (
    (typeof results === 'string' && /error|failed/i.test(results)) ||
    (parsedResults?.success === false)
  );

  const statusConfig = {
    pending: { icon: Clock, color: 'text-slate-400', text: 'Ausstehend' },
    running: { icon: Loader2, color: 'text-slate-500', text: 'Lädt…', spin: true },
    in_progress: { icon: Loader2, color: 'text-slate-500', text: 'Lädt…', spin: true },
    completed: isError
      ? { icon: AlertCircle, color: 'text-red-500', text: 'Fehler' }
      : { icon: CheckCircle2, color: 'text-green-600', text: 'OK' },
    success: { icon: CheckCircle2, color: 'text-green-600', text: 'OK' },
    failed: { icon: AlertCircle, color: 'text-red-500', text: 'Fehler' },
    error: { icon: AlertCircle, color: 'text-red-500', text: 'Fehler' }
  }[status] || { icon: Zap, color: 'text-slate-500', text: '' };

  const Icon = statusConfig.icon;
  const formattedName = name.split('.').reverse().join(' ').toLowerCase();

  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all hover:bg-slate-50",
          expanded ? "bg-slate-50 border-slate-300" : "bg-white border-slate-200")}
      >
        <Icon className={cn("h-3 w-3", statusConfig.color, statusConfig.spin && "animate-spin")} />
        <span className="text-slate-700">{formattedName}</span>
        {statusConfig.text && <span className={cn("text-slate-500", isError && "text-red-600")}>• {statusConfig.text}</span>}
        {!statusConfig.spin && (toolCall.arguments_string || results) && (
          <ChevronRight className={cn("h-3 w-3 text-slate-400 transition-transform ml-auto", expanded && "rotate-90")} />
        )}
      </button>
      {expanded && !statusConfig.spin && (
        <div className="mt-1.5 ml-3 pl-3 border-l-2 border-slate-200 space-y-2">
          {toolCall.arguments_string && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Parameter:</div>
              <pre className="bg-slate-50 rounded-md p-2 text-xs text-slate-600 whitespace-pre-wrap">
                {(() => { try { return JSON.stringify(JSON.parse(toolCall.arguments_string), null, 2); } catch { return toolCall.arguments_string; } })()}
              </pre>
            </div>
          )}
          {parsedResults && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Ergebnis:</div>
              <pre className="bg-slate-50 rounded-md p-2 text-xs text-slate-600 whitespace-pre-wrap max-h-48 overflow-auto">
                {typeof parsedResults === 'object' ? JSON.stringify(parsedResults, null, 2) : parsedResults}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
          <div className="h-2 w-2 rounded-full bg-primary" />
        </div>
      )}
      <div className={cn("max-w-[85%]", isUser && "flex flex-col items-end")}>
        {message.content && (
          <div className={cn("rounded-2xl px-4 py-2.5",
            isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border")}>
            {isUser ? (
              <p className="text-sm leading-relaxed">{message.content}</p>
            ) : (
              <ReactMarkdown
                className="text-sm prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                remarkPlugins={[remarkGfm]}
                components={{
                  code: ({ inline, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <div className="relative group/code">
                        <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto my-2">
                          <code className={className} {...props}>{children}</code>
                        </pre>
                        <Button size="icon" variant="ghost"
                          className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover/code:opacity-100 bg-slate-800 hover:bg-slate-700"
                          onClick={() => { navigator.clipboard.writeText(String(children).replace(/\n$/, '')); toast.success('Kopiert'); }}>
                          <Copy className="h-3 w-3 text-slate-400" />
                        </Button>
                      </div>
                    ) : <code className="px-1 py-0.5 rounded bg-muted text-foreground text-xs">{children}</code>;
                  },
                  a: ({ children, href, ...props }) => {
                    if (href?.startsWith('mailto:')) {
                      return (
                        <a href={href} className="not-prose inline-flex items-center gap-2 my-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium no-underline hover:bg-primary/90 transition-colors shadow-sm">
                          <Mail className="h-4 w-4" />
                          {children}
                        </a>
                      );
                    }
                    return <a href={href} {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
                  },
                  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="my-0.5">{children}</li>,
                  h1: ({ children }) => <h1 className="text-lg font-semibold my-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-semibold my-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold my-2">{children}</h3>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 my-2 text-muted-foreground">{children}</blockquote>,
                  table: ({ children }) => <div className="overflow-x-auto my-3"><table className="w-full text-xs border-collapse">{children}</table></div>,
                  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  tr: ({ children }) => <tr className="border-b border-border even:bg-muted/30">{children}</tr>,
                  th: ({ children }) => <th className="text-left px-2 py-1.5 font-semibold text-foreground whitespace-nowrap">{children}</th>,
                  td: ({ children }) => <td className="px-2 py-1.5 text-muted-foreground">{children}</td>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}
        {message.tool_calls?.length > 0 && (
          <div className="space-y-1">
            {message.tool_calls.map((tc, i) => <FunctionDisplay key={i} toolCall={tc} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// Nur neu rendern, wenn sich diese konkrete Nachricht ändert — verhindert das
// Neuzeichnen des gesamten Verlaufs bei langen Chats (reine Darstellungsoptimierung).
export default memo(MessageBubble, (prev, next) =>
  prev.message.content === next.message.content &&
  JSON.stringify(prev.message.tool_calls) === JSON.stringify(next.message.tool_calls)
);