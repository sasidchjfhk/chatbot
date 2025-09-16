import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquare, Settings, User, Menu, X, Copy, RotateCcw, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HolographicAvatar from './HolographicAvatar';
import { Input } from '@/components/ui/input';
import { useTheme } from 'next-themes';

interface Chat {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  chats: Chat[];
  activeChat: string;
  onSelectChat: (chatId: string) => void;
  apiKey?: string;
  onApiKeyChange?: (value: string) => void;
  onReuseChat?: (chatId: string) => void;
  onDuplicateChat?: (chatId: string) => void;
  onClearMemory?: () => void;
  showThinking?: boolean;
  onToggleShowThinking?: (value: boolean) => void;
  currentModel?: string;
  onChangeModel?: (value: string) => void;
}

export default function Sidebar({
  isOpen,
  onToggle,
  onNewChat,
  chats,
  activeChat,
  onSelectChat,
  apiKey,
  onApiKeyChange,
  onReuseChat,
  onDuplicateChat,
  onClearMemory,
  showThinking,
  onToggleShowThinking,
  currentModel,
  onChangeModel,
}: SidebarProps) {
  // removed hoveredChat to reduce re-renders during pointer movements
  const { theme, setTheme } = useTheme();

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          x: isOpen ? 0 : '-100%',
          width: isOpen ? '320px' : '0px'
        }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="fixed left-0 top-0 h-full sidebar-glass border-r border-glass-border/20 z-50 lg:relative lg:translate-x-0 overflow-hidden"
        style={{ width: isOpen ? '320px' : '0px', willChange: 'transform, width', pointerEvents: isOpen ? 'auto' : 'none' }}
     >
        {isOpen && (
        <div className="flex flex-col h-full p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <HolographicAvatar size="sm" />
              <h2 className="text-lg font-semibold bg-gradient-holographic bg-clip-text text-transparent">Swea Chat</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="lg:hidden text-muted-foreground hover:text-primary"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* New Chat Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Button
              onClick={onNewChat}
              className="w-full btn-holographic mb-6 group"
            >
              <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform duration-300" />
              New Chat
            </Button>
          </motion.div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 px-2">
              Recent Chats
            </h3>
            <div className="space-y-2">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`
                    relative p-3 rounded-lg cursor-pointer transition-colors duration-150
                    ${activeChat === chat.id 
                      ? 'glass border-primary/50 bg-primary/10' 
                      : 'hover:glass hover:border-primary/30'
                    }
                  `}
                  onClick={() => onSelectChat(chat.id)}
                >
                  <div className="flex items-start gap-3">
                    <MessageSquare className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{chat.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{chat.preview}</p>
                      <p className="text-xs text-muted-foreground/70 mt-2">{chat.timestamp}</p>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-primary/10"
                        title="Reuse prompt"
                        onClick={(e) => { e.stopPropagation(); onReuseChat?.(chat.id); }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-primary/10"
                        title="Duplicate chat"
                        onClick={(e) => { e.stopPropagation(); onDuplicateChat?.(chat.id); }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Section */}
          <motion.div
            className="border-t border-glass-border/20 pt-4 mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {/* OpenRouter API Key Input */}
            <div className="mb-3">
              <label className="text-xs text-muted-foreground mb-1 block">OpenRouter API Key</label>
              <Input
                type="password"
                placeholder="sk-or-v1-..."
                value={apiKey || ''}
                onChange={(e) => onApiKeyChange?.(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Stored locally in your browser. Not sent to server except with your chat requests.</p>
            </div>

            {/* Model Selector */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1 block">Model</label>
              <Input
                type="text"
                placeholder="e.g. deepseek/deepseek-chat-v3.1:free"
                value={currentModel || ''}
                onChange={(e) => onChangeModel?.(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Overrides default when set.</p>
            </div>

            {/* Show Thinking Toggle */}
            <div className="mb-4 flex items-center justify-between px-1">
              <div>
                <div className="text-sm font-medium text-foreground">Show Thinking</div>
                <div className="text-xs text-muted-foreground">Display brief reasoning panel in replies</div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <Input
                  type="checkbox"
                  checked={!!showThinking}
                  onChange={(e) => onToggleShowThinking?.(e.target.checked)}
                  className="w-4 h-4"
                />
              </label>
            </div>

            {/* Clear Memory */}
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/10 mb-2"
              onClick={() => onClearMemory?.()}
              title="Clear server memory for this chat"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear memory
            </Button>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/10 mb-2"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              Toggle theme
            </Button>

            <div className="flex items-center gap-3 p-3 rounded-lg glass border border-glass-border/20 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">User</p>
                <p className="text-xs text-muted-foreground">Free Plan</p>
              </div>
            </div>
            
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/10"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </motion.div>
        </div>
        )}
      </motion.aside>
    </>
  );
}