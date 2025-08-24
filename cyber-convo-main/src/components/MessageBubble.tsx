import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HolographicAvatar from './HolographicAvatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: string;
  streaming?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
}

export default function MessageBubble({ message, isLast }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  // Track which code block (by key) was recently copied
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.sender === 'user';

  // Simple Markdown-ish rendering with code fences and inline code, while preserving URL/citation linking
  // Steps:
  // 1) Split content by triple backtick code fences
  // 2) For text segments: linkify URLs and make [n] clickable to first collected URLs
  // 3) For code segments: render <pre><code> with optional language from fence
  const { nodes, sources } = useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s)]+[^\s.,)])/gi;
    const urls: string[] = [];
    const unique = (u: string) => {
      if (!urls.includes(u)) urls.push(u);
    };

    // First pass: collect urls across whole content
    for (const m of message.content.matchAll(urlRegex)) unique(m[0]);

    // Split by code fences
    const fenceRegex = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
    const segments: Array<{ type: 'code' | 'text'; lang?: string; value: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fenceRegex.exec(message.content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: message.content.slice(lastIndex, match.index) });
      }
      segments.push({ type: 'code', lang: match[1]?.trim() || undefined, value: match[2] });
      lastIndex = fenceRegex.lastIndex;
    }
    if (lastIndex < message.content.length) {
      segments.push({ type: 'text', value: message.content.slice(lastIndex) });
    }

    // Helper to render a single plain line with URL/citation/inline-code linkification
    const renderInlineWithLinks = (text: string, keyBase: string) => {
      const parts: Array<{ type: 'text' | 'url' | 'cite'; value: string; idx?: number }> = [];
      let t = text
        .replace(urlRegex, (u) => `\u0001${u}\u0001`)
        .replace(/\[(\d+)\]/g, (_m, n) => `\u0002${n}\u0002`)
        .replace(/`([^`]+)`/g, (_m, code) => `\u0003${code}\u0003`);
      for (const chunk of t.split(/(\u0001[^\u0001]+\u0001|\u0002\d+\u0002|\u0003[^\u0003]+\u0003)/g)) {
        if (!chunk) continue;
        if (chunk.startsWith('\u0001') && chunk.endsWith('\u0001')) {
          const u = chunk.slice(1, -1);
          const idx = urls.indexOf(u);
          parts.push({ type: 'url', value: u, idx });
        } else if (chunk.startsWith('\u0002') && chunk.endsWith('\u0002')) {
          const n = parseInt(chunk.slice(1, -1), 10);
          parts.push({ type: 'cite', value: `[${n}]`, idx: n - 1 });
        } else if (chunk.startsWith('\u0003') && chunk.endsWith('\u0003')) {
          const v = chunk.slice(1, -1);
          parts.push({ type: 'text', value: `\u0004${v}\u0004` });
        } else {
          parts.push({ type: 'text', value: chunk });
        }
      }
      const sourcesId = `sources-${message.id}`;
      return parts.map((p, i) => {
        if (p.type === 'url') {
          return (
            <a key={keyBase + '-u-' + i} href={p.value} target="_blank" rel="noreferrer" className="underline decoration-dotted text-primary break-words">
              {p.value}
            </a>
          );
        }
        if (p.type === 'cite' && typeof p.idx === 'number' && urls[p.idx]) {
          const onCiteClick = (e: React.MouseEvent) => {
            e.preventDefault();
            const el = document.getElementById(`${sourcesId}-${p.idx}`) || document.getElementById(sourcesId);
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          };
          return (
            <a key={keyBase + '-c-' + i} href="#" onClick={onCiteClick} className="text-primary font-medium">
              {p.value}
            </a>
          );
        }
        // Inline code marked with \u0004
        if (p.type === 'text' && p.value.includes('\u0004')) {
          const chunks = p.value.split(/(\u0004[^\u0004]+\u0004)/g).filter(Boolean);
          return (
            <span key={keyBase + '-t-' + i}>
              {chunks.map((ck, j) =>
                ck.startsWith('\u0004') && ck.endsWith('\u0004') ? (
                  <code key={j} className="px-1 py-0.5 rounded bg-muted font-mono text-[0.85em]">{ck.slice(1, -1)}</code>
                ) : (
                  <span key={j}>{ck}</span>
                )
              )}
            </span>
          );
        }
        return <span key={keyBase + '-t-' + i}>{p.value}</span>;
      });
    };

    // Headings renderer with distinct style (gradient for bot)
    const renderHeading = (level: number, text: string, k: string) => {
      const base = 'font-semibold mb-1 mt-2';
      const sizes: Record<number, string> = {
        1: 'text-xl md:text-2xl',
        2: 'text-lg md:text-xl',
        3: 'text-base md:text-lg',
        4: 'text-base',
        5: 'text-sm',
        6: 'text-xs',
      };
      const colorBot = 'bg-gradient-to-r from-primary to-fuchsia-500 bg-clip-text text-transparent';
      const colorUser = 'text-foreground';
      const cls = `${base} ${sizes[level] || sizes[3]} ${message.sender === 'bot' ? colorBot : colorUser}`;
      type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      const Tag = (`h${Math.min(6, Math.max(1, level))}` as HeadingTag);
      return <Tag key={k} className={cls}>{text}</Tag>;
    };

    // Helper to process a possibly multi-line text block with headings
    const renderLinked = (text: string, keyBase: string) => {
      const lines = text.split(/\n/);
      const out: React.ReactNode[] = [];
      lines.forEach((line, idx) => {
        const m = line.match(/^\s*(#{1,6})\s+(.+)$/);
        if (m) {
          out.push(renderHeading(m[1].length, m[2], keyBase + '-h-' + idx));
        } else if (line.trim().length > 0) {
          out.push(<div key={keyBase + '-p-' + idx} className="mb-1">{renderInlineWithLinks(line, keyBase + '-' + idx)}</div>);
        } else {
          out.push(<div key={keyBase + '-br-' + idx} className="h-2" />);
        }
      });
      return out;
    };

    const normalizeLang = (l?: string) => {
      const x = (l || '').toLowerCase();
      if (x === 'js' || x === 'node') return 'javascript';
      if (x === 'ts') return 'typescript';
      if (x === 'sh') return 'bash';
      if (x === 'py') return 'python';
      if (x === 'md') return 'markdown';
      return x || 'markup';
    };

    const renderCodeBlock = (code: string, lang: string | undefined, k: string) => {
      const onCopy = async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopiedBlock(k);
          setTimeout(() => setCopiedBlock(prev => (prev === k ? null : prev)), 1500);
        } catch {}
      };
      const langKey = normalizeLang(lang);
      let highlighted = code;
      try {
        const grammar = (Prism.languages as any)[langKey] || Prism.languages.markup;
        highlighted = Prism.highlight(code, grammar, langKey);
      } catch {}
      return (
        <div key={k} className="relative group/code my-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onCopy}
                  className="absolute right-2 top-2 z-10 opacity-0 group-hover/code:opacity-100 transition-opacity text-xs px-2 py-1 rounded glass border border-glass-border/30"
                  title="Copy code"
                >
                  {copiedBlock === k ? 'Copied' : 'Copy'}
                </button>
              </TooltipTrigger>
              <TooltipContent>{copiedBlock === k ? 'Copied!' : 'Copy code'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <pre className="overflow-x-auto rounded-xl bg-muted/60 border border-glass-border/40 p-3 text-xs">
            {lang ? <span className="block text-muted-foreground text-[0.7rem] mb-1">{lang}</span> : null}
            <code className={`font-mono language-${langKey}`} dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
        </div>
      );
    };

    const builtNodes: React.ReactNode[] = [];
    segments.forEach((seg, idx) => {
      if (seg.type === 'code') {
        builtNodes.push(
          renderCodeBlock(seg.value, seg.lang, 'code-' + idx)
        );
      } else {
        builtNodes.push(
          <span key={'text-' + idx}>{renderLinked(seg.value, 'seg-' + idx)}</span>
        );
      }
    });

    return { nodes: builtNodes, sources: urls };
  }, [message.content, message.sender]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 hidden sm:block">
          <HolographicAvatar size="sm" isTyping={!!message.streaming} />
        </div>
      )}

      {/* Message Content */}
      <div className={`flex flex-col max-w-[100%] ${isUser ? 'items-end' : 'items-start'}`}>
        <motion.div
          className={`
            relative p-3 md:p-4 rounded-2xl backdrop-blur-xl border
            ${isUser 
              ? 'user-bubble ml-2' 
              : 'bot-bubble mr-2'
            }
            ${message.streaming ? 'shadow-lg glow-pulse border-primary/50' : ''}
          `}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          {/* Message Text with linkified URLs and clickable citations */}
          <motion.div
            key={(message.content?.length || 0) + (message.streaming ? '-s' : '')}
            initial={{ opacity: message.streaming ? 0.88 : 0.98 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`relative z-10 whitespace-pre-wrap break-words leading-relaxed tracking-[0.005em]
              ${message.sender === 'bot' ? 'text-[0.98rem] md:text-[1.02rem] text-foreground/95' : 'text-sm md:text-[0.95rem]'}
            `}
          >
            {nodes}
            {message.streaming && (message.content?.length || 0) === 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: '120ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: '240ms' }} />
              </span>
            ) : null}
          </motion.div>

          {/* Action Buttons */}
          {!isUser && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: showActions ? 1 : 0, x: showActions ? 0 : -10 }}
              transition={{ duration: 0.2 }}
              className="absolute -right-12 top-2 flex gap-1"
            >
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="w-8 h-8 p-0 glass border border-glass-border/30 hover:border-primary/50"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                )}
              </Button>
            </motion.div>
          )}

          {/* Glow effect */}
          <div className={`
            absolute inset-0 rounded-2xl blur-xl opacity-20 -z-10
            ${isUser ? 'bg-primary' : 'bg-secondary'}
          `} />

          {/* Thin animated border during streaming */}
          <div
            className={`absolute inset-0 rounded-2xl pointer-events-none ${message.streaming ? '' : 'opacity-0'}`}
          >
            <div className={`absolute inset-0 rounded-2xl border-2 ${isUser ? 'border-primary/70' : 'border-secondary/70'} border-pulse`} />
          </div>
        </motion.div>

        {/* Timestamp pill with blinking dot */}
        <div className={`mt-1 ${isUser ? 'mr-2 self-end' : 'ml-2 self-start'}`}>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground/80">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current blink-dot" />
            <span className="px-2 py-0.5 rounded-full glass border border-glass-border/30">
              {message.timestamp}
            </span>
          </div>
        </div>

        {/* Sources list (for bot messages) */}
        {!isUser && sources.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground/80 space-y-1" id={`sources-${message.id}`}>
            <div className="font-medium text-foreground/80">Sources</div>
            <ul className="list-decimal list-inside space-y-0.5">
              {sources.map((u, i) => (
                <li key={u + i} id={`sources-${message.id}-${i}`}>
                  <a href={u} target="_blank" rel="noreferrer" className="underline decoration-dotted text-primary break-words">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* User Avatar Placeholder */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-primary items-center justify-center hidden sm:flex">
          <span className="text-xs font-medium text-primary-foreground">U</span>
        </div>
      )}
    </motion.div>
  );
}