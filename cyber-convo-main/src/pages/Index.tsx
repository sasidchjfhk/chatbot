import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import ChatInput from '@/components/ChatInput';
import { sendChat, streamChat, webSearch, clearMemory, type WebResult } from '@/lib/api';
import { toast } from 'sonner';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: string;
  streaming?: boolean;
}

interface Chat {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
  session_id?: string;
}

export default function Index() {
  // Default model can be provided via env to prefer faster models
  const DEFAULT_MODEL: string | undefined = (import.meta as any).env?.VITE_DEFAULT_MODEL || undefined;
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cc_sidebar_open');
      if (saved !== null) return saved === '1';
    } catch {}
    // Default: hidden; user can open via toggle
    return false;
  });

  // Model selection with persistence
  const [selectedModel, setSelectedModel] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('cc_model') || undefined;
    } catch {
      return undefined;
    }
  });
  const handleModelChange = (m: string) => {
    const v = (m || '').trim();
    setSelectedModel(v || undefined);
    try {
      if (v) localStorage.setItem('cc_model', v);
      else localStorage.removeItem('cc_model');
    } catch {}
  };

  // Show Thinking toggle (visible reasoning panel)
  const [showThinking, setShowThinking] = useState<boolean>(() => {
    try {
      const x = localStorage.getItem('cc_show_thinking');
      return x ? x === '1' : true; // default on
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try { localStorage.setItem('cc_show_thinking', showThinking ? '1' : '0'); } catch {}
  }, [showThinking]);

  // Temperature removed per request
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('current_chat_messages');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [isTyping, setIsTyping] = useState(false);
  const [prefill, setPrefill] = useState<string | undefined>(undefined);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
  
  // Save messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('current_chat_messages', JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save messages to localStorage', e);
    }
  }, [messages]);
  const [sessionId, setSessionId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('session_id') || undefined;
    } catch {
      return undefined;
    }
  });
  const [apiKey, setApiKey] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('openrouter_api_key') || undefined;
    } catch {
      return undefined;
    }
  });

  // Allow user to provide OpenRouter API key via UI; persist locally only
  const handleApiKeyChange = (value: string) => {
    setApiKey(value || undefined);
    try {
      if (value) {
        localStorage.setItem('openrouter_api_key', value);
      } else {
        localStorage.removeItem('openrouter_api_key');
      }
    } catch {}
  };

  // Inline Edit-and-Resend feature removed per request

  const handleClearMemory = async () => {
    // Clear server memory for this session (if any), then clear local messages for the active chat
    const currentSession = sessionId;
    try {
      if (currentSession) {
        await clearMemory(currentSession, apiKey);
      }
    } catch (e) {
      // Non-fatal: even if server clear fails, still clear local state
      toast.error((e as any)?.message || 'Failed to clear memory on server');
    }
    // Clear local messages for the active chat
    setMessages([]);
    if (activeChat !== 'current') saveMessages(activeChat, []);
    // Keep the same chat tab, but drop the bound server session
    setSessionId(undefined);
    try { localStorage.removeItem('session_id'); } catch {}
    setChats(prev => prev.map(c => c.id === activeChat ? { ...c, session_id: undefined, preview: '' } : c));
  };

  const handleReuseChat = (chatId: string) => {
    const msgs = loadMessages(chatId);
    const firstUser = msgs.find(m => m.sender === 'user');
    const seed = firstUser?.content || '';
    // start a fresh chat with same first prompt prefilled
    handleNewChat();
    setPrefill(seed);
    // focus and allow user to edit or hit send
  };

  const handleDuplicateChat = (chatId: string) => {
    const msgs = loadMessages(chatId);
    const newId = `chat-${Date.now()}`;
    const original = chats.find(c => c.id === chatId);
    const dupChat = {
      id: newId,
      title: (original?.title || 'Duplicated Chat') + ' (copy)',
      timestamp: nowLabel(),
      preview: original?.preview || '',
      session_id: undefined, // new independent session
    };
    setChats(prev => [dupChat, ...prev]);
    saveMessages(newId, msgs);
    setActiveChat(newId);
    setMessages(msgs);
    setSessionId(undefined);
    try { localStorage.removeItem('session_id'); } catch {}
  };
  const [chats, setChats] = useState<Chat[]>(() => {
    try {
      const raw = localStorage.getItem('cc_chats');
      return raw ? (JSON.parse(raw) as Chat[]) : [];
    } catch {
      return [];
    }
  });
  const [activeChat, setActiveChat] = useState<string>(() => {
    try {
      return localStorage.getItem('cc_active_chat') || 'current';
    } catch {
      return 'current';
    }
  });

  // Persist user preference for sidebar open/close
  useEffect(() => {
    try { localStorage.setItem('cc_sidebar_open', sidebarOpen ? '1' : '0'); } catch {}
  }, [sidebarOpen]);

  // Ensure sidebar stays hidden on mobile (viewport < 1024)
  useEffect(() => {
    const enforceMobileHidden = () => {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    };
    enforceMobileHidden();
    window.addEventListener('resize', enforceMobileHidden);
    return () => window.removeEventListener('resize', enforceMobileHidden);
  }, []);

  // Persist chats and active chat id
  useEffect(() => {
    try { localStorage.setItem('cc_chats', JSON.stringify(chats)); } catch {}
  }, [chats]);
  useEffect(() => {
    try { localStorage.setItem('cc_active_chat', activeChat); } catch {}
  }, [activeChat]);

  const saveMessages = (chatId: string, msgs: Message[]) => {
    try {
      localStorage.setItem(`chat_${chatId}`, JSON.stringify(msgs));
      // Also update the current chat messages if this is the active chat
      if (chatId === activeChat) {
        localStorage.setItem('current_chat_messages', JSON.stringify(msgs));
      }
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

  const loadMessages = (chatId: string): Message[] => {
    try {
      const saved = localStorage.getItem(`chat_${chatId}`);
      const loadedMessages = saved ? JSON.parse(saved) : [];
      
      // If loading the current chat, update the messages state
      if (chatId === activeChat) {
        setMessages(loadedMessages);
      }
      
      return loadedMessages;
    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    }
  };

  const nowLabel = () => new Date().toLocaleString();
  const previewFrom = (text: string) => text.replace(/\s+/g, ' ').slice(0, 120);

  const handleSendMessage = async (content: string) => {
    const text = content.trim();
    if (!text) return;

    // Hide sidebar while chatting
    setSidebarOpen(false);

    // Append user message
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      content: text,
      sender: 'user',
      timestamp: new Date().toISOString(),
    };
    // Bot placeholder (streaming)
    const botId = `msg-${Date.now() + 1}`;
    const botMsg: Message = {
      id: botId,
      content: '',
      sender: 'bot',
      timestamp: new Date().toISOString(),
      streaming: true,
    };

    setMessages((prev) => {
      const next = [...prev, userMsg, botMsg];
      if (activeChat !== 'current') saveMessages(activeChat, next);
      return next;
    });

    // Streaming via backend memory (session_id)
    const controller = new AbortController();
    setAbortCtrl(controller);
    setIsTyping(true);

    try {
      const { session_id: newSession, text: fullText } = await streamChat(text, {
        session_id: sessionId,
        apiKey,
        signal: controller.signal,
        model: (selectedModel || DEFAULT_MODEL),
        showThinkingSummary: showThinking,
        onChunk: (chunk) => {
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex((m) => m.id === botId);
            if (idx !== -1) {
              next[idx] = { ...next[idx], content: next[idx].content + chunk };
            }
            if (activeChat !== 'current') saveMessages(activeChat, next);
            return next;
          });
        },
      });

      // Persist session id for context
      if (!sessionId && newSession) {
        setSessionId(newSession);
        try { localStorage.setItem('session_id', newSession); } catch {}
        setChats((prev) => prev.map((c) => (c.id === activeChat ? { ...c, session_id: newSession } : c)));
      }

      // Finalize bot message
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === botId ? { ...m, streaming: false } : m));
        if (activeChat !== 'current') saveMessages(activeChat, next);
        return next;
      });

      // Update chat preview/title
      setChats((prev) => prev.map((c) => {
        if (c.id !== activeChat) return c;
        const firstLine = (fullText || '').split('\n')[0].trim();
        const newTitle = c.title === 'New Chat' || !c.title?.trim() ? (firstLine.slice(0, 40) || c.title) : c.title;
        return {
          ...c,
          title: newTitle,
          preview: previewFrom(fullText || ''),
          timestamp: nowLabel(),
          session_id: newSession || c.session_id,
        };
      }));
    } catch (e: any) {
      const aborted = e?.name === 'AbortError';
      const errText = aborted ? 'Generation stopped.' : `Error: ${e?.message || 'Failed to get response'}`;
      if (!aborted) toast.error(e?.message || 'Failed to get response');
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === botId ? { ...m, streaming: false, content: errText } : m));
        if (activeChat !== 'current') saveMessages(activeChat, next);
        return next;
      });
    } finally {
      setIsTyping(false);
      setAbortCtrl(null);
    }
  };

// (cleaned duplicate/broken block removed)

  const handleStop = () => {
    try { abortCtrl?.abort(); } catch {}
  };

  const handleRegenerate = () => {
    if (isTyping) return;
    // Find last user message
    const lastUser = [...messages].reverse().find(m => m.sender === 'user');
    if (!lastUser) return;
    handleSendMessage(lastUser.content);
  };


  const handleNewChat = () => {
    const newId = `chat-${Date.now()}`;
    setActiveChat(newId);
    const newChat: Chat = { id: newId, title: 'New Chat', timestamp: nowLabel(), preview: '' };
    setChats(prev => [newChat, ...prev]);
    setMessages([]);
    setSessionId(undefined);
    try { localStorage.removeItem('session_id'); } catch {}
    // Respect user preference: do not auto-close sidebar
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChat(chatId);
    const msgs = loadMessages(chatId);
    setMessages(msgs);
    const selected = chats.find(c => c.id === chatId);
    const sess = selected?.session_id;
    setSessionId(sess);
    try {
      if (sess) localStorage.setItem('session_id', sess);
      else localStorage.removeItem('session_id');
    } catch {}
    // Respect user preference: do not auto-close sidebar
  };

  const handleSuggestionClick = (text: string) => {
    // If currently in welcome screen with 'current', start a new chat
    if (activeChat === 'current') {
      handleNewChat();
      // defer send to next tick so activeChat updates
      setTimeout(() => handleSendMessage(text), 0);
    } else {
      handleSendMessage(text);
    }
    // Hide sidebar when user initiates via suggestion
    setSidebarOpen(false);
  };

  return (
    <div className="h-[100dvh] sm:h-screen flex overflow-hidden bg-white">

      {/* Main Layout */}
      <div className="flex w-full relative z-10 min-h-0">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          onNewChat={handleNewChat}
          chats={chats}
          activeChat={activeChat}
          onSelectChat={handleSelectChat}
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
          onReuseChat={handleReuseChat}
          onDuplicateChat={handleDuplicateChat}
          onClearMemory={handleClearMemory}
          showThinking={showThinking}
          onToggleShowThinking={setShowThinking}
          currentModel={selectedModel || DEFAULT_MODEL}
          onChangeModel={handleModelChange}
        />

        {/* Main Chat Area */}
        <motion.main
          className="flex-1 flex flex-col min-w-0 min-h-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <ChatArea
            messages={messages}
            isTyping={isTyping}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            sidebarOpen={sidebarOpen}
            onSuggestionClick={handleSuggestionClick}
            onNewChat={handleNewChat}
            modelBadge={selectedModel || DEFAULT_MODEL}
          />
          
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={isTyping}
            prefill={prefill}
            isTyping={isTyping}
            onStop={handleStop}
            onRegenerate={handleRegenerate}
          />
        </motion.main>
      </div>

      
    </div>
  );
}