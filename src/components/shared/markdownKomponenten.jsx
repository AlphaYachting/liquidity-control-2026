import React from 'react';
import { cn } from '@/lib/utils';

// Gestaltete Bausteine für ReactMarkdown — die Berichte folgen so denselben
// Schriftrollen wie der Rest der App.
const ohneEmoji = (children) => React.Children.map(children, (c) =>
  typeof c === 'string' ? c.replace(/\p{Extended_Pictographic}️?/gu, '').trim() : c);

const Ueberschrift = ({ children }) => (
  <h3 className="text-value mt-5 first:mt-0 pt-3 first:pt-0 border-t first:border-0 mb-2">{ohneEmoji(children)}</h3>
);

export const markdownKomponenten = {
  h1: Ueberschrift,
  h2: Ueberschrift,
  h3: ({ children }) => <h4 className="text-body font-semibold mt-3 mb-1">{ohneEmoji(children)}</h4>,
  p: ({ children }) => <p className="text-body my-2">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 text-body">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1.5 text-body">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2"><table className="w-full border-collapse text-meta">{children}</table></div>
  ),
  th: ({ children }) => (
    <th className="text-left text-label uppercase text-muted-foreground font-medium py-1.5 pr-3 border-b">{children}</th>
  ),
  td: ({ children }) => {
    const text = React.Children.toArray(children).join('');
    const betrag = /€/.test(text);
    return (
      <td className={cn('py-1.5 pr-3 border-b border-border/60 align-top text-foreground',
        betrag && 'text-right tabular-nums font-semibold whitespace-nowrap')}>{children}</td>
    );
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{children}</a>
  ),
};