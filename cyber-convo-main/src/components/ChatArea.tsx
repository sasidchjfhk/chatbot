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
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Light, non-distracting asteroid background */}
      {!prefersReducedMotion && (
        <div className="absolute inset-0 -z-10 pointer-events-none select-none overflow-hidden">
          {/* Small drifting dots */}
          <motion.div
            aria-hidden
            className="absolute top-10 left-8 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-foreground/10 blur-[1px]"
            animate={{ x: [0, 60, 0], y: [0, -40, 0], opacity: [0.12, 0.08, 0.12] }}
            transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden
            className="absolute top-1/3 right-10 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-foreground/10 blur-[1px]"
            animate={{ x: [0, -70, 0], y: [0, -30, 0], opacity: [0.1, 0.06, 0.1] }}
            transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
          <motion.div
            aria-hidden
            className="absolute bottom-16 left-12 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-foreground/10 blur-[2px]"
            animate={{ x: [0, 50, 0], y: [0, 30, 0], opacity: [0.08, 0.05, 0.08] }}
            transition={{ duration: 35, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          />
          {/* Faint comet trails */}
          <motion.div
            aria-hidden
            className="absolute top-24 right-24 h-px w-20 sm:w-28 bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
            animate={{ x: [0, -20, 0], opacity: [0.14, 0.06, 0.14] }}
            transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden
            className="absolute bottom-24 left-24 h-px w-16 sm:w-24 bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
            animate={{ x: [0, 18, 0], opacity: [0.12, 0.05, 0.12] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
          />
        </div>
      )}
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 z-10 bg-white/90 supports-[backdrop-filter]:bg-white/70 backdrop-blur border-b border-primary/10 shadow-md"
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
                <motion.div
                  initial={{ scaleX: 0.6, opacity: 0.8 }}
                  animate={{ scaleX: [0.6, 1, 0.85, 1], opacity: [0.8, 1, 0.9, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="h-1 rounded-full bg-gradient-to-r from-primary via-fuchsia-500 to-cyan-400 origin-left"
                />
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
          {messages.length === 0 ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <div className="mb-8">
                <HolographicAvatar size="lg" />
              </div>
              
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-2xl font-bold bg-gradient-holographic bg-clip-text text-transparent mb-4"
              >
                Welcome to Swea Chat
              </motion.h2>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-muted-foreground mb-8 max-w-md"
              >
                Your advanced AI companion in a futuristic interface. 
                Start a conversation and experience the future of AI interaction.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md w-full"
              >
                {[
                  "Tell me about quantum computing",
                  "Create a futuristic story",
                  "Explain machine learning",
                  "Design a spaceship"
                ].map((suggestion, index) => (
                  <motion.button
                    key={suggestion}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="p-3 glass border border-glass-border/30 rounded-lg text-sm hover:border-primary/50 hover:text-primary transition-all duration-300"
                    onClick={() => onSuggestionClick?.(suggestion)}
                  >
                    {suggestion}
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          ) : (
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
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Removed floating New Chat button */}

      {/* Floating elements for visual appeal */}
      <div className="absolute top-20 right-8 opacity-30 pointer-events-none hidden md:block">
        <motion.div
          animate={{
            rotate: 360,
            scale: [1, 1.1, 1]
          }}
          transition={{
            rotate: { duration: 20, repeat: Infinity, ease: "linear" },
            scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }}
          className="w-16 h-16 border border-primary/30 rounded-lg"
        />
      </div>

      <div className="absolute bottom-32 left-8 opacity-20 pointer-events-none hidden md:block">
        <motion.div
          animate={{
            y: [-10, 10, -10],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="w-8 h-8 bg-secondary/30 rounded-full blur-sm"
        />
      </div>
    </div>
  );
}