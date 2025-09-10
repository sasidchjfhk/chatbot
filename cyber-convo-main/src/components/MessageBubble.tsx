import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
  const prefersReducedMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  // Track which code block (by key) was recently copied
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);
  const isUser = message.sender === 'user';
  const isPlaceholder = message.sender === 'bot' && !!message.streaming && (message.content?.length || 0) === 0;

  // For bot messages: first non-empty line = Title, second non-empty line = Subtitle (optional)
  // Body = rest. Only Title and Subtitle will be bold.
  const { headingTitle, headingSubtitle, bodyContent } = useMemo(() => {
    if (message.sender !== 'bot') return { headingTitle: null as string | null, headingSubtitle: null as string | null, bodyContent: message.content };
    const raw = (message.content || '').split('\n');
    const nonEmptyIdx: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i].trim().length > 0) nonEmptyIdx.push(i);
      if (nonEmptyIdx.length >= 2) break;
    }
    if (nonEmptyIdx.length === 0) return { headingTitle: null as string | null, headingSubtitle: null as string | null, bodyContent: message.content };
    const title = raw[nonEmptyIdx[0]].trim();
    const subtitle = nonEmptyIdx.length > 1 ? raw[nonEmptyIdx[1]].trim() : null;
    const cut = nonEmptyIdx.length > 1 ? nonEmptyIdx[1] + 1 : nonEmptyIdx[0] + 1;
    const body = raw.slice(cut).join('\n');
    return { headingTitle: title || null, headingSubtitle: subtitle || null, bodyContent: body };
  }, [message.sender, message.content]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple Markdown-ish rendering with code fences and inline code, while preserving URL/citation linking
  // Steps:
  // 1) Split content by triple backtick code fences
  // 2) For text segments: linkify URLs and make [n] clickable to first collected URLs
  // 3) For code segments: render <pre><code> with optional language from fence
  const { nodes, sources } = useMemo(() => {
    const baseContent = message.sender === 'bot' ? (bodyContent ?? '') : (message.content ?? '');
    const urlRegex = /(https?:\/\/[^\s)]+[^\s.,)])/gi;
    const urls: string[] = [];
    const unique = (u: string) => {
      if (!urls.includes(u)) urls.push(u);
    };

    // First pass: collect urls across whole content
    for (const m of baseContent.matchAll(urlRegex)) unique(m[0]);

    // Split by code fences
    const fenceRegex = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
    const segments: Array<{ type: 'code' | 'text'; lang?: string; value: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fenceRegex.exec(baseContent)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: baseContent.slice(lastIndex, match.index) });
      }
      segments.push({ type: 'code', lang: match[1]?.trim() || undefined, value: match[2] });
      lastIndex = fenceRegex.lastIndex;
    }
    if (lastIndex < baseContent.length) {
      segments.push({ type: 'text', value: baseContent.slice(lastIndex) });
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

    // Headings renderer inside body. Do NOT bold for bot body (only title/subtitle are bold).
    const renderHeading = (level: number, text: string, k: string) => {
      const base = `${message.sender === 'bot' ? 'font-normal' : 'font-extrabold'} mb-1 mt-2 first:mt-0`;
      const sizes: Record<number, string> = {
        1: 'text-xl md:text-2xl',
        2: 'text-lg md:text-xl',
        3: 'text-base md:text-lg',
        4: 'text-base',
        5: 'text-sm',
        6: 'text-xs',
      };
      const colorBot = 'text-foreground';
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
          out.push(
            <div key={keyBase + '-p-' + idx} className="mb-1">
              {renderInlineWithLinks(line, keyBase + '-' + idx)}
            </div>
          );
        } else {
          // Do not render an explicit spacer for blank lines to avoid visible white gaps
          // between message paragraphs or at the start/end of messages.
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
      // Special rendering for reasoning blocks (visible thinking summary)
      if ((lang || '').toLowerCase() === 'reasoning') {
        const lines = code
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);
        return (
          <div key={k} className="my-2 p-3 rounded-xl border border-primary/20 bg-primary/5">
            <div className="text-xs font-semibold text-primary mb-1">Thinking</div>
            <ul className="list-disc list-inside text-sm text-foreground/80 space-y-1">
              {lines.map((l, i) => (
                <li key={i}>{l.replace(/^[-*]\s*/, '')}</li>
              ))}
            </ul>
          </div>
        );
      }
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
  }, [message.content, message.sender, bodyContent]);

  return (
    <motion.div
      initial={{ opacity: message.streaming ? 1 : 0, y: message.streaming ? 8 : 20, scale: message.streaming ? 1 : 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: prefersReducedMotion ? 0.18 : (message.streaming ? 0.22 : 0.35), ease: 'easeOut' }}
      className={`flex gap-2 sm:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {!isUser && !isPlaceholder && (
        <div className="flex-shrink-0 hidden sm:block">
          <HolographicAvatar size="sm" isTyping={!!message.streaming} />
        </div>
      )}

      {/* Message Content */}
      <div className={`flex flex-col max-w-[100%] ${isUser ? 'items-end' : 'items-start'}`}>
        <motion.div
          className={
            isPlaceholder
              ? 'relative p-0 m-0 bg-transparent border-0 shadow-none'
              : `relative p-2 sm:p-3 md:p-4 rounded-2xl border ${isUser ? 'user-bubble ml-2' : 'bot-bubble mr-[50px]'} `
          }
          whileHover={prefersReducedMotion ? undefined : { scale: isPlaceholder ? 1 : 1.01 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.2 }}
        >
          {/* Hyper Thinking animated background (visual only, no CoT) */}
          {!isUser && message.streaming && (
            <>
              <style>
                {`
                @keyframes bgMove {
                  0% { transform: translateY(0); }
                  100% { transform: translateY(-40%); }
                }
                `}
              </style>
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none select-none">
                {/* Moving scanlines */}
                <div
                  className="absolute -inset-8 opacity-20"
                  style={{
                    background:
                      'repeating-linear-gradient( to bottom, rgba(99,102,241,0.08) 0px, rgba(99,102,241,0.08) 2px, transparent 2px, transparent 8px )',
                    animation: 'bgMove 6s linear infinite',
                  }}
                />
                {/* Soft radial glow */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(100% 60% at 50% 0%, rgba(99,102,241,0.18), transparent 60%)',
                    mixBlendMode: 'multiply',
                  }}
                />
              </div>
            </>
          )}
          {/* Message Text with linkified URLs and clickable citations */}
          {isPlaceholder ? (
            prefersReducedMotion ? (
              <span className="inline-block w-8 h-2.5 rounded-full bg-foreground/30 animate-blink-simple" />
            ) : (
              <span className="inline-flex items-center gap-2" aria-label="AI is thinking" role="status">
                <span className="thinking-pill w-14 h-3" />
                <span className="text-xs text-muted-foreground/80 select-none">
                  Hyper thinking…
                  <span className="inline-flex gap-0.5 ml-1 align-middle">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-pulse" style={{ animationDelay: '300ms' }} />
                  </span>
                </span>
              </span>
            )
          ) : (
            <motion.div
              key={(message.content?.length || 0) + (message.streaming ? '-s' : '')}
              initial={{ opacity: message.streaming ? 0.88 : 0.98 }}
              animate={{ opacity: 1 }}
              transition={{ duration: prefersReducedMotion ? 0.2 : (message.streaming ? 0.5 : 0.25), ease: 'easeOut' }}
              className={`relative z-10 whitespace-pre-wrap break-words leading-relaxed tracking-[0.005em]
                ${message.sender === 'bot' ? 'text-[0.95rem] md:text-[1rem] text-foreground/80' : 'text-sm md:text-[0.95rem]'}
              `}
            >
              {/* Bot title & subtitle */}
              {!isUser && headingTitle ? (
                <div className="mb-1">
                  <div className="text-foreground font-extrabold text-base sm:text-lg">{headingTitle}</div>
                  {headingSubtitle ? (
                    <div className="text-foreground font-semibold text-[0.95rem] sm:text-base mt-0.5">{headingSubtitle}</div>
                  ) : null}
                </div>
              ) : null}
              {nodes}
            </motion.div>
          )}

          {/* Action Buttons */}
          {!isUser && !isPlaceholder && (
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

          {/* Removed glow and animated border for a flat look */}
        </motion.div>

        {/* Timestamp removed per request */}

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