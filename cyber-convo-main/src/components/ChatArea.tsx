import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Menu, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MessageBubble from './MessageBubble';
import HolographicAvatar from './HolographicAvatar';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: string;
  streaming?: boolean;
}

interface ChatAreaProps {
  messages: Message[];
  isTyping: boolean;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onSuggestionClick?: (text: string) => void;
  onNewChat?: () => void;
  modelBadge?: string;
}

export default function ChatArea({ 
  messages, 
  isTyping, 
  onToggleSidebar,
  sidebarOpen,
  onSuggestionClick,
  onNewChat,
  modelBadge,
}: ChatAreaProps) {
  const prefersReducedMotion = useReducedMotion();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollLatest, setShowScrollLatest] = useState(false);

  const scrollToBottom = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  // Only auto-scroll when the number of messages changes (new message appended)
  useEffect(() => {
    scrollToBottom();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [messages.length]);

  // Track scroll to toggle the "scroll to latest" button
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const threshold = 120; // px from bottom
      const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
      setShowScrollLatest(distFromBottom > threshold);
    };
    el.addEventListener('scroll', onScroll);
    // initial
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Removed inline edit feature

  return (
    <div className="relative flex flex-col h-full min-h-0 bg-white">
      {/* Subtle animated starfield background */}
      {!prefersReducedMotion && (
        <div aria-hidden className="starfield -z-10" />
      )}
      {/* Header */}
      <motion.header
        initial={{ opacity: 1, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 z-10 bg-white border-b"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSidebar}
              className="text-muted-foreground hover:text-primary"
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            <div className="flex items-center gap-3">
              <HolographicAvatar size="md" isTyping={false} />
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold text-foreground">
                  Swea Chat
                </h1>
                <div className="h-1 rounded-full bg-transparent" />
                <p className="mt-1 text-sm text-muted-foreground">
                  Your futuristic AI assistant
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {modelBadge && (
              <span className="hidden sm:inline-flex items-center px-2 py-1 text-xs rounded-full border bg-muted/40 text-muted-foreground truncate max-w-[220px]" title={modelBadge}>
                {modelBadge}
              </span>
            )}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 glass rounded-full border border-glass-border/30">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-muted-foreground">Online</span>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Messages Area */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 space-y-3 sm:space-y-4 pb-28 sm:pb-20">
        {/* Empty state welcome panel */}
        {messages.length === 0 && (
          <div className="max-w-3xl mx-auto mt-8 sm:mt-12 p-4 sm:p-6 rounded-2xl border bg-white/70">
            <div className="flex items-center gap-3 mb-3">
              <HolographicAvatar size="sm" />
              <div>
                <div className="text-lg font-extrabold text-foreground">Welcome to Swea Chat</div>
                <div className="text-sm text-muted-foreground">Ask anything or try a suggestion below</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                'Summarize this article: ',
                'Explain this code: ',
                'Draft an email about: ',
                'Create a study plan for: ',
                'What is the difference between X and Y?',
                'Generate ideas for: ',
              ].map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSuggestionClick?.(s)}
                  className="text-left px-3 py-2 rounded-lg glass border border-glass-border/30 hover:border-primary/50 hover:text-primary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Button onClick={() => onNewChat?.()} className="btn-holographic">
                Start new chat
              </Button>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key="messages"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLast={index === messages.length - 1}
              />
            ))}
          </motion.div>
        </AnimatePresence>
        
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to latest button */}
      {showScrollLatest && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute right-4 bottom-24 sm:bottom-16 z-20 px-3 py-1.5 rounded-full shadow glass border border-glass-border/30 text-sm text-foreground hover:text-primary hover:border-primary/50"
          aria-label="Scroll to latest"
        >
          Jump to latest
        </button>
      )}

      {/* Removed floating elements to avoid layered look */}
    </div>
  );
}