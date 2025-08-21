import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, Paperclip, Sparkles, Search as SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadFiles, type UploadedFile } from '@/lib/api';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  prefill?: string;
  isTyping?: boolean;
}

export default function ChatInput({ onSendMessage, disabled, prefill, isTyping }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showRocket, setShowRocket] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);

  // Apply prefill from parent when it changes
  useEffect(() => {
    if (typeof prefill === 'string' && prefill.length > 0) {
      setMessage(prefill);
      // focus at end
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        const el = inputRef.current;
        if (el) {
          el.selectionStart = el.selectionEnd = prefill.length;
        }
      });
    }
  }, [prefill]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      setShowRocket(true);
      // Append attachment URLs to the outgoing message
      const attachmentText = attachments.length
        ? '\n\nAttachments:\n' + attachments.map(a => `- ${a.url}`).join('\n')
        : '';
      onSendMessage((message.trim() + attachmentText).trim());
      setMessage('');
      setAttachments([]);
      
      // Reset rocket animation
      setTimeout(() => setShowRocket(false), 800);
    }
  };

  const handleSearchPrefill = () => {
    if (disabled) return;
    const prefix = '/search ';
    const trimmed = message.trim();
    if (!trimmed) {
      setMessage(prefix);
      inputRef.current?.focus();
      // place cursor at end
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) el.selectionStart = el.selectionEnd = prefix.length;
      });
      return;
    }
    if (!trimmed.toLowerCase().startsWith('/search ')) {
      const next = `${prefix}${trimmed}`;
      setMessage(next);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) el.selectionStart = el.selectionEnd = next.length;
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleThinkingClick = () => {
    if (disabled) return;
    if (!message.trim()) {
      setMessage('Think: ');
      inputRef.current?.focus();
      // subtle pulse to hint
      setIsThinking(true);
      setTimeout(() => setIsThinking(false), 700);
      return;
    }
    setIsThinking(true);
    const attachmentText = attachments.length
      ? '\n\nAttachments:\n' + attachments.map(a => `- ${a.url}`).join('\n')
      : '';
    const thinkPrefix = 'Please think step-by-step and be concise.\n\n';
    onSendMessage((thinkPrefix + message.trim() + attachmentText).trim());
    setMessage('');
    setAttachments([]);
    setTimeout(() => setIsThinking(false), 900);
  };

  const toggleRecording = () => {
    if (isRecording) {
      try { recognitionRef.current?.stop(); } catch {}
      setIsRecording(false);
      return;
    }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setMessage(prev => (prev ? prev + ' ' : '') + transcript.trim());
    };
    recognition.onerror = () => {
      try { recognition.stop(); } catch {}
      setIsRecording(false);
    };
    recognition.onend = () => {
      setIsRecording(false);
    };
    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      const uploaded = await uploadFiles(files);
      setAttachments(prev => [...prev, ...uploaded]);
    } catch (err: any) {
      alert(err?.message || 'Failed to upload files');
    } finally {
      // Reset value so selecting the same file again triggers change
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="sticky bottom-0 p-3 sm:p-4 glass border-t border-glass-border/20"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-end gap-2 sm:gap-3">
            {/* Voice Input Button */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleRecording}
                className={`
                  btn-cyber h-10 w-10 sm:h-12 sm:w-12 p-0 relative overflow-hidden
                  ${isRecording ? 'border-destructive text-destructive' : ''}
                `}
              >
                <Mic className="h-4 w-4" />
                {isRecording && (
                  <motion.div
                    className="absolute inset-0 bg-destructive/20 rounded-lg"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </Button>
            </motion.div>

            {/* Main Input Area */}
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                disabled={disabled}
                rows={1}
                className="
                  w-full input-cyber resize-none rounded-2xl pl-4 pr-14 py-3
                  focus:ring-2 focus:ring-primary/50 focus:border-primary
                  placeholder:text-muted-foreground
                  disabled:opacity-50 disabled:cursor-not-allowed
                  min-h-[48px] max-h-32
                "
                style={{
                  height: 'auto',
                  minHeight: '48px',
                  maxHeight: '128px'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                }}
              />

              {/* Attachment Button */}
              <motion.div 
                className="absolute right-14 top-2 sm:top-3"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <div className="relative">
                  {isTyping && (
                    <motion.span
                      className="absolute inset-0 -m-1 rounded-full z-10"
                      style={{ boxShadow: '0 0 0 0 rgba(99,102,241,0.35)' }}
                      animate={{ boxShadow: ['0 0 0 0 rgba(99,102,241,0.35)', '0 0 0 12px rgba(99,102,241,0)', '0 0 0 0 rgba(99,102,241,0)'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAttachClick}
                    disabled={disabled}
                    className={`w-6 h-6 p-0 relative ${isTyping ? 'ring-1 ring-primary/40' : ''} text-muted-foreground hover:text-primary`}
                    aria-label={isTyping ? 'AI is responding' : 'Attach files'}
                    title={isTyping ? 'AI is responding' : undefined}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.md,.doc,.docx,.ppt,.pptx"
                  className="hidden"
                  onChange={handleFilesSelected}
                />
              </motion.div>

              {/* Thinking Button */}
              <motion.div
                className="absolute right-28 top-2 hidden sm:block"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="relative">
                  {isTyping && (
                    <motion.span
                      className="absolute inset-0 -m-1 rounded-full z-10"
                      style={{ boxShadow: '0 0 0 0 rgba(99,102,241,0.35)' }}
                      animate={{ boxShadow: ['0 0 0 0 rgba(99,102,241,0.35)', '0 0 0 12px rgba(99,102,241,0)', '0 0 0 0 rgba(99,102,241,0)'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleThinkingClick}
                    disabled={disabled}
                    className={`
                      h-8 w-8 p-0 rounded-full relative overflow-hidden text-muted-foreground hover:text-primary
                      ${isTyping ? 'ring-1 ring-primary/40' : ''}
                    `}
                    aria-label={isTyping ? 'AI is responding' : 'Thinking assist'}
                    title={isTyping ? 'AI is responding' : undefined}
                  >
                    <Sparkles className="h-4 w-4" />
                    {isThinking && (
                      <>
                        <motion.span
                          className="absolute inset-0 rounded-full"
                          style={{ background: 'radial-gradient(closest-side, rgba(99,102,241,0.35), transparent)' }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [0.2, 0.6, 0.2] }}
                          transition={{ duration: 0.9, repeat: Infinity }}
                        />
                        <motion.span
                          className="absolute inset-0 rounded-full border border-primary/40"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                        />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>

              {/* Search Prefill Button */}
              <motion.div
                className="absolute right-40 top-2 hidden sm:block"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="relative">
                  {isTyping && (
                    <motion.span
                      className="absolute inset-0 -m-1 rounded-full z-10"
                      style={{ boxShadow: '0 0 0 0 rgba(99,102,241,0.35)' }}
                      animate={{ boxShadow: ['0 0 0 0 rgba(99,102,241,0.35)', '0 0 0 12px rgba(99,102,241,0)', '0 0 0 0 rgba(99,102,241,0)'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSearchPrefill}
                    disabled={disabled}
                    className={`h-8 w-8 p-0 rounded-full relative ${isTyping ? 'ring-1 ring-primary/40' : ''} text-muted-foreground hover:text-primary`}
                    aria-label={isTyping ? 'AI is responding' : 'Web search'}
                    title={isTyping ? 'AI is responding' : undefined}
                  >
                    <SearchIcon className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>

              {/* Send Button */}
              <div className="absolute right-2 top-2">
                <AnimatePresence mode="wait">
                  {!showRocket ? (
                    <motion.div
                      key="send-button"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      <motion.div
                        className="relative"
                        animate={isTyping ? { scale: [1, 1.05, 1], filter: ['brightness(1)', 'brightness(1.2)', 'brightness(1)'] } : {}}
                        transition={isTyping ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : {}}
                      >
                        {/* Pulsing ring when typing */}
                        {isTyping && (
                          <motion.span
                            className="absolute inset-0 -m-1 rounded-full z-10"
                            style={{ boxShadow: '0 0 0 0 rgba(99,102,241,0.4)' }}
                            animate={{ boxShadow: ['0 0 0 0 rgba(99,102,241,0.35)', '0 0 0 8px rgba(99,102,241,0)', '0 0 0 0 rgba(99,102,241,0)'] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                          />
                        )}
                        <Button
                          type="submit"
                          disabled={!message.trim() || disabled}
                          className={`
                            btn-cyber h-8 w-8 p-0 rounded-full relative
                            ${isTyping ? 'overflow-visible ring-2 ring-primary/40 shadow-[0_0_16px_rgba(99,102,241,0.35)]' : 'overflow-hidden'}
                            ${isTyping ? '' : 'disabled:opacity-50 disabled:cursor-not-allowed'}
                            hover:shadow-lg hover:shadow-primary/25
                          `}
                          aria-label={isTyping ? 'AI is responding' : 'Send message'}
                          title={isTyping ? 'AI is responding' : undefined}
                        >
                          {isTyping ? (
                            <div className="flex items-center justify-center gap-0.5 text-primary">
                              <motion.span className="h-2 w-2 rounded-full bg-current" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.9, repeat: Infinity }} />
                              <motion.span className="h-2 w-2 rounded-full bg-current" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.9, repeat: Infinity, delay: 0.15 }} />
                              <motion.span className="h-2 w-2 rounded-full bg-current" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.9, repeat: Infinity, delay: 0.3 }} />
                            </div>
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </motion.div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="rocket"
                      initial={{ opacity: 1, scale: 1 }}
                      animate={{
                        y: [-0, -100, -200],
                        rotateZ: [0, 45, 90],
                        scale: [1, 0.8, 0.5],
                        opacity: [1, 1, 0]
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-8 w-8 flex items-center justify-center"
                    >
                      <div className="text-primary">🚀</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <span
                  key={a.stored_name}
                  className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
                  title={a.name}
                >
                  {a.name}
                </span>
              ))}
            </div>
          )}

          {/* Character count (optional) */}
          {message.length > 100 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-muted-foreground text-right mt-1"
            >
              {message.length}/1000
            </motion.div>
          )}
        </form>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="hidden sm:flex gap-2 mt-3 flex-wrap"
        >
          {['Explain', 'Summarize', 'Code', 'Creative'].map((action) => (
            <Button
              key={action}
              variant="ghost"
              size="sm"
              onClick={() => setMessage(`${action}: `)}
              className="text-xs glass border border-glass-border/30 hover:border-primary/50 hover:text-primary"
            >
              {action}
            </Button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}