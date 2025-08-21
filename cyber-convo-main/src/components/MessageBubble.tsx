import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HolographicAvatar from './HolographicAvatar';

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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.sender === 'user';

  // Build URL index and transform content:
  // - Collect first N unique URLs
  // - Replace [n] with links to nth URL (1-based)
  // - Auto-link plain URLs
  const { nodes, sources } = useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s)]+[^\s.,)])/gi;
    const urls: string[] = [];
    const unique = (u: string) => {
      if (!urls.includes(u)) urls.push(u);
    };

    // First pass: collect urls
    for (const m of message.content.matchAll(urlRegex)) {
      unique(m[0]);
    }

    // Tokenize content by URLs and citations
    const parts: Array<{ type: 'text' | 'url' | 'cite'; value: string; idx?: number }> = [];
    let remaining = message.content;

    // Replace URLs with placeholders
    remaining = remaining.replace(urlRegex, (u) => `\u0001${u}\u0001`);
    // Replace [n] with placeholders
    remaining = remaining.replace(/\[(\d+)\]/g, (_m, n) => `\u0002${n}\u0002`);

    for (const chunk of remaining.split(/(\u0001[^\u0001]+\u0001|\u0002\d+\u0002)/g)) {
      if (!chunk) continue;
      if (chunk.startsWith('\u0001') && chunk.endsWith('\u0001')) {
        const u = chunk.slice(1, -1);
        const idx = urls.indexOf(u);
        parts.push({ type: 'url', value: u, idx });
      } else if (chunk.startsWith('\u0002') && chunk.endsWith('\u0002')) {
        const n = parseInt(chunk.slice(1, -1), 10);
        parts.push({ type: 'cite', value: `[${n}]`, idx: n - 1 });
      } else {
        parts.push({ type: 'text', value: chunk });
      }
    }

    const nodes = parts.map((p, i) => {
      if (p.type === 'url') {
        return (
          <a key={i} href={p.value} target="_blank" rel="noreferrer" className="underline decoration-dotted text-primary break-words">
            {p.value}
          </a>
        );
      }
      if (p.type === 'cite' && typeof p.idx === 'number' && urls[p.idx]) {
        return (
          <a key={i} href={urls[p.idx]} target="_blank" rel="noreferrer" className="text-primary font-medium">
            {p.value}
          </a>
        );
      }
      return <span key={i}>{p.value}</span>;
    });

    return { nodes, sources: urls };
  }, [message.content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0">
          <HolographicAvatar size="sm" isTyping={false} />
        </div>
      )}

      {/* Message Content */}
      <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <motion.div
          className={`
            relative p-4 rounded-2xl backdrop-blur-xl border
            ${isUser 
              ? 'user-bubble ml-8' 
              : 'bot-bubble mr-8'
            }
          `}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          {/* Message Text with linkified URLs and clickable citations */}
          <div className="relative z-10 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {nodes}
          </div>

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
        </motion.div>

        {/* Timestamp */}
        <div className={`text-xs text-muted-foreground/70 mt-1 ${isUser ? 'mr-2' : 'ml-2'}`}>
          {message.timestamp}
        </div>

        {/* Sources list (for bot messages) */}
        {!isUser && sources.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground/80 space-y-1">
            <div className="font-medium text-foreground/80">Sources</div>
            <ul className="list-decimal list-inside space-y-0.5">
              {sources.map((u, i) => (
                <li key={u + i}>
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
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
          <span className="text-xs font-medium text-primary-foreground">U</span>
        </div>
      )}
    </motion.div>
  );
}