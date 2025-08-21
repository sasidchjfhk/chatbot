import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu } from 'lucide-react';
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
}

export default function ChatArea({ 
  messages, 
  isTyping, 
  onToggleSidebar,
  sidebarOpen,
  onSuggestionClick,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass border-b border-glass-border/20 p-4 z-10"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSidebar}
              className="lg:hidden text-muted-foreground hover:text-primary"
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            <div className="flex items-center gap-3">
              <HolographicAvatar size="md" isTyping={false} />
              <div>
                <h1 className="text-xl font-bold bg-gradient-holographic bg-clip-text text-transparent">
                  Swea Chat
                </h1>
                <p className="text-sm text-muted-foreground">
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
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
              
              {/* Typing indicator removed for non-blinking UI */}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Floating elements for visual appeal */}
      <div className="absolute top-20 right-8 opacity-30 pointer-events-none">
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

      <div className="absolute bottom-32 left-8 opacity-20 pointer-events-none">
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