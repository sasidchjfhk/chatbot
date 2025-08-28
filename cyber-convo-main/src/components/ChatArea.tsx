import { useRef, useEffect } from 'react';
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
}

export default function ChatArea({ 
  messages, 
  isTyping, 
  onToggleSidebar,
  sidebarOpen,
  onSuggestionClick,
  onNewChat,
}: ChatAreaProps) {
  const prefersReducedMotion = useReducedMotion();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

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
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 glass rounded-full border border-glass-border/30">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-muted-foreground">Online</span>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Messages Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 space-y-3 sm:space-y-4 pb-28 sm:pb-20">
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

      {/* Removed floating elements to avoid layered look */}
    </div>
  );
}