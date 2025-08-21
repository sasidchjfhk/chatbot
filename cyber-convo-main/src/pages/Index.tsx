import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Background3D from '@/components/Background3D';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import ChatInput from '@/components/ChatInput';
import { sendChat, streamChat, webSearch, type WebResult } from '@/lib/api';

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
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cc_sidebar_open');
      if (saved !== null) return saved === '1';
    } catch {}
    // Default: open on desktop, closed on small screens
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [prefill, setPrefill] = useState<string | undefined>(undefined);
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

  // Ensure sidebar starts opened now (user request). Users can still hide it; preference will persist.
  useEffect(() => {
    setSidebarOpen(true);
  }, []);

  // Persist chats and active chat id
  useEffect(() => {
    try { localStorage.setItem('cc_chats', JSON.stringify(chats)); } catch {}
  }, [chats]);
  useEffect(() => {
    try { localStorage.setItem('cc_active_chat', activeChat); } catch {}
  }, [activeChat]);

  const saveMessages = (chatId: string, msgs: Message[]) => {
    try { localStorage.setItem(`cc_chat_messages_${chatId}`, JSON.stringify(msgs)); } catch {}
  };
  const loadMessages = (chatId: string): Message[] => {
    try {
      const raw = localStorage.getItem(`cc_chat_messages_${chatId}`);
      return raw ? (JSON.parse(raw) as Message[]) : [];
    } catch { return []; }
  };

  const nowLabel = () => new Date().toLocaleString();
  const previewFrom = (text: string) => text.replace(/\s+/g, ' ').slice(0, 120);

  const handleSendMessage = async (content: string) => {
    const text = content.trim();
    if (!text) return;

    // Determine if this is a /search and prepare a user-visible display text without JSON/code blocks
    const searchMatchEarly = text.match(/^\s*\/search\s+(.+)/i);
    const stripCodeFences = (t: string) => t.replace(/```[\s\S]*?```/g, '[omitted]');
    const displayText = searchMatchEarly
      ? `Search: ${searchMatchEarly[1].trim()}`
      : stripCodeFences(text);

    const userMessage: Message = {
      id: Date.now().toString(),
      content: displayText,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Append user message first
    setMessages(prev => {
      const next = [...prev, userMessage];
      if (activeChat !== 'current') saveMessages(activeChat, next);
      return next;
    });

    // Ensure a chat exists in list for this conversation
    if (activeChat === 'current') {
      const newId = `chat-${Date.now()}`;
      setActiveChat(newId);
      const title = userMessage.content.split('\n')[0].slice(0, 40) || 'New Chat';
      const newChat: Chat = { id: newId, title, timestamp: nowLabel(), preview: previewFrom(userMessage.content) };
      setChats(prev => [newChat, ...prev]);
    } else {
      setChats(prev => prev.map(c => c.id === activeChat ? {
        ...c,
        title: c.title && c.title !== 'New Chat' ? c.title : (userMessage.content.split('\n')[0].slice(0, 40) || 'New Chat'),
        preview: previewFrom(userMessage.content),
        timestamp: nowLabel(),
      } : c));
    }

    // Create a streaming bot message placeholder
    const botId = (Date.now() + 1).toString();
    const initialBot: Message = {
      id: botId,
      content: '',
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      streaming: true,
    };
    setMessages(prev => {
      const next = [...prev, initialBot];
      if (activeChat !== 'current') saveMessages(activeChat, next);
      return next;
    });

    // Build final text with optional web search context
    let finalText = text;
    const searchMatch = text.match(/^\s*\/search\s+(.+)/i);
    if (searchMatch) {
      const query = searchMatch[1].trim();
      try {
        const results = await webSearch(query, 5);
        const header = `Web search results for: ${query}\n\n`;
        const formatted = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content.slice(0, 400)}...`).join('\n\n');
        const guidance = `\n\nUse the results above to answer. Cite sources like [1], [2]. If info is insufficient, say so.\n\n`;
        finalText = `${header}${formatted}${guidance}Question: ${query}`;
      } catch {
        // If search fails, proceed with original text (without the /search prefix)
        finalText = searchMatch[1].trim();
      }
    }

    try {
      setIsTyping(true);
      const { session_id: newSession, text: fullText } = await streamChat(finalText, {
        session_id: sessionId,
        system_prompt: undefined,
        apiKey,
        onChunk: (chunk) => {
          setMessages(prev => {
            const next = [...prev];
            const idx = next.findIndex(m => m.id === botId);
            if (idx !== -1) {
              next[idx] = { ...next[idx], content: next[idx].content + chunk };
            }
            if (activeChat !== 'current') saveMessages(activeChat, next);
            return next;
          });
        },
      });

      if (!sessionId && newSession) {
        setSessionId(newSession);
        try { localStorage.setItem('session_id', newSession); } catch {}
        setChats(prev => prev.map(c => c.id === activeChat ? { ...c, session_id: newSession } : c));
      }

      // Finalize the bot message (stop streaming)
      setMessages(prev => {
        const next = prev.map(m => m.id === botId ? { ...m, streaming: false } : m);
        if (activeChat !== 'current') saveMessages(activeChat, next);
        return next;
      });

      // Update chat preview from assistant reply
      setChats(prev => prev.map(c => c.id === activeChat ? {
        ...c,
        preview: previewFrom(fullText || ''),
        timestamp: nowLabel(),
        session_id: newSession || c.session_id,
      } : c));
    } catch (e: any) {
      const errText = `Error: ${e?.message || 'Failed to get response'}`;
      setMessages(prev => {
        const next = prev.map(m => m.id === botId ? { ...m, streaming: false, content: errText } : m);
        if (activeChat !== 'current') saveMessages(activeChat, next);
        return next;
      });
    } finally {
      setIsTyping(false);
    }
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
  };

  return (
    <div className="h-screen flex overflow-hidden relative">
      {/* 3D Background */}
      <Background3D />

      {/* Main Layout */}
      <div className="flex w-full relative z-10">
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
        />

        {/* Main Chat Area */}
        <motion.main
          className="flex-1 flex flex-col min-w-0"
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
          />
          
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={isTyping}
            prefill={prefill}
            isTyping={isTyping}
          />
        </motion.main>
      </div>

      {/* Loading overlay for initial animation */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="fixed inset-0 bg-background z-50 flex items-center justify-center pointer-events-none"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <motion.div
            className="relative w-16 h-16 mx-auto mb-4"
            animate={{ scale: [1, 1.05, 1], filter: ['brightness(1)', 'brightness(1.2)', 'brightness(1)'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* Pulsing ring */}
            <motion.span
              className="absolute inset-0 -m-1 rounded-full"
              style={{ boxShadow: '0 0 0 0 rgba(99,102,241,0.35)' }}
              animate={{ boxShadow: ['0 0 0 0 rgba(99,102,241,0.35)', '0 0 0 16px rgba(99,102,241,0)', '0 0 0 0 rgba(99,102,241,0)'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
            <div className="w-full h-full border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </motion.div>
          <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <span>Initializing Swea Chat</span>
            <motion.span className="h-1.5 w-1.5 rounded-full bg-current" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.9, repeat: Infinity }} />
            <motion.span className="h-1.5 w-1.5 rounded-full bg-current" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.9, repeat: Infinity, delay: 0.15 }} />
            <motion.span className="h-1.5 w-1.5 rounded-full bg-current" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.9, repeat: Infinity, delay: 0.3 }} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}